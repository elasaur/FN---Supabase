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
import threading
import uuid
from functools import wraps
from datetime import datetime, timezone, timedelta

from dotenv import load_dotenv
load_dotenv()

from flask import (
    Flask, render_template, request, redirect,
    url_for, session, jsonify, send_from_directory
)
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_limiter.errors import RateLimitExceeded
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.utils import secure_filename

from database import init_db, get_db, close_db
from supabase_auth import (
    sign_in,
    sign_up,
    sign_out,
    update_user_email,
    update_user_password,
    admin_update_user_password,
    update_user_metadata,
    admin_delete_user,
    reset_password_for_email,
)

from nlp_analyzer import analyze_file
from storage import make_storage_path, upload_file, create_signed_url, delete_files

# ── App Configuration ──────────────────────────────────────────────────────────
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

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50 MB
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=30)
SESSION_TIMEOUT = timedelta(minutes=30)
DEFAULT_FOLDER_EMOJI = '📁'

LOGIN_MAX_FAILED_ATTEMPTS = 3
LOGIN_LOCKOUT_DURATION = timedelta(hours=24)
LOGIN_ATTEMPTS_FILE = os.path.join(os.path.dirname(__file__), 'login_attempts.json')
ANALYZE_REQUEST_LOCK = threading.Lock()
ANALYZE_REQUEST_TOKENS = {}

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
    icon_path = os.path.join(ICONS_FOLDER, filename)
    if not os.path.isfile(icon_path):
        filename = os.path.basename(filename)
    return send_from_directory(ICONS_FOLDER, filename)


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
    if request.endpoint in {'landing', 'index', 'index_html', 'dashboard', 'logout', 'reset_page', 'reset_password_html', 'update_password_page', 'change_password_page', 'change_password_html'}:
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
    return response

def now_utc():
    return datetime.now(timezone.utc)


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


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


def is_valid_uuid(value):
    try:
        uuid.UUID(str(value))
        return True
    except (TypeError, ValueError):
        return False


def clear_auth_session():
    session.clear()
    session.modified = True


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

        # Update activity (sliding session)
        session['last_activity'] = now_utc().isoformat()

        return f(*args, **kwargs)
    return decorated


def get_current_user_id():
    return session.get('user_id')


def begin_analyze_request(user_id):
    token = uuid.uuid4().hex
    with ANALYZE_REQUEST_LOCK:
        ANALYZE_REQUEST_TOKENS[str(user_id)] = token
    return token


def cancel_analyze_request(user_id):
    if not user_id:
        return
    with ANALYZE_REQUEST_LOCK:
        ANALYZE_REQUEST_TOKENS[str(user_id)] = uuid.uuid4().hex


def analyze_request_is_current(user_id, token):
    with ANALYZE_REQUEST_LOCK:
        return ANALYZE_REQUEST_TOKENS.get(str(user_id)) == token


def finish_analyze_request(user_id, token):
    with ANALYZE_REQUEST_LOCK:
        if ANALYZE_REQUEST_TOKENS.get(str(user_id)) == token:
            ANALYZE_REQUEST_TOKENS.pop(str(user_id), None)


def normalize_login_email(email):
    return str(email or '').strip().lower()


def login_attempt_key(email):
    digest = hmac.new(
        app.secret_key.encode('utf-8'),
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
    tmp_path = f"{LOGIN_ATTEMPTS_FILE}.tmp"
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
    minutes = max(0, (seconds - 1) // 60)
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


#login
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
        password = data.get('password', '').strip()

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
        user = db.execute(
            'SELECT * FROM users WHERE id=?', (user_id,)
        ).fetchone()
        if not user:
            db.insert('users', {'id': user_id, 'name': name, 'email': auth_user.get('email') or email})
            db.commit()
            user = db.execute('SELECT * FROM users WHERE id=?', (user_id,)).fetchone()
        default_folder = db.execute(
            'SELECT id FROM folders WHERE user_id=? AND is_default=1', (user_id,)
        ).fetchone()
        if not default_folder:
            db.execute(
                '''
                INSERT INTO folders (user_id, name, emoji, color, bg, is_default, pinned)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ''',
                (user_id, 'Uncategorized', '📂', '#b09e94', '#f7f4f0', 1, 0)
            )
            db.commit()

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
    if session_is_active():
        return redirect(url_for('dashboard'))
    return render_template('landing.html')

@app.route('/features')
def features():
    return render_template('features.html')

@app.route('/instructions')
def instructions():
    return render_template('instructions.html')

#signup
@app.route('/signup', methods=['POST'])
def signup():
    data = request.get_json()

    name     = data.get('name', '').strip()
    email    = data.get('email', '').strip()
    password = data.get('password', '')
    confirm  = data.get('confirm', '')

    if not name or not email or not password:
        return jsonify({'success': False, 'message': 'Please fill in all fields.'})

    if password != confirm:
        return jsonify({'success': False, 'message': 'Passwords do not match.'})

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

    # auto login when Supabase returns a session immediately
    if auth.get('access_token'):
        session['user_id'] = auth_user['id']
        session['access_token'] = auth['access_token']
        session['refresh_token'] = auth.get('refresh_token', '')
        session['last_activity'] = now_utc().isoformat()
        session.permanent = True

    # create default folder
    db.execute(
        '''
        INSERT INTO folders (user_id, name, emoji, color, bg, is_default, pinned)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ''',
        (auth_user['id'], 'Uncategorized', '📂', '#b09e94', '#f7f4f0', 1, 0)
    )
    db.commit()

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
    if result.get('error') or result.get('msg'):
        return jsonify({'success': False, 'message': result.get('msg') or result.get('error_description') or 'Unable to update password.'})
    return jsonify({'success': True})



# ── Main App Routes ────────────────────────────────────────────────────────────
@app.route('/dashboard')
@login_required
def dashboard():
    db = get_db()
    uid = session['user_id']

    user = db.execute(
        'SELECT * FROM users WHERE id=?', (uid,)
    ).fetchone()

    return render_template('app.html', user=user)


# ── API: Dashboard Stats ───────────────────────────────────────────────────────
@app.route('/api/stats')
@login_required
def api_stats():
    db  = get_db()
    uid = get_current_user_id()

    total_folders = db.execute('SELECT COUNT(*) FROM folders WHERE user_id=?', (uid,)).fetchone()[0]
    total_files   = db.execute('SELECT COUNT(*) FROM files   WHERE user_id=?', (uid,)).fetchone()[0]

    week_ago = (now_utc() - timedelta(days=7)).isoformat()
    recent_count = db.execute(
        'SELECT COUNT(*) FROM files WHERE user_id=? AND created_at>?', (uid, week_ago)
    ).fetchone()[0]
    ai_sorted = db.execute(
        'SELECT COUNT(*) FROM files WHERE user_id=? AND ai_sorted=1', (uid,)
    ).fetchone()[0]

    return jsonify({
        'total_folders': total_folders,
        'total_files':   total_files,
        'recent_count':  recent_count,
        'ai_sorted':     ai_sorted,
    })


# ── API: Folders ───────────────────────────────────────────────────────────────
@app.route('/api/folders', methods=['GET'])
@login_required
def api_get_folders():
    db  = get_db()
    uid = get_current_user_id()
    search = request.args.get('search', '').strip()
    query = '''
        SELECT f.*, COUNT(fi.id) as file_count
        FROM folders f LEFT JOIN files fi ON fi.folder_id = f.id
        WHERE f.user_id = ?
    '''
    params = [uid]
    if search:
        query += ' AND f.name LIKE ?'
        params.append(f'%{search}%')
    query += ' GROUP BY f.id ORDER BY f.pinned DESC, f.name ASC'
    rows = db.execute(query, params).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route('/api/folders', methods=['POST'])
@login_required
def api_create_folder():
    data  = request.get_json()
    name  = data.get('name',  '').strip()
    emoji = data.get('emoji', DEFAULT_FOLDER_EMOJI).strip() or DEFAULT_FOLDER_EMOJI
    color = data.get('color', '#e8855a')
    bg    = data.get('bg',    '#fde8de')

    if not name:
        return jsonify({'success': False, 'message': 'Folder name is required.'})

    db  = get_db()
    uid = get_current_user_id()
    existing = db.execute(
        'SELECT id FROM folders WHERE user_id=? AND name=?', (uid, name)
    ).fetchone()
    if existing:
        return jsonify({'success': False, 'message': 'A folder with that name already exists.'})

    db.execute(
        'INSERT INTO folders (user_id, name, emoji, color, bg) VALUES (?,?,?,?,?)',
        (uid, name, emoji, color, bg)
    )
    db.commit()
    folder = db.execute(
        'SELECT * FROM folders WHERE user_id=? AND name=?', (uid, name)
    ).fetchone()
    return jsonify({'success': True, 'folder': dict(folder)})


@app.route('/api/folders/<int:folder_id>', methods=['PUT'])
@login_required
def api_update_folder(folder_id):
    db  = get_db()
    uid = get_current_user_id()
    folder = db.execute(
        'SELECT * FROM folders WHERE id=? AND user_id=?', (folder_id, uid)
    ).fetchone()
    if not folder:
        return jsonify({'success': False, 'message': 'Folder not found.'})

    data   = request.get_json()
    name   = data.get('name',   folder['name']).strip()
    emoji  = data.get('emoji',  folder['emoji'])
    color  = data.get('color',  folder['color'])
    bg     = data.get('bg',     folder['bg'])
    pinned = data.get('pinned', folder['pinned'])

    db.execute(
        'UPDATE folders SET name=?, emoji=?, color=?, bg=?, pinned=? WHERE id=?',
        (name, emoji, color, bg, pinned, folder_id)
    )
    db.commit()
    return jsonify({'success': True})


@app.route('/api/folders/<int:folder_id>', methods=['DELETE'])
@login_required
def api_delete_folder(folder_id):
    db  = get_db()
    uid = get_current_user_id()
    folder = db.execute(
        'SELECT * FROM folders WHERE id=? AND user_id=?', (folder_id, uid)
    ).fetchone()
    if not folder:
        return jsonify({'success': False, 'message': 'Folder not found.'})
    if folder['is_default']:
        return jsonify({'success': False, 'message': 'Cannot delete the default folder.'})

    files = db.execute(
        'SELECT stored_name FROM files WHERE user_id=? AND folder_id=?',
        (uid, folder_id)
    ).fetchall()
    try:
        delete_files([f['stored_name'] for f in files])
    except Exception as e:
        return jsonify({'success': False, 'message': f'Storage delete error: {str(e)}'})

    db.execute('DELETE FROM files WHERE user_id=? AND folder_id=?', (uid, folder_id))
    db.execute('DELETE FROM folders WHERE id=?', (folder_id,))
    db.commit()
    return jsonify({'success': True})


# ── API: Files ─────────────────────────────────────────────────────────────────
@app.route('/api/files', methods=['GET'])
@limiter.limit("120 per minute")
@login_required
def api_get_files():
    db  = get_db()
    uid = get_current_user_id()
    folder_id = request.args.get('folder_id')
    search    = request.args.get('search', '').strip()
    sort      = request.args.get('sort', 'date')

    order_map = {
        'date':   'fi.created_at DESC',
        'name':   'fi.original_name ASC',
        'type':   'fi.extension ASC',
        'folder': 'fo.name ASC',
    }
    order_clause = order_map.get(sort, 'fi.created_at DESC')

    query = '''
        SELECT fi.*, fo.name as folder_name, fo.emoji as folder_emoji,
               fo.color as folder_color, fo.bg as folder_bg
        FROM files fi
        JOIN folders fo ON fo.id = fi.folder_id
        WHERE fi.user_id = ?
    '''
    params = [uid]

    if folder_id:
        query += ' AND fi.folder_id = ?'
        params.append(folder_id)
    if search:
        query += ' AND fi.original_name LIKE ?'
        params.append(f'%{search}%')

    query += f' ORDER BY {order_clause}'

    rows = db.execute(query, params).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route('/api/files/<int:file_id>', methods=['DELETE'])
@login_required
def api_delete_file(file_id):
    db  = get_db()
    uid = get_current_user_id()
    f   = db.execute(
        'SELECT * FROM files WHERE id=? AND user_id=?', (file_id, uid)
    ).fetchone()
    if not f:
        return jsonify({'success': False, 'message': 'File not found.'})

    try:
        delete_files([f['stored_name']])
    except Exception as e:
        return jsonify({'success': False, 'message': f'Storage delete error: {str(e)}'})

    db.execute('DELETE FROM files WHERE id=?', (file_id,))
    db.commit()
    return jsonify({'success': True})


@app.route('/api/files/<int:file_id>/move', methods=['PUT'])
@login_required
def api_move_file(file_id):
    db        = get_db()
    uid       = get_current_user_id()
    data      = request.get_json()
    folder_id = data.get('folder_id')

    f      = db.execute('SELECT * FROM files   WHERE id=? AND user_id=?', (file_id,   uid)).fetchone()
    folder = db.execute('SELECT * FROM folders WHERE id=? AND user_id=?', (folder_id, uid)).fetchone()
    if not f or not folder:
        return jsonify({'success': False, 'message': 'Not found.'})

    db.execute('UPDATE files SET folder_id=? WHERE id=?', (folder_id, file_id))
    db.commit()
    return jsonify({'success': True})


# ── API: Analyze ───────────────────────────────────────────────────────────────
@app.route('/api/files/<int:file_id>/rename', methods=['PUT'])
@login_required
def api_rename_file(file_id):
    db  = get_db()
    uid = get_current_user_id()
    data = request.get_json(silent=True) or {}
    new_name = secure_filename((data.get('name') or '').strip())

    if not new_name:
        return jsonify({'success': False, 'message': 'Please enter a file name.'})
    if len(new_name) > 160:
        return jsonify({'success': False, 'message': 'File name is too long.'})
    if not allowed_file(new_name):
        return jsonify({'success': False, 'message': 'File type not supported.'})

    f = db.execute('SELECT * FROM files WHERE id=? AND user_id=?', (file_id, uid)).fetchone()
    if not f:
        return jsonify({'success': False, 'message': 'File not found.'})

    db.execute('UPDATE files SET original_name=?, extension=? WHERE id=?', (
        new_name,
        new_name.rsplit('.', 1)[1].lower(),
        file_id,
    ))
    db.commit()
    return jsonify({'success': True, 'name': new_name})


@app.route('/api/analyze', methods=['POST'])
@login_required
@limiter.limit("3 per minute")
@limiter.limit("1 per 5 seconds")
def api_analyze():

    # keep session alive during AI processing
    session['last_activity'] = now_utc().isoformat()
    uid = get_current_user_id()
    analyze_token = begin_analyze_request(uid)

    if 'file' not in request.files:
        finish_analyze_request(uid, analyze_token)
        return jsonify({'success': False, 'message': 'No file provided.'})

    file = request.files['file']
    if not file or file.filename == '':
        finish_analyze_request(uid, analyze_token)
        return jsonify({'success': False, 'message': 'No file selected.'})
    if not allowed_file(file.filename):
        finish_analyze_request(uid, analyze_token)
        return jsonify({'success': False, 'message': 'File type not supported.'})

    filename  = secure_filename(file.filename)
    timestamp = now_utc().strftime('%Y%m%d%H%M%S%f')
    temp_path = os.path.join(app.config['UPLOAD_FOLDER'], f'__temp_{timestamp}_{filename}')
    file.save(temp_path)

    db  = get_db()

    folder_rows = db.execute(
        'SELECT * FROM folders WHERE user_id=?', (uid,)
    ).fetchall()
    folder_list = [
        {**dict(f), 'folder': f['name']}
        for f in folder_rows
    ]

    try:
        if not analyze_request_is_current(uid, analyze_token):
            return jsonify({'success': False, 'message': 'Analysis cancelled.'}), 409
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


# ── API: Upload (direct, no analysis) ─────────────────────────────────────────
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

    folder = db.execute(
        'SELECT * FROM folders WHERE id=? AND user_id=?', (folder_id, uid)
    ).fetchone()
    if not folder:
        return jsonify({'success': False, 'message': 'Invalid folder.'})

    filename    = secure_filename(file.filename)
    ext         = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
    timestamp   = now_utc().strftime('%Y%m%d%H%M%S%f')
    stored_name = make_storage_path(uid, f'{timestamp}_{filename}')
    file_size   = uploaded_file_size(file)

    try:
        upload_file(file, stored_name)
    except Exception as e:
        return jsonify({'success': False, 'message': f'Storage upload error: {str(e)}'})

    db.execute(
        '''INSERT INTO files (user_id, folder_id, original_name, stored_name,
                              extension, file_size, ai_sorted, keywords)
           VALUES (?,?,?,?,?,?,?,?)''',
        (uid, folder_id, filename, stored_name, ext, file_size, int(ai_sorted), keywords)
    )
    db.commit()

    f = db.execute('SELECT * FROM files WHERE stored_name=?', (stored_name,)).fetchone()
    return jsonify({'success': True, 'file': dict(f)})


# ── API: Confirm Upload (AI flow) ──────────────────────────────────────────────
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

    db  = get_db()
    uid = get_current_user_id()

    if folder_id:
        try:
            folder_id = int(folder_id)
        except ValueError:
            folder_id = None

    if not folder_id and folder_name:
        existing = db.execute(
            'SELECT id FROM folders WHERE user_id=? AND name=?', (uid, folder_name)
        ).fetchone()
        if existing:
            folder_id = existing['id']
        else:
            db.execute(
                'INSERT INTO folders (user_id, name, emoji, color, bg) VALUES (?,?,?,?,?)',
                (uid, folder_name, emoji, color, bg)
            )
            db.commit()
            new_folder = db.execute(
                'SELECT id FROM folders WHERE user_id=? AND name=?', (uid, folder_name)
            ).fetchone()
            folder_id = new_folder['id']

    if not folder_id:
        return jsonify({'success': False, 'message': 'No folder specified.'})

    folder = db.execute(
        'SELECT * FROM folders WHERE id=? AND user_id=?', (folder_id, uid)
    ).fetchone()
    if not folder:
        return jsonify({'success': False, 'message': 'Invalid folder.'})

    filename    = secure_filename(file.filename)
    ext         = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
    timestamp   = now_utc().strftime('%Y%m%d%H%M%S%f')
    stored_name = make_storage_path(uid, f'{timestamp}_{filename}')
    file_size   = uploaded_file_size(file)

    try:
        upload_file(file, stored_name)
    except Exception as e:
        return jsonify({'success': False, 'message': f'Storage upload error: {str(e)}'})

    db.execute(
        '''INSERT INTO files (user_id, folder_id, original_name, stored_name,
                              extension, file_size, ai_sorted, keywords)
           VALUES (?,?,?,?,?,?,?,?)''',
        (uid, folder_id, filename, stored_name, ext, file_size, int(ai_sorted), keywords)
    )
    db.commit()

    saved_file = db.execute(
        'SELECT * FROM files WHERE stored_name=?', (stored_name,)
    ).fetchone()

    return jsonify({
        'success': True,
        'file': dict(saved_file),
        'folder': dict(folder),
    })


# ── API: Open File ─────────────────────────────────────────────────────────────
@app.route('/api/files/<int:file_id>/open', methods=['POST'])
@login_required
def api_open_file(file_id):
    db  = get_db()
    uid = get_current_user_id()
    f   = db.execute('SELECT * FROM files WHERE id=? AND user_id=?', (file_id, uid)).fetchone()
    if not f:
        return jsonify({'success': False, 'message': 'File not found.'})

    try:
        return jsonify({'success': True, 'url': create_signed_url(f['stored_name'])})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


# ── API: Download File ─────────────────────────────────────────────────────────
@app.route('/api/files/<int:file_id>/download')
@login_required
def api_download_file(file_id):
    db  = get_db()
    uid = get_current_user_id()
    f   = db.execute('SELECT * FROM files WHERE id=? AND user_id=?', (file_id, uid)).fetchone()
    if not f:
        return jsonify({'success': False, 'message': 'File not found.'})
    try:
        return redirect(create_signed_url(f['stored_name']))
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})


# ── API: Statistics Chart ──────────────────────────────────────────────────────
@app.route('/api/stats/chart')
@login_required
def api_stats_chart():
    db  = get_db()
    uid = get_current_user_id()
    try:
        rows = db.execute(
            '''SELECT fo.name, fo.emoji, fo.color, COUNT(fi.id) as count
               FROM folders fo
               LEFT JOIN files fi ON fi.folder_id = fo.id
               WHERE fo.user_id = ?
               GROUP BY fo.id
               ORDER BY count DESC''',
            (uid,)
        ).fetchall()
        return jsonify([dict(r) for r in rows])
    except Exception:
        app.logger.exception('Failed to load stats chart through query adapter.')
        folders = db.select("folders", {"user_id": f"eq.{uid}"})
        files = db.select("files", {"user_id": f"eq.{uid}"}, "folder_id")
        counts = {}
        for item in files:
            folder_id = item.get("folder_id")
            counts[folder_id] = counts.get(folder_id, 0) + 1
        rows = [
            {
                "name": folder.get("name", "Untitled"),
                "emoji": folder.get("emoji", DEFAULT_FOLDER_EMOJI),
                "color": folder.get("color", "#e8855a"),
                "count": counts.get(folder.get("id"), 0),
            }
            for folder in folders
        ]
        rows.sort(key=lambda row: row["count"], reverse=True)
        return jsonify(rows)


# ── API: Delete All Files ──────────────────────────────────────────────────────
@app.route('/api/files/delete-all', methods=['DELETE'])
@login_required
def api_delete_all_files():
    """Delete every file belonging to the current user from Storage and metadata."""
    db  = get_db()
    uid = get_current_user_id()

    files = db.execute('SELECT stored_name FROM files WHERE user_id=?', (uid,)).fetchall()
    try:
        delete_files([f['stored_name'] for f in files])
    except Exception as e:
        return jsonify({'success': False, 'message': f'Storage delete error: {str(e)}'})

    db.execute('DELETE FROM files WHERE user_id=?', (uid,))
    db.commit()
    return jsonify({'success': True})


# ── API: Delete All Folders ────────────────────────────────────────────────────
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

    default_folder = db.execute(
        'SELECT id FROM folders WHERE user_id=? AND is_default=1', (uid,)
    ).fetchone()
    if not default_folder:
        return jsonify({'success': False, 'message': 'Default folder not found.'})

    default_folder_id = str(default_folder['id'])
    user_files = db.select("files", {"user_id": f"eq.{uid}"}, "id,folder_id,stored_name")
    files_to_delete = [
        item for item in user_files
        if str(item.get("folder_id")) != default_folder_id
    ]

    try:
        delete_files([item.get("stored_name") for item in files_to_delete])
    except Exception as e:
        return jsonify({'success': False, 'message': f'Storage delete error: {str(e)}'})

    for item in files_to_delete:
        db.execute('DELETE FROM files WHERE id=?', (item['id'],))
    db.execute('DELETE FROM folders WHERE user_id=? AND is_default=0', (uid,))
    db.commit()
    return jsonify({'success': True, 'deleted_files': len(files_to_delete)})


# ── API: User Settings ─────────────────────────────────────────────────────────
@app.route('/api/user', methods=['GET'])
@login_required
def api_get_user():
    """
    Return profile data.
    Source of truth: Supabase Auth for credentials; Supabase public.users for profile.
    """
    uid  = get_current_user_id()
    db   = get_db()
    user = db.execute('SELECT * FROM users WHERE id=?', (uid,)).fetchone()
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
    data  = request.get_json()
    uid   = get_current_user_id()
    db    = get_db()

    name  = data.get('name', '').strip()
    email = data.get('email', '').strip()

    if name:
        access_token = session.get('access_token')
        if access_token:
            update_user_metadata(access_token, {'name': name})
        db.execute('UPDATE users SET name=? WHERE id=?', (name, uid))

    if email:
        existing = db.execute(
            'SELECT id FROM users WHERE email=? AND id != ?',
            (email, uid)
        ).fetchone()

        if existing:
            return jsonify({'success': False, 'message': 'Email already in use.'})

        access_token = session.get('access_token')
        if access_token:
            result = update_user_email(access_token, email)
            if result.get('error') or result.get('msg'):
                return jsonify({'success': False, 'message': result.get('msg') or result.get('error_description') or 'Unable to update email.'})

        db.execute('UPDATE users SET email=? WHERE id=?', (email, uid))

    db.commit()
    return jsonify({'success': True})


@app.route('/api/user/password', methods=['PUT'])
@login_required
def api_change_password():
    data = request.get_json()

    current_pw = data.get('current_password', '').strip()
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
    user = db.execute('SELECT * FROM users WHERE id=?', (uid,)).fetchone()

    current_auth = sign_in(user['email'], current_pw) if user else {}
    if not user or not current_auth.get('access_token'):
        return jsonify({'success': False, 'message': 'Current password is incorrect.'})

    result = admin_update_user_password(uid, new_pw)
    if result.get('error') or result.get('msg'):
        return jsonify({'success': False, 'message': result.get('msg') or result.get('error_description') or 'Unable to update password.'})

    refreshed_auth = sign_in(user['email'], new_pw)
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


@app.route('/api/user/delete', methods=['DELETE'])
@login_required
def api_delete_account():
    db  = get_db()
    uid = get_current_user_id()

    files = db.execute(
        'SELECT stored_name FROM files WHERE user_id=?',
        (uid,)
    ).fetchall()

    try:
        delete_files([f['stored_name'] for f in files])
    except Exception as e:
        return jsonify({'success': False, 'message': f'Storage delete error: {str(e)}'})

    # delete from database
    db.execute('DELETE FROM files WHERE user_id=?', (uid,))
    db.execute('DELETE FROM folders WHERE user_id=?', (uid,))
    db.execute('DELETE FROM users WHERE id=?', (uid,))
    db.commit()
    admin_delete_user(uid)

    session.clear()

    return jsonify({'success': True})


if __name__ == '__main__':
    with app.app_context():
        init_db()
    app.run(debug=True, port=5000)
