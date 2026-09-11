import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { handlePasswordOtp, type PasswordOtpRequest } from '../../../netlify/functions/_lib/passwordOtp';

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function readJson(req: import('http').IncomingMessage): Promise<PasswordOtpRequest> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8') || '{}';
        resolvePromise(JSON.parse(raw) as PasswordOtpRequest);
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

/** Local `/api/password-otp` for Vite dev (same contract as Netlify function). */
export function passwordOtpDevPlugin(repoRoot: string): Plugin {
  return {
    name: 'viora-password-otp-dev',
    configureServer(server) {
      loadEnvFile(resolve(repoRoot, '.env.smtp'));
      loadEnvFile(resolve(repoRoot, 'apps/api/.env'));
      loadEnvFile(resolve(repoRoot, 'apps/social-web/.env'));

      server.middlewares.use('/api/password-otp', async (req, res, next) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }
        if (req.method !== 'POST') {
          next();
          return;
        }
        try {
          const body = await readJson(req);
          const result = await handlePasswordOtp(body);
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to process request.';
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: false, message }));
        }
      });
    },
  };
}
