"""
migrate_to_supabase_auth.py
──────────────────────────────────────────────────────────────────────────────
One-time migration script.

What it does
────────────
1. Recreates the `users` table WITHOUT the `password_hash` column.
   Identity/credential data now lives exclusively in Supabase Auth.
   SQLite keeps: id (Supabase UUID), name, email, created_at.

2. Keeps all existing rows — name, email, created_at are preserved.
   The `id` column must already contain the Supabase Auth UUID for each user.
   If you were using auto-increment integers before, you must update those
   first (map old int IDs → Supabase UUIDs) before running this script.

3. Leaves the `folders` and `files` tables completely untouched.

Run once
────────
    python migrate_to_supabase_auth.py

Back up filenest.db before running.
"""

import os
import shutil
import sqlite3
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), 'filenest.db')
BACKUP  = DB_PATH + f'.bak_{datetime.now().strftime("%Y%m%d_%H%M%S")}'


def migrate():
    # ── Safety backup ──────────────────────────────────────────────────────────
    if not os.path.exists(DB_PATH):
        print(f"[ERROR] Database not found at {DB_PATH}")
        return

    shutil.copy2(DB_PATH, BACKUP)
    print(f"[OK]  Backup created → {BACKUP}")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur  = conn.cursor()

    # ── Check current schema ───────────────────────────────────────────────────
    cols = {row[1] for row in cur.execute("PRAGMA table_info(users)")}
    print(f"[INFO] Current users columns: {cols}")

    if 'password_hash' not in cols:
        print("[INFO] password_hash column not found — already migrated or schema differs.")
        conn.close()
        return

    # ── Migrate inside a transaction ───────────────────────────────────────────
    try:
        cur.executescript("""
            BEGIN;

            -- Step 1: rename old table
            ALTER TABLE users RENAME TO users_old;

            -- Step 2: create new table without password_hash
            CREATE TABLE users (
                id         TEXT    PRIMARY KEY,   -- Supabase Auth UUID
                name       TEXT    NOT NULL,
                email      TEXT,
                created_at TEXT    NOT NULL DEFAULT (datetime('now'))
            );

            -- Step 3: copy existing rows (drop password_hash)
            INSERT INTO users (id, name, email, created_at)
            SELECT id, name, email, created_at
            FROM   users_old;

            -- Step 4: drop old table
            DROP TABLE users_old;

            COMMIT;
        """)
        print("[OK]  Migration complete — password_hash column removed.")
        print("[OK]  folders and files tables are unchanged.")
    except Exception as e:
        conn.rollback()
        print(f"[ERROR] Migration failed: {e}")
        print(f"[INFO]  Restore from backup: cp '{BACKUP}' '{DB_PATH}'")
    finally:
        conn.close()


if __name__ == '__main__':
    migrate()