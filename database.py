"""
File Nest - Supabase database module.
"""

import requests
from flask import g

import supabase_config


ALLOWED_TABLES = {"users", "folders", "files"}
ALLOWED_FILTER_OPERATORS = {"eq", "neq", "gt", "gte", "lt", "lte"}


def _require_config():
    supabase_config.require_supabase_config()


def _filter(operator, value):
    """
    Build a PostgREST filter safely.

    The table names, filter keys, and operators are selected by application
    code, while requests handles URL encoding for the value. Keeping the
    operator allow-listed prevents callers from smuggling arbitrary PostgREST
    expressions into this adapter.
    """
    if operator not in ALLOWED_FILTER_OPERATORS:
        raise ValueError("Unsupported filter operator.")
    if value is None:
        raise ValueError("Filter value cannot be empty.")
    if isinstance(value, bool):
        raw = "true" if value else "false"
    else:
        raw = str(value)
    return f"{operator}.{raw}"


class SupabaseDB:
    def __init__(self):
        _require_config()
        self.base_url = f"{supabase_config.SUPABASE_URL}/rest/v1"
        self.headers = {
            "apikey": supabase_config.SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {supabase_config.SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
        }

    def commit(self):
        return None

    def close(self):
        return None

    def _request(self, method, table, params=None, json=None, return_rows=False):
        if table not in ALLOWED_TABLES:
            raise ValueError("Unsupported table.")
        headers = dict(self.headers)
        if return_rows:
            headers["Prefer"] = "return=representation"
        response = requests.request(
            method,
            f"{self.base_url}/{table}",
            headers=headers,
            params=params or {},
            json=json,
            timeout=15,
        )
        if response.status_code >= 400:
            raise RuntimeError(f"Supabase {method} {table} failed: {response.text}")
        if not response.text:
            return []
        return response.json()

    def select(self, table, filters=None, select="*", order=None):
        if table not in ALLOWED_TABLES:
            raise ValueError("Unsupported table.")
        params = {"select": select}
        for key, value in (filters or {}).items():
            params[key] = value
        if order:
            params["order"] = order
        return self._request("GET", table, params=params)

    def insert(self, table, payload):
        if table not in ALLOWED_TABLES:
            raise ValueError("Unsupported table.")
        return self._request("POST", table, json=payload, return_rows=True)

    def update(self, table, filters, payload):
        if table not in ALLOWED_TABLES:
            raise ValueError("Unsupported table.")
        return self._request("PATCH", table, params=filters, json=payload, return_rows=True)

    def delete(self, table, filters):
        if table not in ALLOWED_TABLES:
            raise ValueError("Unsupported table.")
        return self._request("DELETE", table, params=filters, return_rows=True)


def get_db():
    if "db" not in g:
        g.db = SupabaseDB()
    return g.db


def close_db(e=None):
    db = g.pop("db", None)
    if db:
        db.close()


def init_db():
    _require_config()
