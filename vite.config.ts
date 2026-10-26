/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // GitHub Pages serves the project site from /cromatica/; dev and tests stay at the root.
  base: command === 'build' ? '/cromatica/' : '/',
  // Vitest transforms modules for SSR, and the server build drops some
  // $state.snapshot calls; unit tests need the client build's copies.
  plugins: [svelte({ dynamicCompileOptions: () => (process.env.VITEST ? { generate: 'client' } : undefined) })],
  worker: { format: 'es' },
  // Unit tests run Svelte's browser build, so rune-based classes behave as in the app.
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
}));
