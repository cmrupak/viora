import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '../.env') });

/**
 * Creates the `viora` database if missing, then runs table migrations.
 * Usage: npm run db:setup --workspace=@viora/api
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('Set DATABASE_URL in apps/api/.env first (replace YOUR_PASSWORD).');
  }

  const parsed = new URL(url);
  const dbName = parsed.pathname.replace(/^\//, '') || 'viora';
  const adminUrl = new URL(url);
  adminUrl.pathname = '/postgres';

  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (exists.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${dbName}"`);
    console.log(`Created database: ${dbName}`);
  } else {
    console.log(`Database already exists: ${dbName}`);
  }
  await admin.end();

  const { runMigrations } = await import('./auth.ts');
  await runMigrations();
  console.log('Postgres schema migrated and demo users seeded.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
