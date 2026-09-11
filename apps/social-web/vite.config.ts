import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';
import { passwordOtpDevPlugin } from './server/passwordOtpDevPlugin';
import { accountApiDevPlugin } from './server/accountApiDevPlugin';

const repoRoot = resolve(__dirname, '../..');

export default defineConfig({
  plugins: [react(), tailwindcss(), passwordOtpDevPlugin(repoRoot), accountApiDevPlugin(repoRoot)],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@viora/core': resolve(__dirname, '../../packages/social-core/src/index.ts'),
    },
  },
  server: {
    port: 5174,
  },
});
