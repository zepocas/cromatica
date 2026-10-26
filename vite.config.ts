/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';

/** Dev only: the app's debug log lines (src/ui/state/debug-log.ts) arrive here and print in the terminal. */
const debugLogToTerminal: Plugin = {
  name: 'debug-log-to-terminal',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__debug-log', (req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        console.log(body);
        res.statusCode = 204;
        res.end();
      });
    });
  },
};

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages serves the project site from /cromatica/; dev and tests stay at the root.
  base: command === 'build' ? '/cromatica/' : '/',
  // Vitest transforms modules for SSR, and the server build drops some
  // $state.snapshot calls; unit tests need the client build's copies.
  plugins: [
    debugLogToTerminal,
    svelte({ dynamicCompileOptions: () => (process.env.VITEST ? { generate: 'client' } : undefined) }),
  ],
  worker: { format: 'es' },
  // Unit tests run Svelte's browser build, so rune-based classes behave as in the app.
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
}));
