"""
Shared Supabase environment configuration.
"""

import os


SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_STORAGE_BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "filenest-files")


def require_supabase_config(*extra_names):
    values = {
        "SUPABASE_URL": SUPABASE_URL,
        "SUPABASE_SERVICE_ROLE_KEY": SUPABASE_SERVICE_ROLE_KEY,
        "SUPABASE_STORAGE_BUCKET": SUPABASE_STORAGE_BUCKET,
    }
    required = ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", *extra_names)
    missing = [name for name in required if not values.get(name)]
    if missing:
        raise RuntimeError(
            "Missing Supabase environment variable(s): "
            + ", ".join(missing)
            + ". Add them to .env before running File Nest."
        )
