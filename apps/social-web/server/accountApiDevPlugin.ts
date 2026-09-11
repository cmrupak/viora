import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { handler as accountExportHandler } from '../../../netlify/functions/account-export';
import { handler as accountDeleteHandler } from '../../../netlify/functions/account-delete';

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

function readBody(req: import('http').IncomingMessage): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolvePromise(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function mount(
  path: string,
  handler: (event: {
    httpMethod: string;
    body: string | null;
    headers: Record<string, string | undefined>;
  }) => Promise<{ statusCode: number; headers?: Record<string, string>; body: string }>,
): (req: import('http').IncomingMessage, res: import('http').ServerResponse, next: () => void) => void {
  return async (req, res, next) => {
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
      const body = await readBody(req);
      const result = await handler({
        httpMethod: 'POST',
        body,
        headers: {
          authorization: req.headers.authorization,
          Authorization: req.headers.authorization,
        },
      });
      res.statusCode = result.statusCode;
      res.setHeader('Content-Type', 'application/json');
      res.end(result.body);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to process request.';
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, message }));
    }
  };
}

/** Local `/api/account-export` + `/api/account-delete` for Vite dev. */
export function accountApiDevPlugin(repoRoot: string): Plugin {
  return {
    name: 'viora-account-api-dev',
    configureServer(server) {
      loadEnvFile(resolve(repoRoot, '.env.smtp'));
      loadEnvFile(resolve(repoRoot, 'apps/api/.env'));
      loadEnvFile(resolve(repoRoot, 'apps/social-web/.env'));

      server.middlewares.use('/api/account-export', mount('/api/account-export', accountExportHandler));
      server.middlewares.use('/api/account-delete', mount('/api/account-delete', accountDeleteHandler));
    },
  };
}
