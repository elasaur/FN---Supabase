# File Nest

File Nest uses Supabase for authentication, PostgreSQL metadata, and private file storage.

## Project Structure

- `app.py` - Flask routes and request handling.
- `database.py` - Supabase PostgREST helper for users, folders, and file metadata.
- `storage.py` - Supabase Storage upload, delete, and signed URL helper.
- `supabase_auth.py` - Supabase Auth REST helper.
- `supabase_schema.sql` - Complete SQL schema, RLS policies, bucket setup, and Storage policies.
- `migrate_sqlite_to_supabase.py` - One-time migration from `filenest.db` and local `uploads/`.
- `templates/` - Flask templates.
- `static/` - Frontend CSS and JS.
- `uploads/` - Temporary analysis workspace only. Permanent files are stored in Supabase Storage.

## Environment Variables

Copy `.env.example` to `.env` and set:

- `FLASK_SECRET_KEY`
- `BASE_URL`
- `PASSWORD_RESET_REDIRECT_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET`
- `GEMINI_API_KEY`

## Supabase Setup

1. Open Supabase Dashboard -> SQL Editor.
2. Run `supabase_schema.sql`.
3. Confirm the private Storage bucket `filenest-files` exists.
4. Install dependencies from `requirements.txt`.
5. Run the app.

## Security

- Confidentiality: Supabase Auth protects credentials, Flask stores only server-side session data in signed cookies, Storage objects are private, and file access uses signed URLs.
- Integrity: database writes use parameter-style route calls plus validated PostgREST filters, user/folder/file ownership is checked before mutations, and RLS policies enforce `auth.uid()`.
- Availability: sessions use a 30-minute sliding timeout with a clear re-login flow, and rate limits protect reset-password, login-sensitive, and file-analysis endpoints.

## SQLite Migration

After the schema exists and `.env` is configured, run:

```bash
python migrate_sqlite_to_supabase.py
```

The migration script:

- Creates Supabase Auth users.
- Writes temporary passwords to `supabase_migration_passwords.csv`.
- Migrates `users`, `folders`, and `files` metadata to Supabase PostgreSQL.
- Uploads files from local `uploads/` into Supabase Storage.
- Stores each file object as `{user_uuid}/{old_stored_name}`.

SQLite bcrypt password hashes cannot be imported into Supabase Auth, so migrated users must sign in with the generated temporary password and change it.
