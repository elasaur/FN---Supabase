"""
File Nest - Supabase database module.

The Flask routes in this project were originally written against sqlite3.
This module keeps the small `get_db().execute(...).fetchone()` surface those
routes expect, but sends all reads and writes to Supabase PostgREST.
"""

import os
import re
import requests
from flask import g


SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")

ALLOWED_TABLES = {"users", "folders", "files"}
ALLOWED_FILTER_OPERATORS = {"eq", "neq", "gt", "gte", "lt", "lte"}


def _require_config():
    missing = [
        name
        for name, value in {
            "SUPABASE_URL": SUPABASE_URL,
            "SUPABASE_SERVICE_ROLE_KEY": SUPABASE_SERVICE_ROLE_KEY,
        }.items()
        if not value
    ]
    if missing:
        raise RuntimeError(
            "Missing Supabase database environment variable(s): "
            + ", ".join(missing)
            + ". Add them to .env before running File Nest."
        )


def _normalize(sql):
    return re.sub(r"\s+", " ", sql.strip()).lower()


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


class Row(dict):
    def __init__(self, data):
        super().__init__(data)
        self._values = list(data.values())

    def __getitem__(self, key):
        if isinstance(key, int):
            return self._values[key]
        return super().__getitem__(key)


class Result:
    def __init__(self, rows=None):
        self.rows = [r if isinstance(r, Row) else Row(r) for r in (rows or [])]

    def fetchone(self):
        return self.rows[0] if self.rows else None

    def fetchall(self):
        return self.rows


class SupabaseDB:
    def __init__(self):
        _require_config()
        self.base_url = f"{SUPABASE_URL}/rest/v1"
        self.headers = {
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
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

    def execute(self, sql, params=()):
        query = _normalize(sql)
        params = tuple(params or ())

        if query == "select * from users where email=?":
            return Result(self.select("users", {"email": _filter("eq", params[0])}))
        if query == "select id from users where email=?":
            return Result(self.select("users", {"email": _filter("eq", params[0])}, "id"))
        if query == "select * from users where id=?":
            return Result(self.select("users", {"id": _filter("eq", params[0])}))
        if query == "select id from users where email=? and id != ?":
            rows = self.select("users", {"email": _filter("eq", params[0])}, "id")
            return Result([row for row in rows if str(row["id"]) != str(params[1])])
        if query.startswith("insert into users"):
            payload = {"name": params[0], "email": params[1]}
            return Result(self.insert("users", payload))
        if query.startswith("update users set name=? where id=?"):
            return Result(self.update("users", {"id": _filter("eq", params[1])}, {"name": params[0]}))
        if query.startswith("update users set email=? where id=?"):
            return Result(self.update("users", {"id": _filter("eq", params[1])}, {"email": params[0]}))
        if query == "delete from users where id=?":
            return Result(self.delete("users", {"id": _filter("eq", params[0])}))

        if query.startswith("select count(*) from folders where user_id=?"):
            return Result([{"count": len(self.select("folders", {"user_id": _filter("eq", params[0])}, "id"))}])
        if query.startswith("select count(*) from files where user_id=? and created_at>?"):
            rows = self.select("files", {"user_id": _filter("eq", params[0]), "created_at": _filter("gt", params[1])}, "id")
            return Result([{"count": len(rows)}])
        if query.startswith("select count(*) from files where user_id=? and ai_sorted=1"):
            rows = self.select("files", {"user_id": _filter("eq", params[0]), "ai_sorted": _filter("eq", True)}, "id")
            return Result([{"count": len(rows)}])
        if query.startswith("select count(*) from files"):
            return Result([{"count": len(self.select("files", {"user_id": _filter("eq", params[0])}, "id"))}])

        if query.startswith("select f.*, count(fi.id) as file_count from folders"):
            uid = params[0]
            search = params[1].strip("%").lower() if len(params) > 1 else ""
            folders = self.select("folders", {"user_id": _filter("eq", uid)})
            files = self.select("files", {"user_id": _filter("eq", uid)}, "folder_id")
            counts = {}
            for item in files:
                counts[item["folder_id"]] = counts.get(item["folder_id"], 0) + 1
            rows = []
            for folder in folders:
                if search and search not in folder["name"].lower():
                    continue
                rows.append({**folder, "file_count": counts.get(folder["id"], 0)})
            rows.sort(key=lambda row: (-int(row.get("pinned") or 0), row["name"].lower()))
            return Result(rows)
        if query == "select id from folders where user_id=? and name=?":
            return Result(self.select("folders", {"user_id": _filter("eq", params[0]), "name": _filter("eq", params[1])}, "id"))
        if query == "select * from folders where user_id=? and name=?":
            return Result(self.select("folders", {"user_id": _filter("eq", params[0]), "name": _filter("eq", params[1])}))
        if query == "select * from folders where id=? and user_id=?":
            return Result(self.select("folders", {"id": _filter("eq", params[0]), "user_id": _filter("eq", params[1])}))
        if query == "select id from folders where user_id=? and is_default=1":
            return Result(self.select("folders", {"user_id": _filter("eq", params[0]), "is_default": _filter("eq", True)}, "id"))
        if query == "select * from folders where user_id=?":
            return Result(self.select("folders", {"user_id": _filter("eq", params[0])}))
        if query.startswith("insert into folders"):
            payload = {
                "user_id": params[0],
                "name": params[1],
                "emoji": params[2],
                "color": params[3],
                "bg": params[4],
            }
            if len(params) > 5:
                payload["is_default"] = bool(params[5])
                payload["pinned"] = bool(params[6])
            return Result(self.insert("folders", payload))
        if query.startswith("update folders set name=?, emoji=?, color=?, bg=?, pinned=? where id=?"):
            return Result(self.update("folders", {"id": _filter("eq", params[5])}, {
                "name": params[0],
                "emoji": params[1],
                "color": params[2],
                "bg": params[3],
                "pinned": bool(params[4]),
            }))
        if query == "delete from folders where id=?":
            return Result(self.delete("folders", {"id": _filter("eq", params[0])}))
        if query == "delete from folders where user_id=?":
            return Result(self.delete("folders", {"user_id": _filter("eq", params[0])}))
        if query == "delete from folders where user_id=? and is_default=0":
            return Result(self.delete("folders", {"user_id": _filter("eq", params[0]), "is_default": _filter("eq", False)}))

        if query.startswith("select fi.*, fo.name as folder_name"):
            uid = params[0]
            idx = 1
            folder_id = None
            search = ""
            if "and fi.folder_id = ?" in query:
                folder_id = params[idx]
                idx += 1
            if "and fi.original_name like ?" in query:
                search = params[idx].strip("%").lower()
            files = self.select("files", {"user_id": _filter("eq", uid)})
            folders = {row["id"]: row for row in self.select("folders", {"user_id": _filter("eq", uid)})}
            rows = []
            for item in files:
                if folder_id and str(item["folder_id"]) != str(folder_id):
                    continue
                if search and search not in item["original_name"].lower():
                    continue
                folder = folders.get(item["folder_id"])
                if not folder:
                    continue
                rows.append({
                    **item,
                    "folder_name": folder["name"],
                    "folder_emoji": folder["emoji"],
                    "folder_color": folder["color"],
                    "folder_bg": folder["bg"],
                })
            if "order by fi.original_name asc" in query:
                rows.sort(key=lambda row: row["original_name"].lower())
            elif "order by fi.extension asc" in query:
                rows.sort(key=lambda row: (row.get("extension") or "", row["original_name"].lower()))
            elif "order by fo.name asc" in query:
                rows.sort(key=lambda row: (row["folder_name"].lower(), row["original_name"].lower()))
            else:
                rows.sort(key=lambda row: row.get("created_at") or "", reverse=True)
            return Result(rows)
        if query == "select * from files where id=? and user_id=?":
            return Result(self.select("files", {"id": _filter("eq", params[0]), "user_id": _filter("eq", params[1])}))
        if query == "select stored_name from files where user_id=?":
            return Result(self.select("files", {"user_id": _filter("eq", params[0])}, "stored_name"))
        if query == "select stored_name from files where user_id=? and folder_id=?":
            return Result(self.select("files", {
                "user_id": _filter("eq", params[0]),
                "folder_id": _filter("eq", params[1]),
            }, "stored_name"))
        if query == "select * from files where stored_name=?":
            return Result(self.select("files", {"stored_name": _filter("eq", params[0])}))
        if query.startswith("insert into files"):
            return Result(self.insert("files", {
                "user_id": params[0],
                "folder_id": params[1],
                "original_name": params[2],
                "stored_name": params[3],
                "extension": params[4],
                "file_size": params[5],
                "ai_sorted": bool(params[6]),
                "keywords": params[7],
            }))
        if query == "update files set folder_id=? where id=?":
            return Result(self.update("files", {"id": _filter("eq", params[1])}, {"folder_id": params[0]}))
        if query == "update files set original_name=?, extension=? where id=?":
            return Result(self.update("files", {"id": _filter("eq", params[2])}, {
                "original_name": params[0],
                "extension": params[1],
            }))
        if query == "update files set folder_id=? where folder_id=?":
            return Result(self.update("files", {"folder_id": _filter("eq", params[1])}, {"folder_id": params[0]}))
        if query == "update files set folder_id=? where user_id=? and folder_id != ?":
            rows = self.select("files", {"user_id": _filter("eq", params[1])}, "id,folder_id")
            changed = []
            for row in rows:
                if str(row["folder_id"]) != str(params[2]):
                    changed.extend(self.update("files", {"id": _filter("eq", row["id"])}, {"folder_id": params[0]}))
            return Result(changed)
        if query == "delete from files where id=?":
            return Result(self.delete("files", {"id": _filter("eq", params[0])}))
        if query == "delete from files where user_id=?":
            return Result(self.delete("files", {"user_id": _filter("eq", params[0])}))
        if query == "delete from files where user_id=? and folder_id=?":
            return Result(self.delete("files", {
                "user_id": _filter("eq", params[0]),
                "folder_id": _filter("eq", params[1]),
            }))

        if query.startswith("select fo.name, fo.emoji, fo.color, count(fi.id) as count"):
            uid = params[0]
            folders = self.select("folders", {"user_id": _filter("eq", uid)})
            files = self.select("files", {"user_id": _filter("eq", uid)}, "folder_id")
            counts = {}
            for item in files:
                counts[item["folder_id"]] = counts.get(item["folder_id"], 0) + 1
            rows = [
                {
                    "name": folder["name"],
                    "emoji": folder["emoji"],
                    "color": folder["color"],
                    "count": counts.get(folder["id"], 0),
                }
                for folder in folders
            ]
            rows.sort(key=lambda row: row["count"], reverse=True)
            return Result(rows)

        raise NotImplementedError(f"Supabase adapter does not support query: {sql}")


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
