"""
supabase_auth.py
Supabase Auth integration for File Nest.

Responsibilities:
  - Verify Supabase JWT access tokens from the Authorization header
  - Extract user_id (sub claim) from the verified token
  - Provide a login_required decorator that works with Supabase Auth

App data lives in Supabase Postgres.
User identity/credentials live entirely in Supabase Auth.
"""

import os
import json
import base64
import hashlib
import hmac
import time
import logging
from functools import wraps
from flask import request, jsonify, session

logger = logging.getLogger(__name__)

import requests as http_requests  # renamed to avoid conflict with Flask's `request`

# ── Config ─────────────────────────────────────────────────────────────────────
SUPABASE_URL              = os.getenv('SUPABASE_URL',              '').rstrip('/')
SUPABASE_ANON_KEY         = os.getenv('SUPABASE_ANON_KEY',         '')
SUPABASE_SERVICE_ROLE_KEY = os.getenv('SUPABASE_SERVICE_ROLE_KEY', '')

# ── Validate required env vars at import time ──────────────────────────────────
def require_supabase_auth_config():
    missing = [k for k, v in {
        'SUPABASE_URL':      SUPABASE_URL,
        'SUPABASE_ANON_KEY': SUPABASE_ANON_KEY,
    }.items() if not v]

    if missing:
        raise EnvironmentError(
            f"\n\n[File Nest] Missing required environment variable(s): {', '.join(missing)}\n"
            "Please copy .env.example -> .env and fill in your Supabase project credentials.\n"
            "You can find them in: Supabase Dashboard -> Project Settings -> API\n"
        )

    if not SUPABASE_URL.startswith('https://'):
        raise EnvironmentError(
            f"\n\n[File Nest] SUPABASE_URL looks invalid: '{SUPABASE_URL}'\n"
            "It must start with 'https://' e.g. https://xyzabcdef.supabase.co\n"
        )
# Supabase Auth REST base
AUTH_URL = f"{SUPABASE_URL}/auth/v1"


def _json_or_empty(resp):
    try:
        return resp.json()
    except ValueError:
        return {}


# ── JWT Decode (no external library needed) ────────────────────────────────────
def _b64_decode(s: str) -> bytes:
    """URL-safe base64 decode with padding fix."""
    s += '=' * (-len(s) % 4)
    return base64.urlsafe_b64decode(s)


def decode_jwt_payload(token: str) -> dict:
    """
    Decode the payload of a JWT without verifying the signature.
    Supabase verifies tokens server-side; we trust the Supabase /auth/v1/user
    endpoint to validate the token and return the user object.
    """
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return {}
        payload = json.loads(_b64_decode(parts[1]))
        return payload
    except Exception:
        return {}


# ── Token Verification via Supabase REST ──────────────────────────────────────
def verify_token(access_token: str) -> dict | None:
    """
    Verify an access token by calling Supabase Auth's /user endpoint.
    Returns the Supabase user dict on success, None on failure.

    This is the authoritative verification — Supabase validates the JWT
    signature, expiry, and revocation status server-side.
    """
    require_supabase_auth_config()
    if not access_token:
        return None
    try:
        resp = http_requests.get(
            f"{AUTH_URL}/user",
            headers={
                'Authorization': f'Bearer {access_token}',
                'apikey': SUPABASE_ANON_KEY,
            },
            timeout=5,
        )
        if resp.status_code == 200:
            return _json_or_empty(resp)   # { id, email, user_metadata, ... }
        return None
    except Exception:
        return None


# ── Extract Token from Request ────────────────────────────────────────────────
def get_token_from_request() -> str | None:
    """
    Look for the bearer token in:
      1. Authorization: Bearer <token>   header  (API / fetch calls)
      2. X-Access-Token                  header  (alternative)
      3. Session cookie 'access_token'            (browser session fallback)
    """
    auth_header = request.headers.get('Authorization', '')
    if auth_header.startswith('Bearer '):
        return auth_header[7:]

    alt = request.headers.get('X-Access-Token', '')
    if alt:
        return alt

    # Fallback: token stored in server-side Flask session after login
    return session.get('access_token')


# ── Decorator ─────────────────────────────────────────────────────────────────
def login_required(f):
    """
    Decorator that:
      1. Extracts the Supabase access token from the request.
      2. Verifies it against Supabase Auth.
      3. Injects `supabase_user_id` into the Flask `g` object so route
         handlers can use it without re-verifying.
      4. Also stores it in session for convenience.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        from flask import g
        token = get_token_from_request()
        if not token:
            return jsonify({'success': False, 'message': 'Authentication required.'}), 401

        user = verify_token(token)
        if not user:
            return jsonify({'success': False, 'message': 'Invalid or expired session. Please log in again.'}), 401

        # Make user info available in the request context
        g.supabase_user    = user
        g.supabase_user_id = user['id']          # UUID used as user_id in Supabase tables
        g.supabase_email   = user.get('email', '')
        return f(*args, **kwargs)
    return decorated


# ── Supabase Auth API Helpers ─────────────────────────────────────────────────
def sign_up(email: str, password: str, name: str) -> dict:
    """
    Create a new Supabase Auth user.
    Returns Supabase response dict.
    """
    require_supabase_auth_config()
    resp = http_requests.post(
        f"{AUTH_URL}/signup",
        headers={
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
        },
        json={
            'email': email,
            'password': password,
            'data': {'name': name},
        },
        timeout=10,
    )
    data = _json_or_empty(resp)
    # Always print the raw Supabase response so errors are visible in the console
    print(f"[Supabase sign_up] status={resp.status_code} response={data}")
    return data


def sign_in(email: str, password: str) -> dict:
    """
    Sign in with email + password via Supabase Auth.
    Returns Supabase session dict (includes access_token, refresh_token, user).
    """
    require_supabase_auth_config()
    resp = http_requests.post(
        f"{AUTH_URL}/token?grant_type=password",
        headers={
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
        },
        json={'email': email, 'password': password},
        timeout=10,
    )
    data = _json_or_empty(resp)
    print(f"[Supabase sign_in] status={resp.status_code} response={data}")
    return data


def sign_out(access_token: str) -> bool:
    """Invalidate the access token on Supabase."""
    require_supabase_auth_config()
    resp = http_requests.post(
        f"{AUTH_URL}/logout",
        headers={
            'Authorization': f'Bearer {access_token}',
            'apikey': SUPABASE_ANON_KEY,
        },
        timeout=5,
    )
    return resp.status_code in (200, 204)


def update_user_email(access_token: str, new_email: str) -> dict:
    """Update the authenticated user's email via Supabase Auth."""
    require_supabase_auth_config()
    resp = http_requests.put(
        f"{AUTH_URL}/user",
        headers={
            'Authorization': f'Bearer {access_token}',
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
        },
        json={'email': new_email},
        timeout=10,
    )
    return _json_or_empty(resp)


def update_user_password(access_token: str, new_password: str) -> dict:
    """Update the authenticated user's password via Supabase Auth."""
    require_supabase_auth_config()
    resp = http_requests.put(
        f"{AUTH_URL}/user",
        headers={
            'Authorization': f'Bearer {access_token}',
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
        },
        json={'password': new_password},
        timeout=10,
    )
    return _json_or_empty(resp)


def update_user_metadata(access_token: str, metadata: dict) -> dict:
    """Update user_metadata (e.g. name) for the authenticated user."""
    require_supabase_auth_config()
    resp = http_requests.put(
        f"{AUTH_URL}/user",
        headers={
            'Authorization': f'Bearer {access_token}',
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
        },
        json={'data': metadata},
        timeout=10,
    )
    return _json_or_empty(resp)


def admin_delete_user(user_id: str) -> bool:
    """
    Permanently delete a Supabase Auth user (requires service role key).
    Called when the user deletes their account.
    """
    require_supabase_auth_config()
    if not SUPABASE_SERVICE_ROLE_KEY:
        return False
    resp = http_requests.delete(
        f"{AUTH_URL}/admin/users/{user_id}",
        headers={
            'Authorization': f'Bearer {SUPABASE_SERVICE_ROLE_KEY}',
            'apikey': SUPABASE_SERVICE_ROLE_KEY,
        },
        timeout=10,
    )
    return resp.status_code in (200, 204)


def reset_password_for_email(email: str, redirect_to: str = '') -> dict:
    """
    Send a password-reset email via Supabase Auth.
    This replaces the manual reset-password flow.
    """
    require_supabase_auth_config()
    body = {'email': email}
    if redirect_to:
        body['redirectTo'] = redirect_to
    resp = http_requests.post(
        f"{AUTH_URL}/recover",
        headers={
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
        },
        json=body,
        timeout=10,
    )
    return _json_or_empty(resp)
