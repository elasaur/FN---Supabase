"""
File Nest - Supabase Storage helper.

Uploaded file bytes live in a private Supabase Storage bucket. File metadata
continues to live in public.files, with stored_name holding the object path.
"""

import os

import requests


SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_STORAGE_BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "filenest-files")


def _require_config():
    missing = [
        name
        for name, value in {
            "SUPABASE_URL": SUPABASE_URL,
            "SUPABASE_SERVICE_ROLE_KEY": SUPABASE_SERVICE_ROLE_KEY,
            "SUPABASE_STORAGE_BUCKET": SUPABASE_STORAGE_BUCKET,
        }.items()
        if not value
    ]
    if missing:
        raise RuntimeError(
            "Missing Supabase Storage environment variable(s): "
            + ", ".join(missing)
            + ". Add them to .env before running File Nest."
        )


def _headers(content_type=None):
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
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
        f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_STORAGE_BUCKET}/{object_path}",
        headers={**_headers(content_type or file_storage.mimetype or "application/octet-stream"), "x-upsert": "false"},
        data=file_storage.stream,
        timeout=60,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Supabase Storage upload failed: {response.text}")
    return response.json() if response.text else {}


def create_signed_url(object_path, expires_in=300):
    _require_config()
    response = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/sign/{SUPABASE_STORAGE_BUCKET}/{object_path}",
        headers=_headers("application/json"),
        json={"expiresIn": expires_in},
        timeout=15,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Supabase Storage signed URL failed: {response.text}")
    data = response.json()
    signed_url = data.get("signedURL") or data.get("signedUrl") or data.get("signed_url")
    if signed_url and signed_url.startswith("/"):
        signed_url = f"{SUPABASE_URL}/storage/v1{signed_url}"
    return signed_url


def delete_files(object_paths):
    _require_config()
    paths = [path for path in object_paths if path]
    if not paths:
        return {}
    response = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_STORAGE_BUCKET}/remove",
        headers=_headers("application/json"),
        json={"prefixes": paths},
        timeout=30,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Supabase Storage delete failed: {response.text}")
    return response.json() if response.text else {}
