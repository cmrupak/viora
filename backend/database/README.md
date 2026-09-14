# Viora MySQL database (Phase 2)

Local-only schema for the PHP + MySQLi backend migration.

## Files

| Path | Purpose |
|------|---------|
| `schema.sql` | Full MySQL schema (mapped from Supabase migrations 001–016) |
| `migrations/` | Future incremental SQL (empty for Phase 2) |

## Apply on Laragon

```bash
# Create DB (once)
mysql -u root -e "CREATE DATABASE IF NOT EXISTS viora CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Import schema
mysql -u root viora < backend/database/schema.sql
```

If MySQL has a password: `mysql -u root -p viora < ...`

## Design notes

- **PKs:** `CHAR(36)` UUID (app-generated; PHP will set ids)
- **Auth:** `users` + `auth_sessions` replace Supabase `auth.users`
- **Profiles:** `profiles.id` FK → `users.id`
- **Booleans:** `TINYINT(1)`
- **Timestamps:** `DATETIME(6)` UTC
- **JSON:** MySQL `JSON` (stickers, metadata, responses)
- **Reserved word:** table `` `groups` `` is quoted
- **Media:** `media_objects` tracks uploaded files (Phase 5)

## Not included yet

- RLS policies → PHP authorization in Phase 3–4
- Triggers/counters → PHP services or later SQL triggers
- Seed data
- Production host DB (do not apply until explicitly requested)

## Verify

```sql
USE viora;
SHOW TABLES;
SELECT COUNT(*) AS table_count FROM information_schema.tables
  WHERE table_schema = 'viora';
```

Expect **70** tables (domain tables from migrations 001–016 + `users` + `auth_sessions` + `media_objects`).
