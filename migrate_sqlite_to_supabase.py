"""
One-time File Nest migration from SQLite to Supabase.

This script creates Supabase Auth users with temporary passwords because the
old SQLite bcrypt hashes cannot be imported into Supabase Auth. It writes the
temporary credentials to `supabase_migration_passwords.csv` so users can sign
in and change their password.
"""

import csv
import mimetypes
import os
import secrets
import sqlite3
from pathlib import Path

import requests
from dotenv import load_dotenv


load_dotenv()

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "filenest.db"
UPLOADS_DIR = ROOT / "uploads"
PASSWORD_REPORT = ROOT / "supabase_migration_passwords.csv"

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
STORAGE_BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "filenest-files")


def require_config():
    missing = [
        name
        for name, value in {
            "SUPABASE_URL": SUPABASE_URL,
            "SUPABASE_SERVICE_ROLE_KEY": SERVICE_ROLE_KEY,
        }.items()
        if not value
    ]
    if missing:
        raise SystemExit(f"Missing required env var(s): {', '.join(missing)}")
    if not DB_PATH.exists():
        raise SystemExit(f"SQLite database not found: {DB_PATH}")


def headers(prefer=False):
    result = {
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        result["Prefer"] = "return=representation"
    return result


def supabase_request(method, path, **kwargs):
    response = requests.request(
        method,
        f"{SUPABASE_URL}{path}",
        headers=kwargs.pop("headers", headers()),
        timeout=30,
        **kwargs,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"{method} {path} failed: {response.text}")
    if not response.text:
        return {}
    return response.json()


def rest_insert(table, payload):
    return supabase_request(
        "POST",
        f"/rest/v1/{table}",
        headers=headers(prefer=True),
        json=payload,
    )


def upload_storage_file(local_path, object_path):
    content_type = mimetypes.guess_type(local_path.name)[0] or "application/octet-stream"
    with local_path.open("rb") as handle:
        response = requests.post(
            f"{SUPABASE_URL}/storage/v1/object/{STORAGE_BUCKET}/{object_path}",
            headers={
                **headers(),
                "Content-Type": content_type,
                "x-upsert": "false",
            },
            data=handle,
            timeout=60,
        )
    if response.status_code >= 400:
        raise RuntimeError(f"Storage upload failed for {local_path}: {response.text}")


def create_auth_user(email, name, password):
    return supabase_request(
        "POST",
        "/auth/v1/admin/users",
        json={
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"name": name},
        },
    )


def fetch_rows(conn, table):
    return [dict(row) for row in conn.execute(f"select * from {table}").fetchall()]


def main():
    require_config()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    users = fetch_rows(conn, "users")
    folders = fetch_rows(conn, "folders")
    files = fetch_rows(conn, "files")

    user_map = {}
    credentials = []

    for user in users:
        temp_password = secrets.token_urlsafe(18)
        created = create_auth_user(user["email"], user["name"], temp_password)
        new_id = created["id"]
        user_map[user["id"]] = new_id
        credentials.append({
            "email": user["email"],
            "temporary_password": temp_password,
        })
        rest_insert("users", {
            "id": new_id,
            "name": user["name"],
            "email": user["email"],
            "created_at": user["created_at"],
        })

    folder_map = {}
    for folder in folders:
        inserted = rest_insert("folders", {
            "user_id": user_map[folder["user_id"]],
            "name": folder["name"],
            "emoji": folder["emoji"],
            "color": folder["color"],
            "bg": folder["bg"],
            "pinned": bool(folder["pinned"]),
            "is_default": bool(folder["is_default"]),
            "created_at": folder["created_at"],
        })
        folder_map[folder["id"]] = inserted[0]["id"]

    for item in files:
        new_user_id = user_map[item["user_id"]]
        storage_path = f"{new_user_id}/{item['stored_name']}"
        local_path = UPLOADS_DIR / item["stored_name"]
        if local_path.exists():
            upload_storage_file(local_path, storage_path)
        else:
            print(f"Warning: local file missing, metadata migrated only: {local_path}")

        rest_insert("files", {
            "user_id": new_user_id,
            "folder_id": folder_map[item["folder_id"]],
            "original_name": item["original_name"],
            "stored_name": storage_path,
            "extension": item["extension"] or "",
            "file_size": item["file_size"] or 0,
            "ai_sorted": bool(item["ai_sorted"]),
            "keywords": item["keywords"] or "",
            "created_at": item["created_at"],
        })

    with PASSWORD_REPORT.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["email", "temporary_password"])
        writer.writeheader()
        writer.writerows(credentials)

    print(f"Migrated {len(users)} users, {len(folders)} folders, and {len(files)} files.")
    print(f"Temporary passwords written to {PASSWORD_REPORT}")


if __name__ == "__main__":
    main()
