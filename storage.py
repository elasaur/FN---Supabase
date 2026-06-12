"""
File Nest - Supabase Storage helper.

Uploaded file bytes live in a private Supabase Storage bucket. File metadata
continues to live in public.files, with stored_name holding the object path.
"""

import requests
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import supabase_config


def _require_config():
    supabase_config.require_supabase_config("SUPABASE_STORAGE_BUCKET")


def _headers(content_type=None):
    headers = {
        "apikey": supabase_config.SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {supabase_config.SUPABASE_SERVICE_ROLE_KEY}",
    }
    if content_type:
        headers["Content-Type"] = content_type
    return headers


def make_storage_path(user_id, stored_filename):
    return f"{user_id}/{stored_filename}"


def upload_file(file_storage, object_path, content_type=None):
    _require_config()
    file_storage.stream.seek(0)
    response = requests.post(
        f"{supabase_config.SUPABASE_URL}/storage/v1/object/{supabase_config.SUPABASE_STORAGE_BUCKET}/{object_path}",
        headers={**_headers(content_type or file_storage.mimetype or "application/octet-stream"), "x-upsert": "false"},
        data=file_storage.stream,
        timeout=60,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Supabase Storage upload failed: {response.text}")
    return response.json() if response.text else {}


def create_signed_url(object_path, expires_in=300, download_name=None):
    _require_config()
    response = requests.post(
        f"{supabase_config.SUPABASE_URL}/storage/v1/object/sign/{supabase_config.SUPABASE_STORAGE_BUCKET}/{object_path}",
        headers=_headers("application/json"),
        json={"expiresIn": expires_in},
        timeout=15,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Supabase Storage signed URL failed: {response.text}")
    data = response.json()
    signed_url = data.get("signedURL") or data.get("signedUrl") or data.get("signed_url")
    if signed_url and signed_url.startswith("/"):
        signed_url = f"{supabase_config.SUPABASE_URL}/storage/v1{signed_url}"
    if signed_url and download_name:
        parts = urlsplit(signed_url)
        query = parse_qsl(parts.query, keep_blank_values=True)
        query.append(("download", download_name))
        signed_url = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))
    return signed_url


def delete_files(object_paths):
    _require_config()
    paths = [path for path in object_paths if path]
    if not paths:
        return {}

    deleted = []
    for start in range(0, len(paths), 1000):
        batch = paths[start:start + 1000]
        response = requests.delete(
            f"{supabase_config.SUPABASE_URL}/storage/v1/object/{supabase_config.SUPABASE_STORAGE_BUCKET}",
            headers=_headers("application/json"),
            json={"prefixes": batch},
            timeout=30,
        )
        if response.status_code >= 400:
            raise RuntimeError(f"Supabase Storage delete failed: {response.text}")
        if response.text:
            deleted.extend(response.json())

    return deleted
