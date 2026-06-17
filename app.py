"""
File Nest - Smart File Sorter
Flask Backend Application
app.py

Database - Supabase (users, folders, files)
Authentication - Supabase Auth
"""

import hashlib
import hmac
import json
import os
import posixpath
import re
import threading
import uuid
from functools import wraps
from datetime import datetime, timezone, timedelta

from dotenv import load_dotenv
load_dotenv()

from flask import (
    Flask, render_template, request, redirect,
    url_for, session, jsonify, send_from_directory, abort
)
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_limiter.errors import RateLimitExceeded
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.utils import secure_filename

from database import init_db, get_db, close_db, _filter as pg_filter
from supabase_auth import (
    sign_in,
    sign_up,
    sign_out,
    get_auth_user,
    update_user_email,
    update_user_password,
    admin_update_user_password,
    admin_delete_user,
    update_user_metadata,
    reset_password_for_email,
)

from storage import make_storage_path, upload_file, download_file, create_signed_url, delete_files

# Application setup: Flask, upload limits, session lifetime, and rate limiting.
app = Flask(__name__)
app.secret_key = os.getenv('FLASK_SECRET_KEY', 'filenest-secret-key-change-in-production')

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
ICONS_FOLDER = os.path.join(os.path.dirname(__file__), 'icons-pack')

ALLOWED_EXTENSIONS = {
    'pdf', 'docx', 'doc', 'xlsx', 'xls',
    'pptx', 'ppt', 'txt',
    'jpg', 'jpeg', 'png',
    'mp3', 'mp4',
    'zip', 'csv',
}
BROWSER_PREVIEW_EXTENSIONS = {'pdf', 'txt', 'csv', 'jpg', 'jpeg', 'png', 'gif', 'mp3', 'mp4'}

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50 MB
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=30)
SESSION_TIMEOUT = timedelta(minutes=30)
STORAGE_LIMIT_BYTES = 5 * 1024 * 1024 * 1024
DEFAULT_FOLDER_EMOJI = '📁'
IMPORTANT_FOLDER_NAME = 'Important Folder'
IMPORTANT_FOLDER_EMOJI = '🚩'
IMPORTANT_FOLDER_COLOR = '#e87a7a'
IMPORTANT_FOLDER_BG = '#fde8e8'

LOGIN_MAX_FAILED_ATTEMPTS = 3
LOGIN_LOCKOUT_DURATION = timedelta(hours=24)
LOGIN_ATTEMPTS_FILE = os.path.join(app.instance_path, 'login_attempts.json')
ANALYZE_REQUEST_DIR = os.path.join(UPLOAD_FOLDER, '.analyze_requests')
ANALYZE_REQUEST_LOCK = threading.Lock()


class DuplicateFileError(Exception):
    pass


os.makedirs(app.instance_path, exist_ok=True)
os.makedirs(ANALYZE_REQUEST_DIR, exist_ok=True)

# Rate limiting configuration
limiter = Limiter(
    key_func=lambda: session.get("user_id") or get_remote_address(),
    app=app,
    default_limits=["2000 per day", "300 per hour"],
)
app.teardown_appcontext(close_db)


@app.route('/icons-pack/<path:filename>')
@limiter.exempt
def icons_pack(filename):
    safe_filename = posixpath.normpath(filename.replace('\\', '/')).lstrip('/')
    if safe_filename == '..' or safe_filename.startswith('../'):
        abort(404)
    return send_from_directory(ICONS_FOLDER, safe_filename)


@app.errorhandler(RequestEntityTooLarge)
def handle_file_too_large(error):
    max_mb = app.config['MAX_CONTENT_LENGTH'] // (1024 * 1024)
    return jsonify({
        'success': False,
        'message': f'File exceeded the maximum upload size of {max_mb} MB.',
    }), 413


@app.errorhandler(RateLimitExceeded)
def handle_rate_limit(error):
    message = 'Too many requests. Try again later.'
    if request.endpoint == 'index' and request.method == 'POST':
        message = 'Too many login attempts. Try again in 5 minutes.'
    if request.endpoint in {'forgot_password', 'change_password_email'}:
        message = 'Too many reset email requests. Try again later.'
    if request.endpoint == 'api_analyze':
        cancel_analyze_request(session.get('user_id'))
    return jsonify({
        'success': False,
        'message': message,
    }), 429


@app.after_request
def add_security_headers(response):
    response.headers.setdefault('X-Content-Type-Options', 'nosniff')
    response.headers.setdefault('X-Frame-Options', 'DENY')
    response.headers.setdefault('Referrer-Policy', 'same-origin')
    response.headers.setdefault('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    expires_at = current_session_expires_at()
    if expires_at:
        response.headers['X-Session-Expires-At'] = expires_at.isoformat()
    if request.endpoint in {'landing', 'index', 'index_html', 'dashboard', 'logout', 'reset_page', 'reset_password_html', 'update_password_page', 'change_password_page', 'change_password_html'}:
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
    return response

def now_utc():
    return datetime.now(timezone.utc)


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def clean_display_filename(filename):
    name = os.path.basename(str(filename or '')).replace('\x00', '').strip()
    name = re.sub(r'[\r\n\t/\\]+', ' ', name)
    name = re.sub(r'\s+', ' ', name)
    name = re.sub(r'\s+([.])', r'\1', name).strip(' .')
    return name[:160]


def safe_storage_filename(filename):
    safe_name = secure_filename(filename or '')
    if safe_name:
        return safe_name
    return f'file_{uuid.uuid4().hex}'


def password_validation_message(password):
    password = str(password or '')
    missing = []
    if len(password) < 8:
        missing.append('at least 8 characters')
    if not any(ch.isupper() for ch in password):
        missing.append('one uppercase letter')
    if not any(ch.islower() for ch in password):
        missing.append('one lowercase letter')
    if not any(ch.isdigit() for ch in password):
        missing.append('one number')
    if not any(not ch.isalnum() for ch in password):
        missing.append('one special character')
    if any(ch.isspace() for ch in password):
        missing.append('no spaces')
    return f"Password must include {', '.join(missing)}." if missing else ''


def uploaded_file_size(file_storage):
    pos = file_storage.stream.tell()
    file_storage.stream.seek(0, os.SEEK_END)
    size = file_storage.stream.tell()
    file_storage.stream.seek(pos)
    return size


def uploaded_file_hash(file_storage):
    pos = file_storage.stream.tell()
    file_storage.stream.seek(0)
    digest = hashlib.sha256()
    while True:
        chunk = file_storage.stream.read(1024 * 1024)
        if not chunk:
            break
        digest.update(chunk)
    file_storage.stream.seek(pos)
    return digest.hexdigest()


def is_valid_uuid(value):
    try:
        uuid.UUID(str(value))
        return True
    except (TypeError, ValueError):
        return False


def clear_auth_session():
    session.clear()
    session.modified = True


def current_session_expires_at():
    if 'user_id' not in session or not is_valid_uuid(session.get('user_id')):
        return None
    try:
        last = datetime.fromisoformat(session.get('last_activity', ''))
    except (TypeError, ValueError):
        return None
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    expires_at = last + SESSION_TIMEOUT
    return expires_at if expires_at > now_utc() else None


def session_is_active():
    if 'user_id' not in session or not is_valid_uuid(session.get('user_id')):
        clear_auth_session()
        return False

    if 'last_activity' not in session:
        clear_auth_session()
        return False

    try:
        last = datetime.fromisoformat(session['last_activity'])
    except Exception:
        clear_auth_session()
        return False

    if now_utc() - last > SESSION_TIMEOUT:
        clear_auth_session()
        return False

    return True


def auth_failure(message='Session expired.'):
    if request.accept_mimetypes.accept_html and not request.path.startswith('/api/'):
        return redirect(url_for('index', expired='1'))
    return jsonify({
        'success': False,
        'message': message,
        'expired': True
    }), 401


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session_is_active():
            return auth_failure('Session expired. Please log in again.')
        db = get_db()
        user = ensure_user_profile(db, session.get('user_id'), session.get('access_token', ''))
        if not user:
            clear_auth_session()
            return auth_failure('Session expired. Please log in again.')
        if user_is_deactivated(user):
            clear_auth_session()
            return auth_failure('Account deactivated.')

        # Session management: refresh activity for the sliding timeout window.
        session['last_activity'] = now_utc().isoformat()

        return f(*args, **kwargs)
    return decorated


def get_current_user_id():
    return session.get('user_id')


# Supabase row helpers: keep common PostgREST lookups and inserts in one place.
def first(rows):
    return rows[0] if rows else None


def select_user(db, user_id, select="*"):
    return first(db.select("users", {"id": pg_filter("eq", user_id)}, select))


def profile_from_auth_user(auth_user, fallback_email=""):
    email = (auth_user.get("email") or fallback_email or "").strip()
    metadata = auth_user.get("user_metadata") or {}
    name = str(metadata.get("name") or (email.split("@")[0] if email else "") or "User").strip()
    return name, email


def ensure_user_profile(db, user_id, access_token=""):
    user = select_user(db, user_id)
    if user:
        return user

    auth_user = get_auth_user(access_token)
    if auth_user.get("error") or auth_user.get("msg") or str(auth_user.get("id")) != str(user_id):
        return None

    name, email = profile_from_auth_user(auth_user)
    if not email:
        return None

    try:
        db.insert("users", {"id": user_id, "name": name, "email": email})
        db.commit()
    except RuntimeError as exc:
        if "duplicate key" not in str(exc) and "23505" not in str(exc):
            raise

    user = select_user(db, user_id)
    if user:
        ensure_important_default_folder(db, user_id)
    return user


def user_is_deactivated(user):
    return bool(user and user.get("is_deactivated"))


def is_missing_deactivation_columns(exc):
    message = str(exc)
    return (
        ("is_deactivated" in message or "deactivated_at" in message)
        and (
            "42703" in message
            or "column users.is_deactivated does not exist" in message
            or "column users.deactivated_at does not exist" in message
            or ("PGRST204" in message and "schema cache" in message)
        )
    )


def select_user_with_deactivated_at(db, user_id):
    try:
        return select_user(db, user_id, "id,is_deactivated,deactivated_at")
    except RuntimeError as exc:
        if is_missing_deactivation_columns(exc):
            return select_user(db, user_id, "id")
        raise


def select_folder(db, folder_id, user_id, select="*"):
    return first(db.select(
        "folders",
        {"id": pg_filter("eq", folder_id), "user_id": pg_filter("eq", user_id)},
        select,
    ))


def select_default_folder(db, user_id, select="*"):
    return first(db.select(
        "folders",
        {"user_id": pg_filter("eq", user_id), "is_default": pg_filter("eq", True)},
        select,
    ))


def ensure_important_default_folder(db, user_id):
    default_folder = select_default_folder(db, user_id, "id,name")
    existing_important = first(db.select(
        "folders",
        {
            "user_id": pg_filter("eq", user_id),
            "name": pg_filter("eq", IMPORTANT_FOLDER_NAME),
        },
        "id,is_default",
    ))

    if not default_folder:
        if existing_important:
            update_folder_compat(db, existing_important["id"], user_id, {
                "emoji": IMPORTANT_FOLDER_EMOJI,
                "color": IMPORTANT_FOLDER_COLOR,
                "bg": IMPORTANT_FOLDER_BG,
                "is_default": True,
                "updated_at": now_utc().isoformat(),
            })
            db.commit()
            return

        create_folder_record(
            db,
            user_id,
            IMPORTANT_FOLDER_NAME,
            IMPORTANT_FOLDER_EMOJI,
            IMPORTANT_FOLDER_COLOR,
            IMPORTANT_FOLDER_BG,
            True,
            False,
        )
        db.commit()
        return

    if existing_important and str(existing_important.get("id")) != str(default_folder["id"]):
        update_folder_compat(db, default_folder["id"], user_id, {
            "is_default": False,
            "updated_at": now_utc().isoformat(),
        })
        update_folder_compat(db, existing_important["id"], user_id, {
            "emoji": IMPORTANT_FOLDER_EMOJI,
            "color": IMPORTANT_FOLDER_COLOR,
            "bg": IMPORTANT_FOLDER_BG,
            "is_default": True,
            "updated_at": now_utc().isoformat(),
        })
        db.commit()
        return

    if str(default_folder.get("name") or "") != IMPORTANT_FOLDER_NAME:
        update_folder_compat(db, default_folder["id"], user_id, {
            "name": IMPORTANT_FOLDER_NAME,
            "emoji": IMPORTANT_FOLDER_EMOJI,
            "color": IMPORTANT_FOLDER_COLOR,
            "bg": IMPORTANT_FOLDER_BG,
            "updated_at": now_utc().isoformat(),
        })
        db.commit()


def update_folder_compat(db, folder_id, user_id, payload):
    try:
        return db.update(
            "folders",
            {"id": pg_filter("eq", folder_id), "user_id": pg_filter("eq", user_id)},
            payload,
        )
    except RuntimeError as exc:
        if "updated_at" not in payload or not is_folder_updated_at_schema_error(exc):
            raise
        payload = dict(payload)
        payload.pop("updated_at", None)
        return db.update(
            "folders",
            {"id": pg_filter("eq", folder_id), "user_id": pg_filter("eq", user_id)},
            payload,
        )


def is_folder_duplicate_name_error(exc):
    message = str(exc).lower()
    return (
        "folders_user_id_name_key" in message
        or ("duplicate key" in message and "folders" in message and "name" in message)
        or ("key (user_id, name)" in message and "already exists" in message)
    )


def duplicate_folder_name_response():
    return jsonify({'success': False, 'message': 'A folder with that name already exists.'}), 409


def find_duplicate_folder_name(db, user_id, name, exclude_folder_id=None):
    target_name = str(name or "").strip().lower()
    if not target_name:
        return None

    for item in db.select(
        "folders",
        {"user_id": pg_filter("eq", user_id)},
        "id,name",
    ):
        if exclude_folder_id is not None and int(item.get("id") or 0) == int(exclude_folder_id):
            continue
        if str(item.get("name") or "").strip().lower() == target_name:
            return item
    return None


def select_file(db, file_id, user_id, select="*"):
    return first(db.select(
        "files",
        {"id": pg_filter("eq", file_id), "user_id": pg_filter("eq", user_id)},
        select,
    ))


def create_folder_record(db, user_id, name, emoji, color, bg, is_default=False, pinned=False):
    rows = db.insert("folders", {
        "user_id": user_id,
        "name": name,
        "emoji": emoji,
        "color": color,
        "bg": bg,
        "is_default": bool(is_default),
        "pinned": bool(pinned),
    })
    return first(rows)


def normalize_ai_summary(summary):
    cleaned = re.sub(r"\s+", " ", str(summary or "")).strip()
    words = cleaned.split()
    return " ".join(words[:200])


def is_file_summary_schema_error(exc):
    message = str(exc).lower()
    return "ai_summary" in message and (
        "column" in message or "schema cache" in message or "could not find" in message
    )


def is_file_hash_schema_error(exc):
    message = str(exc).lower()
    return "file_hash" in message and (
        "column" in message or "schema cache" in message or "could not find" in message
    )


def is_file_hash_duplicate_error(exc):
    message = str(exc).lower()
    return (
        "file_hash" in message
        and ("duplicate key" in message or "unique constraint" in message or "idx_files_user_file_hash_unique" in message)
    )


def duplicate_file_response(duplicate):
    name = duplicate.get("original_name") or "an existing file"
    return jsonify({
        "success": False,
        "message": f'This file already exists as "{name}". Upload cancelled to avoid duplicates.',
        "duplicate_file": dict(duplicate),
    }), 409


def duplicate_filename_response(name):
    return jsonify({
        "success": False,
        "message": f'A file named "{name}" already exists. Please choose a different name.',
    }), 409


def find_duplicate_filename(db, user_id, original_name, exclude_file_id=None):
    target_name = str(original_name or "").strip().lower()
    if not target_name:
        return None

    for item in db.select(
        "files",
        {"user_id": pg_filter("eq", user_id)},
        "id,original_name",
    ):
        if exclude_file_id is not None and int(item.get("id") or 0) == int(exclude_file_id):
            continue
        if str(item.get("original_name") or "").strip().lower() == target_name:
            return item
    return None


def find_duplicate_file(db, user_id, original_name, file_size, file_hash=""):
    if file_hash:
        try:
            duplicate = first(db.select(
                "files",
                {"user_id": pg_filter("eq", user_id), "file_hash": pg_filter("eq", file_hash)},
                "id,original_name,folder_id,file_size,file_hash",
            ))
            if duplicate:
                return duplicate
        except RuntimeError as exc:
            if not is_file_hash_schema_error(exc):
                raise

    target_name = str(original_name or "").strip().lower()
    for item in db.select(
        "files",
        {"user_id": pg_filter("eq", user_id), "file_size": pg_filter("eq", file_size)},
        "id,original_name,folder_id,file_size",
    ):
        if str(item.get("original_name") or "").strip().lower() == target_name:
            return item
    return None


def create_file_record(db, user_id, folder_id, original_name, stored_name, extension, file_size, ai_sorted, keywords, ai_summary="", file_hash=""):
    payload = {
        "user_id": user_id,
        "folder_id": folder_id,
        "original_name": original_name,
        "stored_name": stored_name,
        "extension": extension,
        "file_size": file_size,
        "file_hash": file_hash,
        "ai_sorted": bool(ai_sorted),
        "keywords": keywords,
        "ai_summary": normalize_ai_summary(ai_summary),
    }
    while True:
        try:
            rows = db.insert("files", payload)
            break
        except RuntimeError as exc:
            if "ai_summary" in payload and is_file_summary_schema_error(exc):
                payload.pop("ai_summary", None)
                continue
            if "file_hash" in payload and is_file_hash_schema_error(exc):
                payload.pop("file_hash", None)
                continue
            if "file_hash" in payload and is_file_hash_duplicate_error(exc):
                raise DuplicateFileError() from exc
            raise
    return first(rows)


# Folder/file listing helpers: build dashboard-ready rows from Supabase tables.
def get_folder_file_counts(db, user_id):
    counts = {}
    for item in db.select("files", {"user_id": pg_filter("eq", user_id)}, "folder_id"):
        folder_id = item.get("folder_id")
        counts[folder_id] = counts.get(folder_id, 0) + 1
    return counts


def list_folders_with_counts(db, user_id, search=""):
    search = str(search or "").strip().lower()
    counts = get_folder_file_counts(db, user_id)
    rows = []
    for folder in db.select("folders", {"user_id": pg_filter("eq", user_id)}):
        if search and search not in str(folder.get("name") or "").lower():
            continue
        rows.append({**folder, "file_count": counts.get(folder.get("id"), 0)})
    rows.sort(key=lambda row: (-int(bool(row.get("pinned"))), str(row.get("name") or "").lower()))
    return rows


def list_files_with_folder_metadata(db, user_id, folder_id=None, search="", sort="date", created_after=None):
    filters = {"user_id": pg_filter("eq", user_id)}
    if folder_id:
        filters["folder_id"] = pg_filter("eq", folder_id)
    if created_after:
        filters["created_at"] = pg_filter("gte", created_after)

    search = str(search or "").strip().lower()
    folders = {
        row["id"]: row
        for row in db.select("folders", {"user_id": pg_filter("eq", user_id)})
    }
    rows = []
    for item in db.select("files", filters):
        if search and search not in str(item.get("original_name") or "").lower():
            continue
        folder = folders.get(item.get("folder_id"))
        if not folder:
            continue
        rows.append({
            **item,
            "folder_name": folder["name"],
            "folder_emoji": folder["emoji"],
            "folder_color": folder["color"],
            "folder_bg": folder["bg"],
        })

    if sort == "name":
        rows.sort(key=lambda row: str(row.get("original_name") or "").lower())
    elif sort == "type":
        rows.sort(key=lambda row: (str(row.get("extension") or "").lower(), str(row.get("original_name") or "").lower()))
    elif sort == "folder":
        rows.sort(key=lambda row: (str(row.get("folder_name") or "").lower(), str(row.get("original_name") or "").lower()))
    else:
        rows.sort(key=lambda row: str(row.get("created_at") or ""), reverse=True)
    return rows


def get_user_storage_used_bytes(db, user_id):
    total = 0
    for item in db.select("files", {"user_id": pg_filter("eq", user_id)}, "file_size"):
        try:
            total += int(item.get("file_size") or 0)
        except (TypeError, ValueError):
            continue
    return total


def stats_chart_rows(db, user_id):
    counts = get_folder_file_counts(db, user_id)
    rows = [
        {
            "name": folder.get("name", "Untitled"),
            "emoji": folder.get("emoji", DEFAULT_FOLDER_EMOJI),
            "color": folder.get("color", "#e8855a"),
            "count": counts.get(folder.get("id"), 0),
        }
        for folder in db.select("folders", {"user_id": pg_filter("eq", user_id)})
    ]
    rows.sort(key=lambda row: row["count"], reverse=True)
    return rows


# AI analysis request state: token files let newer requests cancel older work.
def get_file_analyzer():
    from nlp_analyzer import analyze_file
    return analyze_file


def begin_analyze_request(user_id):
    token = uuid.uuid4().hex
    path = analyze_request_path(user_id)
    if not path:
        return token
    with ANALYZE_REQUEST_LOCK:
        write_analyze_request_token(path, token)
    return token


def cancel_analyze_request(user_id):
    if not user_id:
        return
    path = analyze_request_path(user_id)
    if not path:
        return
    with ANALYZE_REQUEST_LOCK:
        write_analyze_request_token(path, uuid.uuid4().hex)


def analyze_request_is_current(user_id, token):
    path = analyze_request_path(user_id)
    if not path:
        return False
    with ANALYZE_REQUEST_LOCK:
        return read_analyze_request_token(path) == token


def finish_analyze_request(user_id, token):
    # Begin/cancel overwrite this file atomically. Leaving it in place avoids
    # an old worker deleting a newer worker's token in a multi-process server.
    return None


def analyze_request_path(user_id):
    try:
        safe_user_id = str(uuid.UUID(str(user_id)))
    except (TypeError, ValueError):
        return None
    return os.path.join(ANALYZE_REQUEST_DIR, f"{safe_user_id}.token")


def write_analyze_request_token(path, token):
    tmp_path = f"{path}.{os.getpid()}.{threading.get_ident()}.tmp"
    with open(tmp_path, 'w', encoding='utf-8') as fh:
        fh.write(token)
    os.replace(tmp_path, path)


def read_analyze_request_token(path):
    try:
        with open(path, 'r', encoding='utf-8') as fh:
            return fh.read().strip()
    except OSError:
        return None


# Login lockout persistence: hash email keys before writing attempt state.
def normalize_login_email(email):
    return str(email or '').strip().lower()


def login_attempt_key(email):
    digest = hmac.new(
        str(app.secret_key or '').encode('utf-8'),
        normalize_login_email(email).encode('utf-8'),
        hashlib.sha256,
    ).hexdigest()
    return digest


def login_rate_limit_key():
    data = request.get_json(silent=True) or {}
    email = normalize_login_email(data.get('email'))
    return f"login:{login_attempt_key(email) if email else get_remote_address()}"


def load_login_attempts():
    try:
        with open(LOGIN_ATTEMPTS_FILE, 'r', encoding='utf-8') as fh:
            data = json.load(fh)
            return data if isinstance(data, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return {}


def save_login_attempts(attempts):
    tmp_path = f"{LOGIN_ATTEMPTS_FILE}.{os.getpid()}.{threading.get_ident()}.tmp"
    with open(tmp_path, 'w', encoding='utf-8') as fh:
        json.dump(attempts, fh)
    os.replace(tmp_path, LOGIN_ATTEMPTS_FILE)


def parse_lockout_time(value):
    if not value:
        return None
    try:
        locked_until = datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None
    if locked_until.tzinfo is None:
        locked_until = locked_until.replace(tzinfo=timezone.utc)
    return locked_until


def format_lockout_remaining(locked_until):
    seconds = max(0, int((locked_until - now_utc()).total_seconds()))
    minutes = (seconds + 59) // 60
    hours, minutes = divmod(minutes, 60)
    return f"{hours}h {minutes}m"


def get_login_lockout_message(email):
    attempts = load_login_attempts()
    key = login_attempt_key(email)
    entry = attempts.get(key) or {}
    locked_until = parse_lockout_time(entry.get('locked_until'))

    if not locked_until:
        return ''
    if locked_until <= now_utc():
        attempts.pop(key, None)
        save_login_attempts(attempts)
        return ''

    return f"Account locked. Try again in {format_lockout_remaining(locked_until)}."


def record_failed_login(email):
    attempts = load_login_attempts()
    key = login_attempt_key(email)
    entry = attempts.get(key) or {}

    locked_until = parse_lockout_time(entry.get('locked_until'))
    if locked_until and locked_until > now_utc():
        attempts[key] = entry
        save_login_attempts(attempts)
        return f"Account locked. Try again in {format_lockout_remaining(locked_until)}.", 423

    failed_attempts = int(entry.get('failed_attempts') or 0) + 1
    if failed_attempts >= LOGIN_MAX_FAILED_ATTEMPTS:
        locked_until = now_utc() + LOGIN_LOCKOUT_DURATION
        attempts[key] = {
            'failed_attempts': LOGIN_MAX_FAILED_ATTEMPTS,
            'locked_until': locked_until.isoformat(),
        }
        save_login_attempts(attempts)
        return f"Account locked. Try again in {format_lockout_remaining(locked_until)}.", 423

    attempts[key] = {'failed_attempts': failed_attempts}
    save_login_attempts(attempts)
    remaining = LOGIN_MAX_FAILED_ATTEMPTS - failed_attempts
    return f"Incorrect email or password. {remaining} attempt(s) remaining before lockout.", 401


def clear_failed_logins(email):
    attempts = load_login_attempts()
    key = login_attempt_key(email)
    if key in attempts:
        attempts.pop(key, None)
        save_login_attempts(attempts)


# Authentication and public pages: login, signup, logout, and static pages.
@app.route('/login', methods=['GET', 'POST'])
@limiter.limit(
    "5 per 5 minutes",
    key_func=login_rate_limit_key,
    methods=["POST"],
    deduct_when=lambda response: response.status_code != 423,
)
def index():
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        email = normalize_login_email(data.get('email', ''))
        password = data.get('password', '')

        if not email or not password:
            return jsonify({'success': False, 'message': 'Please fill in all fields.'})

        lockout_message = get_login_lockout_message(email)
        if lockout_message:
            return jsonify({'success': False, 'message': lockout_message}), 423

        auth = sign_in(email, password)
        if not auth.get('access_token') or not auth.get('user'):
            message, status = record_failed_login(email)
            return jsonify({'success': False, 'message': message}), status

        auth_user = auth['user']
        user_id = auth_user['id']
        name = (auth_user.get('user_metadata') or {}).get('name') or email.split('@')[0]
        clear_failed_logins(email)

        db = get_db()
        user = select_user(db, user_id)
        if user_is_deactivated(user):
            try:
                sign_out(auth['access_token'])
            except Exception:
                app.logger.exception('Supabase sign-out failed for deactivated account.')
            return jsonify({'success': False, 'message': 'This account has been deactivated.'}), 403
        if not user:
            db.insert('users', {'id': user_id, 'name': name, 'email': auth_user.get('email') or email})
            db.commit()
            user = select_user(db, user_id)
        ensure_important_default_folder(db, user_id)

        session.clear()
        session['user_id'] = user_id
        session['access_token'] = auth['access_token']
        session['refresh_token'] = auth.get('refresh_token', '')
        session['last_activity'] = now_utc().isoformat()
        session.permanent = True

        return jsonify({
            'success': True,
            'name': user['name'] if user else name,
            'email': auth_user.get('email') or email
        })

    if session_is_active():
        return redirect(url_for('dashboard'))

    return render_template('index.html')

@app.route('/index.html')
def index_html():
    if session_is_active():
        return redirect(url_for('dashboard'))
    return render_template('index.html', token='')

@app.route('/')
def landing():
    return render_template('landing.html')

@app.route('/features')
def features():
    return render_template('features.html')

@app.route('/instructions')
def instructions():
    return render_template('instructions.html')

@app.route('/signup', methods=['POST'])
def signup():
    data = request.get_json(silent=True) or {}

    name     = data.get('name', '').strip()
    email    = data.get('email', '').strip()
    password = data.get('password', '')
    confirm  = data.get('confirm', '')
    terms_accepted = bool(data.get('terms_accepted'))

    if not name or not email or not password:
        return jsonify({'success': False, 'message': 'Please fill in all fields.'})

    if password != confirm:
        return jsonify({'success': False, 'message': 'Passwords do not match.'})

    if not terms_accepted:
        return jsonify({'success': False, 'message': 'Please agree to the Terms and Conditions before creating an account.'})

    password_message = password_validation_message(password)
    if password_message:
        return jsonify({'success': False, 'message': password_message})

    auth = sign_up(email, password, name)
    if auth.get('error') or auth.get('msg'):
        return jsonify({'success': False, 'message': auth.get('msg') or auth.get('error_description') or 'Unable to create account.'})

    auth_user = auth.get('user') or {}
    if not auth_user.get('id'):
        return jsonify({'success': True, 'confirm_email': True})

    db = get_db()
    db.insert('users', {'id': auth_user['id'], 'name': name, 'email': auth_user.get('email') or email})
    db.commit()

    # Signup flow: auto-login when Supabase returns a session immediately.
    if auth.get('access_token'):
        session['user_id'] = auth_user['id']
        session['access_token'] = auth['access_token']
        session['refresh_token'] = auth.get('refresh_token', '')
        session['last_activity'] = now_utc().isoformat()
        session.permanent = True

    # Signup flow: each new account starts with one default folder.
    ensure_important_default_folder(db, auth_user['id'])

    return jsonify({'success': True, 'confirm_email': not bool(auth.get('access_token'))})

@app.route('/logout')
def logout():
    access_token = session.get('access_token')
    if access_token:
        try:
            sign_out(access_token)
        except Exception:
            app.logger.exception('Supabase sign-out failed; clearing local session anyway.')
    clear_auth_session()
    response = redirect(url_for('landing'))
    cookie_name = app.config.get('SESSION_COOKIE_NAME', 'session')
    response.delete_cookie(cookie_name, path='/')
    response.set_cookie(cookie_name, '', expires=0, max_age=0, path='/', httponly=True)
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    return response

@app.route('/reset-password', methods=['POST'])
@limiter.limit("3 per hour")
def forgot_password():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()

    response = {'success': True}
    if not email:
        return jsonify(response)

    configured_redirect = os.getenv('FORGOT_PASSWORD_REDIRECT_URL', '').strip()
    reset_redirect = f"{request.host_url.rstrip('/')}{url_for('reset_password_html')}"
    redirect_to = configured_redirect or reset_redirect
    if redirect_to.rstrip('/').endswith('/index.html'):
        redirect_to = reset_redirect
    reset_password_for_email(email, redirect_to)
    return jsonify(response)


@app.route('/change-password-email', methods=['POST'])
@limiter.limit("3 per hour")
def change_password_email():
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()

    response = {'success': True}
    if not email:
        return jsonify(response)

    configured_redirect = os.getenv('CHANGE_PASSWORD_REDIRECT_URL', '').strip()
    redirect_to = configured_redirect or f"{request.host_url.rstrip('/')}{url_for('change_password_html')}"
    if redirect_to.rstrip('/').endswith('/index.html'):
        redirect_to = f"{request.host_url.rstrip('/')}{url_for('change_password_html')}"
    reset_password_for_email(email, redirect_to)
    return jsonify(response)


@app.route('/reset/<token>')
def reset_page(token):
    return render_template('reset_password.html', token=token)


@app.route('/reset_password.html')
def reset_password_html():
    return render_template('reset_password.html', token='')


@app.route('/update-password')
def update_password_page():
    return render_template('reset_password.html', token='')


@app.route('/change-password')
def change_password_page():
    return render_template('change_password.html')


@app.route('/change_password.html')
def change_password_html():
    return render_template('change_password.html')


@app.route('/api/reset-password', methods=['POST'])
@limiter.limit("10 per minute")
def perform_reset():
    data = request.get_json(silent=True) or {}

    access_token = request.headers.get('X-Access-Token') or session.get('access_token') or ''
    new_pw = data.get('new_password') or ''
    confirm_pw = data.get('confirm_password') or ''

    if not all([new_pw, confirm_pw]):
        return jsonify({'success': False, 'message': 'Missing fields'})

    if new_pw != confirm_pw:
        return jsonify({'success': False, 'message': 'Passwords do not match'})

    password_message = password_validation_message(new_pw)
    if password_message:
        return jsonify({'success': False, 'message': password_message})

    if not access_token:
        return jsonify({'success': False, 'message': 'Open the Supabase reset link from your email, then set the new password.'})

    result = update_user_password(access_token, new_pw)
    if result.get('error') or result.get('msg') or result.get('message'):
        return jsonify({'success': False, 'message': result.get('msg') or result.get('message') or result.get('error_description') or 'Unable to update password.'})
    return jsonify({'success': True})



# Authenticated dashboard route.
@app.route('/dashboard')
@login_required
def dashboard():
    db = get_db()
    uid = session['user_id']

    user = ensure_user_profile(db, uid, session.get('access_token', ''))
    if not user:
        clear_auth_session()
        return auth_failure('Session expired. Please log in again.')

    expires_at = current_session_expires_at()
    return render_template(
        'app.html',
        user=user,
        session_expires_at=expires_at.isoformat() if expires_at else '',
    )

# Refreshes the authenticated session activity timestamp for client-side user activity.
@app.route('/api/session/activity', methods=['POST'])
@login_required
def api_session_activity():
    expires_at = current_session_expires_at()

    return jsonify({
        'success': True,
        'session_expires_at': expires_at.isoformat() if expires_at else '',
    })


# Dashboard stats API: cards and AI sorting summary.
@app.route('/api/stats')
@login_required
def api_stats():
    db  = get_db()
    uid = get_current_user_id()

    total_folders = len(db.select("folders", {"user_id": pg_filter("eq", uid)}, "id"))
    total_files   = len(db.select("files", {"user_id": pg_filter("eq", uid)}, "id"))

    week_ago = (now_utc() - timedelta(days=7)).isoformat()
    recent_count = len(db.select(
        "files",
        {"user_id": pg_filter("eq", uid), "created_at": pg_filter("gt", week_ago)},
        "id",
    ))
    ai_suggestions_accepted = len(db.select(
        "files",
        {"user_id": pg_filter("eq", uid), "ai_sorted": pg_filter("eq", True)},
        "id",
    ))
    storage_used_bytes = get_user_storage_used_bytes(db, uid)
    storage_remaining_bytes = max(STORAGE_LIMIT_BYTES - storage_used_bytes, 0)

    return jsonify({
        'total_folders': total_folders,
        'total_files':   total_files,
        'recent_count':  recent_count,
        'ai_suggestions_accepted': ai_suggestions_accepted,
        'ai_sorted': ai_suggestions_accepted,
        'storage_limit_bytes': STORAGE_LIMIT_BYTES,
        'storage_used_bytes': storage_used_bytes,
        'storage_remaining_bytes': storage_remaining_bytes,
    })


# Folder API: list, create, update, notes, and deletion.
@app.route('/api/folders', methods=['GET'])
@login_required
def api_get_folders():
    db  = get_db()
    uid = get_current_user_id()
    search = request.args.get('search', '').strip()
    rows = list_folders_with_counts(db, uid, search)
    return jsonify([dict(r) for r in rows])


@app.route('/api/folders', methods=['POST'])
@login_required
def api_create_folder():
    data  = request.get_json(silent=True) or {}
    name  = data.get('name',  '').strip()
    emoji = data.get('emoji', DEFAULT_FOLDER_EMOJI).strip() or DEFAULT_FOLDER_EMOJI
    color = data.get('color', '#e8855a')
    bg    = data.get('bg',    '#fde8de')

    if not name:
        return jsonify({'success': False, 'message': 'Folder name is required.'})

    db  = get_db()
    uid = get_current_user_id()
    existing = find_duplicate_folder_name(db, uid, name)
    if existing:
        return duplicate_folder_name_response()

    try:
        folder = create_folder_record(db, uid, name, emoji, color, bg)
    except RuntimeError as exc:
        if is_folder_duplicate_name_error(exc):
            return duplicate_folder_name_response()
        raise
    db.commit()
    return jsonify({'success': True, 'folder': dict(folder)})


@app.route('/api/folders/<int:folder_id>', methods=['PUT'])
@login_required
def api_update_folder(folder_id):
    db  = get_db()
    uid = get_current_user_id()
    folder = select_folder(db, folder_id, uid)
    if not folder:
        return jsonify({'success': False, 'message': 'Folder not found.'})

    data   = request.get_json(silent=True) or {}
    name   = data.get('name',   folder['name']).strip()
    emoji  = data.get('emoji',  folder['emoji'])
    color  = data.get('color',  folder['color'])
    bg     = data.get('bg',     folder['bg'])
    pinned = data.get('pinned', folder['pinned'])
    updated_at = now_utc().isoformat()

    payload = {
        "name": name,
        "emoji": emoji,
        "color": color,
        "bg": bg,
        "pinned": bool(pinned),
        "updated_at": updated_at,
    }
    if "note_body" in data:
        payload["note_body"] = str(data.get("note_body") or "")
        payload["note_updated_at"] = data.get("note_updated_at") or updated_at

    duplicate = find_duplicate_folder_name(db, uid, name, exclude_folder_id=folder_id)
    if duplicate:
        return duplicate_folder_name_response()

    try:
        update_folder_payload(db, {"id": pg_filter("eq", folder_id), "user_id": pg_filter("eq", uid)}, payload)
    except RuntimeError as exc:
        if is_folder_duplicate_name_error(exc):
            return duplicate_folder_name_response()
        if "note_body" in payload and is_folder_note_schema_error(exc):
            return folder_note_schema_error_response()
        raise
    db.commit()
    return jsonify({'success': True, 'updated_at': updated_at})


def is_folder_note_schema_error(exc):
    message = str(exc)
    return (
        "PGRST204" in message
        and ("note_body" in message or "note_updated_at" in message)
        and "folders" in message
    )


def is_folder_updated_at_schema_error(exc):
    message = str(exc)
    return "PGRST204" in message and "updated_at" in message and "folders" in message


def update_folder_payload(db, filters, payload):
    try:
        db.update("folders", filters, payload)
        return True
    except RuntimeError as exc:
        if "updated_at" in payload and is_folder_updated_at_schema_error(exc):
            fallback_payload = dict(payload)
            fallback_payload.pop("updated_at", None)
            db.update("folders", filters, fallback_payload)
            return False
        raise


def folder_note_schema_error_response():
    return jsonify({
        'success': False,
        'message': (
            "Folder notes are not ready in Supabase yet. Run the folder note "
            "ALTER TABLE statements in supabase_schema.sql, then refresh the "
            "PostgREST schema cache."
        ),
    }), 503


@app.route('/api/folders/<int:folder_id>/note', methods=['PUT'])
@login_required
@limiter.limit("30 per minute")
def api_update_folder_note(folder_id):
    db = get_db()
    uid = get_current_user_id()
    folder = select_folder(db, folder_id, uid, "id")
    if not folder:
        return jsonify({'success': False, 'message': 'Folder not found.'}), 404

    data = request.get_json(silent=True) or {}
    note_body = str(data.get('note_body') or '')
    if len(note_body) > 5000:
        return jsonify({'success': False, 'message': 'Folder note is too long.'}), 400

    note_updated_at = now_utc().isoformat()
    try:
        update_folder_payload(
            db,
            {"id": pg_filter("eq", folder_id), "user_id": pg_filter("eq", uid)},
            {
                "note_body": note_body,
                "note_updated_at": note_updated_at,
                "updated_at": note_updated_at,
            },
        )
    except RuntimeError as exc:
        if is_folder_note_schema_error(exc):
            return folder_note_schema_error_response()
        raise
    db.commit()
    return jsonify({
        'success': True,
        'note_body': note_body,
        'note_updated_at': note_updated_at,
        'updated_at': note_updated_at,
    })


@app.route('/api/folders/<int:folder_id>', methods=['DELETE'])
@login_required
def api_delete_folder(folder_id):
    db  = get_db()
    uid = get_current_user_id()
    folder = select_folder(db, folder_id, uid)
    if not folder:
        return jsonify({'success': False, 'message': 'Folder not found.'})
    if folder['is_default']:
        return jsonify({'success': False, 'message': 'Cannot delete the default folder.'})

    files = db.select(
        "files",
        {"user_id": pg_filter("eq", uid), "folder_id": pg_filter("eq", folder_id)},
        "stored_name",
    )
    try:
        delete_files([f['stored_name'] for f in files])
    except Exception as e:
        return jsonify({'success': False, 'message': f'Storage delete error: {str(e)}'})

    db.delete("files", {"user_id": pg_filter("eq", uid), "folder_id": pg_filter("eq", folder_id)})
    db.delete("folders", {"id": pg_filter("eq", folder_id), "user_id": pg_filter("eq", uid)})
    db.commit()
    return jsonify({'success': True})


# File API: list, delete, move, and rename file metadata.
@app.route('/api/files', methods=['GET'])
@limiter.limit("120 per minute")
@login_required
def api_get_files():
    db  = get_db()
    uid = get_current_user_id()
    folder_id = request.args.get('folder_id')
    search    = request.args.get('search', '').strip()
    sort      = request.args.get('sort', 'date')
    recent_minutes = request.args.get('recent_minutes')
    created_after = None
    if recent_minutes:
        try:
            minutes = max(0, min(int(recent_minutes), 60 * 24))
            created_after = (now_utc() - timedelta(minutes=minutes)).isoformat()
        except (TypeError, ValueError):
            return jsonify({'success': False, 'message': 'Invalid recent_minutes value.'}), 400

    rows = list_files_with_folder_metadata(db, uid, folder_id, search, sort, created_after)
    return jsonify([dict(r) for r in rows])


@app.route('/api/files/<int:file_id>', methods=['DELETE'])
@login_required
def api_delete_file(file_id):
    db  = get_db()
    uid = get_current_user_id()
    f   = select_file(db, file_id, uid)
    if not f:
        return jsonify({'success': False, 'message': 'File not found.'})

    try:
        delete_files([f['stored_name']])
    except Exception as e:
        return jsonify({'success': False, 'message': f'Storage delete error: {str(e)}'})

    db.delete("files", {"id": pg_filter("eq", file_id), "user_id": pg_filter("eq", uid)})
    db.commit()
    return jsonify({'success': True})


@app.route('/api/files/<int:file_id>/move', methods=['PUT'])
@login_required
def api_move_file(file_id):
    db        = get_db()
    uid       = get_current_user_id()
    data      = request.get_json(silent=True) or {}
    folder_id = data.get('folder_id')

    if not folder_id:
        return jsonify({'success': False, 'message': 'Please choose a folder.'})

    f      = select_file(db, file_id, uid)
    folder = select_folder(db, folder_id, uid)
    if not f or not folder:
        return jsonify({'success': False, 'message': 'Not found.'})

    db.update("files", {"id": pg_filter("eq", file_id), "user_id": pg_filter("eq", uid)}, {"folder_id": folder_id})
    db.commit()
    return jsonify({'success': True})


@app.route('/api/files/<int:file_id>/rename', methods=['PUT'])
@login_required
def api_rename_file(file_id):
    db  = get_db()
    uid = get_current_user_id()
    data = request.get_json(silent=True) or {}
    new_name = clean_display_filename(data.get('name') or '')

    if not new_name:
        return jsonify({'success': False, 'message': 'Please enter a file name.'})
    if len(new_name) > 160:
        return jsonify({'success': False, 'message': 'File name is too long.'})
    if not allowed_file(new_name):
        return jsonify({'success': False, 'message': 'File type not supported.'})

    f = select_file(db, file_id, uid)
    if not f:
        return jsonify({'success': False, 'message': 'File not found.'})

    duplicate = find_duplicate_filename(db, uid, new_name, exclude_file_id=file_id)
    if duplicate:
        return duplicate_filename_response(new_name)

    db.update("files", {"id": pg_filter("eq", file_id), "user_id": pg_filter("eq", uid)}, {
        "original_name": new_name,
        "extension": new_name.rsplit('.', 1)[1].lower(),
    })
    db.commit()
    return jsonify({'success': True, 'name': new_name})


@app.route('/api/files/<int:file_id>/reanalyze-summary', methods=['POST'])
@login_required
@limiter.limit("5 per minute")
def api_reanalyze_file_summary(file_id):
    db  = get_db()
    uid = get_current_user_id()
    f   = select_file(db, file_id, uid)
    if not f:
        return jsonify({'success': False, 'message': 'File not found.'}), 404

    filename = clean_display_filename(f.get('original_name') or '')
    if not filename or not allowed_file(filename):
        return jsonify({'success': False, 'message': 'File type not supported.'}), 400

    folder_rows = db.select("folders", {"user_id": pg_filter("eq", uid)})
    folder_list = [
        {**dict(folder), 'folder': folder['name']}
        for folder in folder_rows
    ]

    timestamp = now_utc().strftime('%Y%m%d%H%M%S%f')
    temp_path = os.path.join(app.config['UPLOAD_FOLDER'], f'__reanalyze_{timestamp}_{safe_storage_filename(filename)}')

    try:
        download_file(f['stored_name'], temp_path)
        analyze_file = get_file_analyzer()
        result = analyze_file(temp_path, filename, folder_list)
        summary = normalize_ai_summary(result.get('summary') or '')
        db.update(
            "files",
            {"id": pg_filter("eq", file_id), "user_id": pg_filter("eq", uid)},
            {"ai_summary": summary},
        )
        db.commit()
        return jsonify({'success': True, 'summary': summary})
    except RuntimeError as exc:
        if is_file_summary_schema_error(exc):
            return jsonify({
                'success': False,
                'message': 'AI summary column is not ready in Supabase yet. Run the ai_summary SQL update first.',
            }), 400
        return jsonify({'success': False, 'message': str(exc)}), 500
    except Exception as exc:
        return jsonify({'success': False, 'message': f'Re-analysis failed: {str(exc)}'}), 500
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


# AI analysis API: extract file text and return ranked folder suggestions.
@app.route('/api/analyze', methods=['POST'])
@login_required
@limiter.limit("3 per minute")
@limiter.limit("1 per 5 seconds")
def api_analyze():

    # AI analysis flow: keep the session active during longer Gemini work.
    session['last_activity'] = now_utc().isoformat()

    if 'file' not in request.files:
        return jsonify({'success': False, 'message': 'No file provided.'})

    file = request.files['file']
    if not file or file.filename == '':
        return jsonify({'success': False, 'message': 'No file selected.'})

    filename = clean_display_filename(file.filename)
    if not filename or not allowed_file(filename):
        return jsonify({'success': False, 'message': 'File type not supported.'})

    uid = get_current_user_id()
    db  = get_db()
    file_size = uploaded_file_size(file)
    file_hash = uploaded_file_hash(file)
    duplicate = find_duplicate_file(db, uid, filename, file_size, file_hash)
    if duplicate:
        return duplicate_file_response(duplicate)

    analyze_token = begin_analyze_request(uid)
    safe_name = safe_storage_filename(filename)
    timestamp = now_utc().strftime('%Y%m%d%H%M%S%f')
    temp_path = os.path.join(app.config['UPLOAD_FOLDER'], f'__temp_{timestamp}_{safe_name}')
    file.save(temp_path)

    folder_rows = db.select("folders", {"user_id": pg_filter("eq", uid)})
    folder_list = [
        {**dict(f), 'folder': f['name']}
        for f in folder_rows
    ]

    try:
        if not analyze_request_is_current(uid, analyze_token):
            return jsonify({'success': False, 'message': 'Analysis cancelled.'}), 409
        analyze_file = get_file_analyzer()
        result = analyze_file(temp_path, filename, folder_list)
        if not analyze_request_is_current(uid, analyze_token):
            return jsonify({'success': False, 'message': 'Analysis cancelled.'}), 409
        ai_status = result.get("ai_status", "gemini")
    except Exception as e:
        return jsonify({'success': False, 'message': f'Analysis error: {str(e)}'})
    finally:
        finish_analyze_request(uid, analyze_token)
        if os.path.exists(temp_path):
            os.remove(temp_path)

    result['user_folders'] = folder_list
    result['ai_status'] = ai_status

    
    return jsonify({'success': True, 'analysis': result})


# Direct upload API: save a user-selected file to a known folder.
@app.route('/api/upload', methods=['POST'])
@login_required
@limiter.limit("5 per minute")
def api_upload():
    """Save a file directly to a known folder (no AI analysis)."""
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': 'No file provided.'})

    file      = request.files['file']
    folder_id = request.form.get('folder_id')
    ai_sorted = request.form.get('ai_sorted', '0') == '1'
    keywords  = request.form.get('keywords', '')

    if not folder_id:
        return jsonify({'success': False, 'message': 'No folder selected.'})

    db  = get_db()
    uid = get_current_user_id()

    folder = select_folder(db, folder_id, uid)
    if not folder:
        return jsonify({'success': False, 'message': 'Invalid folder.'})

    if not file or file.filename == '':
        return jsonify({'success': False, 'message': 'No file selected.'})

    filename    = clean_display_filename(file.filename)
    if not filename or not allowed_file(filename):
        return jsonify({'success': False, 'message': 'File type not supported.'})

    safe_name   = safe_storage_filename(filename)
    ext         = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
    timestamp   = now_utc().strftime('%Y%m%d%H%M%S%f')
    stored_name = make_storage_path(uid, f'{timestamp}_{safe_name}')
    file_size   = uploaded_file_size(file)
    file_hash   = uploaded_file_hash(file)
    duplicate   = find_duplicate_file(db, uid, filename, file_size, file_hash)
    if duplicate:
        return duplicate_file_response(duplicate)
    if get_user_storage_used_bytes(db, uid) + file_size > STORAGE_LIMIT_BYTES:
        return jsonify({'success': False, 'message': 'Storage limit reached. Delete files before uploading more.'})

    try:
        upload_file(file, stored_name)
    except Exception as e:
        return jsonify({'success': False, 'message': f'Storage upload error: {str(e)}'})

    try:
        f = create_file_record(db, uid, folder_id, filename, stored_name, ext, file_size, ai_sorted, keywords, file_hash=file_hash)
    except DuplicateFileError:
        try:
            delete_files([stored_name])
        except Exception:
            pass
        duplicate = find_duplicate_file(db, uid, filename, file_size, file_hash)
        return duplicate_file_response(duplicate or {"original_name": filename})
    db.commit()

    return jsonify({'success': True, 'file': dict(f)})


# Confirm upload API: persist the AI-recommended destination.
@app.route('/api/confirm-upload', methods=['POST'])
@login_required
@limiter.limit("10 per minute")
def api_confirm_upload():
    """
    Called when the user confirms an AI folder suggestion.

    Case A — Existing folder: folder_id is provided → upload directly.
    Case B — New folder:      folder_name is provided → create folder, then upload.
    """
    if 'file' not in request.files:
        return jsonify({'success': False, 'message': 'No file provided.'})

    file        = request.files['file']
    folder_id   = request.form.get('folder_id',    '').strip()
    folder_name = request.form.get('folder_name',  '').strip()
    emoji       = request.form.get('folder_emoji', DEFAULT_FOLDER_EMOJI).strip() or DEFAULT_FOLDER_EMOJI
    color       = request.form.get('folder_color', '#7ec8e3')
    bg          = request.form.get('folder_bg',    '#e0f4fb')
    ai_sorted   = request.form.get('ai_sorted',    '0') == '1'
    keywords    = request.form.get('keywords',     '')
    ai_summary  = request.form.get('ai_summary',   '')

    db  = get_db()
    uid = get_current_user_id()

    if not file or file.filename == '':
        return jsonify({'success': False, 'message': 'No file selected.'})

    filename = clean_display_filename(file.filename)
    if not filename or not allowed_file(filename):
        return jsonify({'success': False, 'message': 'File type not supported.'})

    if folder_id:
        try:
            folder_id = int(folder_id)
        except ValueError:
            folder_id = None

    new_folder_payload = None
    if not folder_id and folder_name:
        existing = first(db.select(
            "folders",
            {"user_id": pg_filter("eq", uid), "name": pg_filter("eq", folder_name)},
            "id",
        ))
        if existing:
            folder_id = existing['id']
        else:
            new_folder_payload = {
                'name': folder_name,
                'emoji': emoji,
                'color': color,
                'bg': bg,
            }

    if not folder_id and not new_folder_payload:
        return jsonify({'success': False, 'message': 'No folder specified.'})

    folder = select_folder(db, folder_id, uid) if folder_id else None
    if folder_id and not folder:
        return jsonify({'success': False, 'message': 'Invalid folder.'})

    safe_name   = safe_storage_filename(filename)
    ext         = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
    timestamp   = now_utc().strftime('%Y%m%d%H%M%S%f')
    stored_name = make_storage_path(uid, f'{timestamp}_{safe_name}')
    file_size   = uploaded_file_size(file)
    file_hash   = uploaded_file_hash(file)
    duplicate   = find_duplicate_file(db, uid, filename, file_size, file_hash)
    if duplicate:
        return duplicate_file_response(duplicate)
    if get_user_storage_used_bytes(db, uid) + file_size > STORAGE_LIMIT_BYTES:
        return jsonify({'success': False, 'message': 'Storage limit reached. Delete files before uploading more.'})

    try:
        upload_file(file, stored_name)
    except Exception as e:
        return jsonify({'success': False, 'message': f'Storage upload error: {str(e)}'})

    created_folder_id = None
    try:
        if new_folder_payload:
            folder = create_folder_record(
                db,
                uid,
                new_folder_payload['name'],
                new_folder_payload['emoji'],
                new_folder_payload['color'],
                new_folder_payload['bg'],
            )
            folder_id = folder['id']
            created_folder_id = folder_id

        saved_file = create_file_record(db, uid, folder_id, filename, stored_name, ext, file_size, ai_sorted, keywords, ai_summary, file_hash)
        db.commit()
    except DuplicateFileError:
        try:
            delete_files([stored_name])
        except Exception:
            pass
        if created_folder_id:
            try:
                db.delete("folders", {"id": pg_filter("eq", created_folder_id), "user_id": pg_filter("eq", uid)})
            except Exception:
                pass
        duplicate = find_duplicate_file(db, uid, filename, file_size, file_hash)
        return duplicate_file_response(duplicate or {"original_name": filename})
    except Exception:
        try:
            delete_files([stored_name])
        except Exception:
            pass
        if created_folder_id:
            try:
                db.delete("folders", {"id": pg_filter("eq", created_folder_id), "user_id": pg_filter("eq", uid)})
            except Exception:
                pass
        raise

    return jsonify({
        'success': True,
        'file': dict(saved_file),
        'folder': dict(folder),
    })


# Storage access API: create short-lived links for preview and download.
@app.route('/api/files/<int:file_id>/open', methods=['POST'])
@login_required
def api_open_file(file_id):
    db  = get_db()
    uid = get_current_user_id()
    f   = select_file(db, file_id, uid)
    if not f:
        return jsonify({'success': False, 'message': 'File not found.'})
    if str(f.get('extension') or '').lower() not in BROWSER_PREVIEW_EXTENSIONS:
        return jsonify({
            'success': False,
            'message': 'Some files cannot be viewed unless downloaded.',
        }), 415

    try:
        return jsonify({'success': True, 'url': create_signed_url(f['stored_name'])})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


@app.route('/api/files/<int:file_id>/download')
@login_required
def api_download_file(file_id):
    db  = get_db()
    uid = get_current_user_id()
    f   = select_file(db, file_id, uid)
    if not f:
        return jsonify({'success': False, 'message': 'File not found.'})
    try:
        download_name = clean_display_filename(f.get('original_name')) or os.path.basename(f['stored_name'])
        return redirect(create_signed_url(f['stored_name'], download_name=download_name))
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


# Statistics chart API: folder distribution for the stats view.
@app.route('/api/stats/chart')
@login_required
def api_stats_chart():
    db  = get_db()
    uid = get_current_user_id()
    return jsonify(stats_chart_rows(db, uid))


# Bulk cleanup APIs: user-triggered file and folder deletion.
@app.route('/api/files/delete-all', methods=['DELETE'])
@login_required
def api_delete_all_files():
    """Delete every file belonging to the current user from Storage and metadata."""
    db  = get_db()
    uid = get_current_user_id()

    files = db.select("files", {"user_id": pg_filter("eq", uid)}, "stored_name")
    try:
        delete_files([f['stored_name'] for f in files])
    except Exception as e:
        return jsonify({'success': False, 'message': f'Storage delete error: {str(e)}'})

    db.delete("files", {"user_id": pg_filter("eq", uid)})
    db.commit()
    return jsonify({'success': True})


@app.route('/api/folders/delete-all', methods=['DELETE'])
@login_required
def api_delete_all_folders():
    """
    Delete every non-default folder for the current user.
    Files inside those folders are permanently removed from Storage and metadata.
    The default folder and files already inside it are never deleted.
    """
    db  = get_db()
    uid = get_current_user_id()

    default_folder = select_default_folder(db, uid, "id")
    if not default_folder:
        return jsonify({'success': False, 'message': 'Default folder not found.'})

    default_folder_id = str(default_folder['id'])
    user_files = db.select("files", {"user_id": pg_filter("eq", uid)}, "id,folder_id,stored_name")
    files_to_delete = [
        item for item in user_files
        if str(item.get("folder_id")) != default_folder_id
    ]

    try:
        delete_files([item.get("stored_name") for item in files_to_delete])
    except Exception as e:
        return jsonify({'success': False, 'message': f'Storage delete error: {str(e)}'})

    for item in files_to_delete:
        db.delete("files", {"id": pg_filter("eq", item['id']), "user_id": pg_filter("eq", uid)})
    db.delete("folders", {"user_id": pg_filter("eq", uid), "is_default": pg_filter("eq", False)})
    db.commit()
    return jsonify({'success': True, 'deleted_files': len(files_to_delete)})

# User settings API: profile, credentials, and account deletion.
@app.route('/api/user', methods=['GET'])
@login_required
def api_get_user():
    """
    Return profile data.
    Source of truth: Supabase Auth for credentials; Supabase public.users for profile.
    """
    uid  = get_current_user_id()
    db   = get_db()
    user = ensure_user_profile(db, uid, session.get('access_token', ''))
    if not user:
        return jsonify({'success': False, 'message': 'User not found.'}), 404
    return jsonify({
        'name':       user['name'],
        'email':      user['email'],
        'created_at': user['created_at'],
    })


@app.route('/api/user', methods=['PUT'])
@login_required
def api_update_user():
    data  = request.get_json(silent=True) or {}
    uid   = get_current_user_id()
    db    = get_db()

    name  = data.get('name', '').strip()
    email = data.get('email', '').strip()

    access_token = session.get('access_token')
    if email:
        matching_users = db.select("users", {"email": pg_filter("eq", email)}, "id")
        existing = next((row for row in matching_users if str(row.get("id")) != str(uid)), None)

        if existing:
            return jsonify({'success': False, 'message': 'Email already in use.'})

        if access_token:
            result = update_user_email(access_token, email)
            if result.get('error') or result.get('msg'):
                return jsonify({'success': False, 'message': result.get('msg') or result.get('error_description') or 'Unable to update email.'})

    if name:
        if access_token:
            result = update_user_metadata(access_token, {'name': name})
            if result.get('error') or result.get('msg'):
                return jsonify({'success': False, 'message': result.get('msg') or result.get('error_description') or 'Unable to update name.'})
        db.update("users", {"id": pg_filter("eq", uid)}, {"name": name})

    if email:
        db.update("users", {"id": pg_filter("eq", uid)}, {"email": email})

    db.commit()
    return jsonify({'success': True})


@app.route('/api/user/password', methods=['PUT'])
@login_required
def api_change_password():
    data = request.get_json(silent=True) or {}

    current_pw = data.get('current_password', '')
    new_pw     = data.get('new_password', '')
    confirm_pw = data.get('confirm_password', '')

    if not current_pw or not new_pw or not confirm_pw:
        return jsonify({'success': False, 'message': 'Please fill in all fields.'})

    if new_pw != confirm_pw:
        return jsonify({'success': False, 'message': 'Passwords do not match.'})

    if current_pw == new_pw:
        return jsonify({'success': False, 'message': 'New password cannot be the same as your current password.'})

    password_message = password_validation_message(new_pw)
    if password_message:
        return jsonify({'success': False, 'message': password_message})

    uid = get_current_user_id()
    db = get_db()
    user = select_user(db, uid)
    auth_header = request.headers.get('Authorization', '')
    bearer_token = auth_header.removeprefix('Bearer ').strip() if auth_header.startswith('Bearer ') else ''
    access_token = bearer_token or session.get('access_token', '')
    auth_user = get_auth_user(access_token)

    if auth_user.get('error') or auth_user.get('msg'):
        return jsonify({
            'success': False,
            'message': auth_user.get('msg') or 'Unable to verify your current session. Please log in again.',
        }), 401

    if auth_user.get('id') and str(auth_user.get('id')) != str(uid):
        clear_auth_session()
        return auth_failure('Session expired. Please log in again.')
    if bearer_token:
        session['access_token'] = bearer_token
        session.modified = True

    auth_email = (auth_user.get('email') or (user or {}).get('email') or '').strip()
    current_auth = sign_in(auth_email, current_pw) if auth_email else {}
    if not current_auth.get('access_token'):
        return jsonify({'success': False, 'message': 'Current password is incorrect.'})

    result = admin_update_user_password(uid, new_pw)
    if result.get('error') or result.get('msg'):
        return jsonify({'success': False, 'message': result.get('msg') or result.get('error_description') or 'Unable to update password.'})

    refreshed_auth = sign_in(auth_email, new_pw)
    if refreshed_auth.get('access_token'):
        session['access_token'] = refreshed_auth['access_token']
        session['refresh_token'] = refreshed_auth.get('refresh_token', '')
        session['last_activity'] = now_utc().isoformat()
        session.modified = True

    return jsonify({
        'success': True,
        'access_token': refreshed_auth.get('access_token', ''),
        'refresh_token': refreshed_auth.get('refresh_token', ''),
    })


@app.route('/api/user/deactivate', methods=['DELETE'])
@login_required
def api_deactivate_account():
    db  = get_db()
    uid = get_current_user_id()
    deactivated_at = now_utc().isoformat()

    try:
        db.update("users", {"id": pg_filter("eq", uid)}, {
            "is_deactivated": True,
            "deactivated_at": deactivated_at,
        })
    except RuntimeError as exc:
        if is_missing_deactivation_columns(exc):
            return jsonify({
                'success': False,
                'message': 'Deactivation is not ready yet. Run the updated Supabase schema to add users.is_deactivated and users.deactivated_at.',
            }), 400
        raise
    db.commit()
    access_token = session.get('access_token')
    if access_token:
        try:
            sign_out(access_token)
        except Exception:
            app.logger.exception('Supabase sign-out failed after account deactivation.')
    try:
        session.clear()
    finally:
        session.modified = True

    return jsonify({'success': True, 'deactivated': True, 'deactivated_at': deactivated_at})


@app.route('/api/user/delete', methods=['DELETE'])
@login_required
def api_delete_account():
    db  = get_db()
    uid = get_current_user_id()

    files = db.select("files", {"user_id": pg_filter("eq", uid)}, "stored_name")
    try:
        delete_files([item.get("stored_name") for item in files])
    except Exception as e:
        return jsonify({'success': False, 'message': f'Storage delete error: {str(e)}'})

    access_token = session.get('access_token')
    if access_token:
        try:
            sign_out(access_token)
        except Exception:
            app.logger.exception('Supabase sign-out failed before hard delete.')

    if not admin_delete_user(uid):
        return jsonify({
            'success': False,
            'message': 'Unable to permanently delete the Supabase Auth account. Check the service role key.',
        }), 500

    try:
        session.clear()
    finally:
        session.modified = True

    return jsonify({'success': True, 'hard_deleted': True})


if __name__ == '__main__':
    # Local development entrypoint.
    with app.app_context():
        init_db()
    app.run(debug=True, port=5000)
