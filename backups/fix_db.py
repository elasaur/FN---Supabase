"""
fix_db.py
─────────────────────────────────────────────────────────────────────────────
Run this ONCE to repair the broken migration state where the users table
got renamed to users_old but never recreated.

    python fix_db.py
"""

import sqlite3
import os
import shutil
from datetime import datetime

db_path = r"c:\Users\ellyx\File Nest Project - hardcoded auth\filenest.db"

if not os.path.exists(db_path):
    print(f"[ERROR] Database not found at:\n  {db_path}")
    print("Edit db_path in this script to point to your filenest.db location.")
    exit(1)

# Safety backup
backup = db_path + f".bak_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
shutil.copy2(db_path, backup)
print(f"[OK]  Backup created → {backup}")

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cur  = conn.cursor()

tables = [r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
print(f"[INFO] Tables found: {tables}")

if 'users_old' in tables and 'users' not in tables:
    # Migration crashed halfway — users_old exists but users does not
    cols = [r[1] for r in cur.execute("PRAGMA table_info(users_old)").fetchall()]
    print(f"[INFO] users_old columns: {cols}")

    cur.executescript("""
        CREATE TABLE users (
            id         TEXT PRIMARY KEY,
            name       TEXT NOT NULL,
            email      TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO users (id, name, email, created_at)
        SELECT id, name, email, created_at FROM users_old;
        DROP TABLE users_old;
    """)
    conn.commit()
    print("[OK]  users table recreated from users_old, users_old dropped.")
    print("[OK]  Migration complete — you can now restart Flask.")

elif 'users' in tables and 'users_old' in tables:
    # Both exist — migration finished but didn't clean up
    cur.execute("DROP TABLE users_old")
    conn.commit()
    print("[OK]  Dropped leftover users_old table.")
    print("[OK]  Database is clean — you can now restart Flask.")

elif 'users' in tables and 'users_old' not in tables:
    print("[OK]  Database already looks fine — users table exists, no users_old.")

else:
    print(f"[ERROR] Unexpected state: {tables}")
    print("Please share this output so we can investigate.")

conn.close()