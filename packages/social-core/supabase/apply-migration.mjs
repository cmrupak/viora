/**
 * Apply a Viora SQL migration using apps/api DATABASE_URL.
 *
 * Usage:
 *   node packages/social-core/supabase/apply-migration.mjs
 *   node packages/social-core/supabase/apply-migration.mjs 002_phase3_profile_storage.sql
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(here, '../../..');
const require = createRequire(resolve(monorepoRoot, 'apps/api/package.json'));
const pg = require('pg');

function loadEnvFile(path) {
  try {
    const text = readFileSync(path, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

loadEnvFile(resolve(monorepoRoot, 'apps/api/.env'));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL missing (expected in apps/api/.env)');
  process.exit(1);
}

const fileName = process.argv[2] || '001_phase2_auth_profiles.sql';
const sqlPath = resolve(here, 'migrations', fileName);
const sql = readFileSync(sqlPath, 'utf8');

const client = new pg.Client({
  connectionString: databaseUrl,
  ssl: /supabase|sslmode=require/i.test(databaseUrl) ? { rejectUnauthorized: false } : undefined,
});

await client.connect();
try {
  await client.query(sql);
  console.log(`Applied ${fileName} successfully.`);
} finally {
  await client.end();
}
