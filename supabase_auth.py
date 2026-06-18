"""
Supabase Auth integration for File Nest.

App data lives in Supabase Postgres.
User identity and credentials live entirely in Supabase Auth.
"""

import logging
import os

import requests as http_requests


logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
AUTH_URL = f"{SUPABASE_URL}/auth/v1"


def require_supabase_auth_config():
    missing = [
        name
        for name, value in {
            "SUPABASE_URL": SUPABASE_URL,
            "SUPABASE_ANON_KEY": SUPABASE_ANON_KEY,
        }.items()
        if not value
    ]

    if missing:
        raise EnvironmentError(
            f"\n\n[File Nest] Missing required environment variable(s): {', '.join(missing)}\n"
            "Please copy .env.example -> .env and fill in your Supabase project credentials.\n"
            "You can find them in: Supabase Dashboard -> Project Settings -> API\n"
        )

    if not SUPABASE_URL.startswith("https://"):
        raise EnvironmentError(
            f"\n\n[File Nest] SUPABASE_URL looks invalid: '{SUPABASE_URL}'\n"
            "It must start with 'https://' e.g. https://xyzabcdef.supabase.co\n"
        )


def _json_or_empty(resp):
    try:
        return resp.json()
    except ValueError:
        return {}


def _json_or_error(resp, fallback_message: str) -> dict:
    data = _json_or_empty(resp)
    if resp.status_code >= 400:
        data.setdefault("error", f"supabase_auth_failed_{resp.status_code}")
        data.setdefault("msg", data.get("message") or data.get("error_description") or fallback_message)
    return data


def sign_up(email: str, password: str, name: str) -> dict:
    """Create a new Supabase Auth user."""
    require_supabase_auth_config()
    resp = http_requests.post(
        f"{AUTH_URL}/signup",
        headers={
            "Content-Type": "application/json",
            "apikey": SUPABASE_ANON_KEY,
        },
        json={
            "email": email,
            "password": password,
            "data": {"name": name},
        },
        timeout=10,
    )
    data = _json_or_error(resp, "Unable to create account.")
    logger.info("Supabase sign_up status=%s", resp.status_code)
    return data


def sign_in(email: str, password: str) -> dict:
    """Sign in with email and password via Supabase Auth."""
    require_supabase_auth_config()
    resp = http_requests.post(
        f"{AUTH_URL}/token?grant_type=password",
        headers={
            "Content-Type": "application/json",
            "apikey": SUPABASE_ANON_KEY,
        },
        json={"email": email, "password": password},
        timeout=10,
    )
    data = _json_or_empty(resp)
    logger.info("Supabase sign_in status=%s", resp.status_code)
    return data


def refresh_session(refresh_token: str) -> dict:
    """Refresh a Supabase Auth session using the stored refresh token."""
    require_supabase_auth_config()
    if not refresh_token:
        return {}

    resp = http_requests.post(
        f"{AUTH_URL}/token?grant_type=refresh_token",
        headers={
            "Content-Type": "application/json",
            "apikey": SUPABASE_ANON_KEY,
        },
        json={"refresh_token": refresh_token},
        timeout=10,
    )
    data = _json_or_error(resp, "Session expired. Please log in again.")
    logger.info("Supabase refresh_session status=%s", resp.status_code)
    return data


def sign_out(access_token: str) -> bool:
    """Invalidate the access token on Supabase."""
    require_supabase_auth_config()
    resp = http_requests.post(
        f"{AUTH_URL}/logout",
        headers={
            "Authorization": f"Bearer {access_token}",
            "apikey": SUPABASE_ANON_KEY,
        },
        timeout=5,
    )
    return resp.status_code in (200, 204)


def get_auth_user(access_token: str) -> dict:
    """Fetch the Supabase Auth user tied to the current access token."""
    require_supabase_auth_config()
    if not access_token:
        return {}

    resp = http_requests.get(
        f"{AUTH_URL}/user",
        headers={
            "Authorization": f"Bearer {access_token}",
            "apikey": SUPABASE_ANON_KEY,
        },
        timeout=10,
    )
    data = _json_or_empty(resp)
    if resp.status_code >= 400:
        data.setdefault("error", f"supabase_get_user_failed_{resp.status_code}")
        data.setdefault("msg", data.get("message") or "Unable to verify current user.")
    return data


def update_user_email(access_token: str, new_email: str) -> dict:
    """Update the authenticated user's email via Supabase Auth."""
    require_supabase_auth_config()
    resp = http_requests.put(
        f"{AUTH_URL}/user",
        headers={
            "Authorization": f"Bearer {access_token}",
            "apikey": SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
        },
        json={"email": new_email},
        timeout=10,
    )
    return _json_or_error(resp, "Unable to update email.")


def update_user_password(access_token: str, new_password: str) -> dict:
    """Update the authenticated user's password via Supabase Auth."""
    require_supabase_auth_config()
    resp = http_requests.put(
        f"{AUTH_URL}/user",
        headers={
            "Authorization": f"Bearer {access_token}",
            "apikey": SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
        },
        json={"password": new_password},
        timeout=10,
    )
    return _json_or_error(resp, "Unable to update password.")


def admin_update_user_password(user_id: str, new_password: str) -> dict:
    """Update a user's password after the app verifies their current password."""
    require_supabase_auth_config()
    if not SUPABASE_SERVICE_ROLE_KEY:
        return {
            "error": "missing_service_role_key",
            "msg": "Server is missing SUPABASE_SERVICE_ROLE_KEY.",
        }

    resp = http_requests.put(
        f"{AUTH_URL}/admin/users/{user_id}",
        headers={
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type": "application/json",
        },
        json={"password": new_password},
        timeout=10,
    )
    data = _json_or_empty(resp)
    if resp.status_code >= 400:
        data.setdefault("error", f"supabase_admin_update_failed_{resp.status_code}")
        data.setdefault("msg", data.get("message") or "Unable to update password.")
    return data


def update_user_metadata(access_token: str, metadata: dict) -> dict:
    """Update user_metadata for the authenticated user."""
    require_supabase_auth_config()
    resp = http_requests.put(
        f"{AUTH_URL}/user",
        headers={
            "Authorization": f"Bearer {access_token}",
            "apikey": SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
        },
        json={"data": metadata},
        timeout=10,
    )
    return _json_or_error(resp, "Unable to update profile.")


def admin_delete_user(user_id: str) -> bool:
    """Permanently delete a Supabase Auth user with the service role key."""
    require_supabase_auth_config()
    if not SUPABASE_SERVICE_ROLE_KEY:
        return False
    resp = http_requests.delete(
        f"{AUTH_URL}/admin/users/{user_id}",
        headers={
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
        },
        timeout=10,
    )
    return resp.status_code in (200, 204)


def reset_password_for_email(email: str, redirect_to: str = "") -> dict:
    """Send a password-reset email via Supabase Auth."""
    require_supabase_auth_config()
    body = {"email": email}
    if redirect_to:
        body["redirectTo"] = redirect_to
    resp = http_requests.post(
        f"{AUTH_URL}/recover",
        headers={
            "Content-Type": "application/json",
            "apikey": SUPABASE_ANON_KEY,
        },
        json=body,
        timeout=10,
    )
    return _json_or_empty(resp)
