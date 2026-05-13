# Supabase Migration Guide

## Complete Supabase SQL Schema

Use `supabase_schema.sql`. It creates:

- `public.users`
- `public.folders`
- `public.files`
- indexes for `user_id` and `folder_id`
- `public.folder_belongs_to_user(...)`
- private Storage bucket `filenest-files`

## RLS Policies

`supabase_schema.sql` enables RLS on:

- `public.users`
- `public.folders`
- `public.files`

Every table policy uses `auth.uid()` so authenticated users can only read, create, update, or delete their own rows.

`public.files` also checks:

- the file belongs to the authenticated user
- the target folder belongs to the same user
- `stored_name` starts with `{user_id}/`

## Storage Policies

`supabase_schema.sql` creates policies on `storage.objects` for:

- select
- insert
- update
- delete

Every Storage object must be in bucket `filenest-files`, and its first path segment must match `auth.uid()`.

Example valid object path:

```text
{user_uuid}/20260508123456789000_report.pdf
```

## Storage Bucket Setup

The SQL creates or updates:

```text
bucket id: filenest-files
public: false
file_size_limit: 52428800
```

The Flask server uses signed URLs for downloads.

## Updated Database Helper Functions

`database.py` contains the Supabase PostgREST helper used by Flask routes:

- `get_db()`
- `close_db()`
- `init_db()`
- `SupabaseDB.select(...)`
- `SupabaseDB.insert(...)`
- `SupabaseDB.update(...)`
- `SupabaseDB.delete(...)`
- `SupabaseDB.execute(...)`

`storage.py` contains Supabase Storage helpers:

- `make_storage_path(...)`
- `upload_file(...)`
- `upload_local_file(...)`
- `create_signed_url(...)`
- `delete_files(...)`

## Updated Flask Routes

`app.py` now stores uploaded file bytes in Supabase Storage and file metadata in `public.files`.

Updated areas:

- signup/login/logout through Supabase Auth
- folder CRUD through Supabase PostgreSQL
- file metadata through Supabase PostgreSQL
- upload and AI confirm upload through Supabase Storage
- download through signed Storage URLs
- file deletion from Storage and metadata
- account deletion from Storage, metadata, and Supabase Auth

## Required Python Packages

The app uses:

```text
Flask
Flask-Limiter
python-dotenv
requests
Werkzeug
google-genai
TextBlob
scikit-learn
pdfplumber
python-docx
python-pptx
openpyxl
```

The pinned dependency list is in `requirements.txt`.

## Environment Variables

Use `.env.example`:

```text
FLASK_SECRET_KEY=change-me
BASE_URL=http://127.0.0.1:5000
PASSWORD_RESET_REDIRECT_URL=http://127.0.0.1:5000/update-password
FORGOT_PASSWORD_REDIRECT_URL=http://127.0.0.1:5000/update-password
CHANGE_PASSWORD_REDIRECT_URL=http://127.0.0.1:5000/change-password

SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_STORAGE_BUCKET=filenest-files

GEMINI_API_KEY=your-gemini-key
```

## Migration Steps From SQLite To Supabase

1. Back up `filenest.db` and `uploads/`.
2. Create a Supabase project.
3. In Supabase Dashboard -> SQL Editor, run `supabase_schema.sql`.
4. Copy `.env.example` to `.env`.
5. Fill in Supabase URL, anon key, service role key, and bucket name.
6. Install dependencies from `requirements.txt`.
7. Run:

```bash
python migrate_sqlite_to_supabase.py
```

8. Give users the temporary passwords from `supabase_migration_passwords.csv`.
9. Start Flask and test signup, login, upload, download, delete, and account deletion.

## Recommended Project Structure

```text
FN - Supabase/
  app.py
  database.py
  storage.py
  supabase_auth.py
  supabase_schema.sql
  migrate_sqlite_to_supabase.py
  SUPABASE_MIGRATION.md
  requirements.txt
  .env.example
  static/
  templates/
  uploads/
```

Permanent uploaded files live in Supabase Storage. The local `uploads/` directory is only used for temporary analysis files and migration input.
