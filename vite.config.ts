/// <reference types="vitest/config" />
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  worker: { format: 'es' },
  // Unit tests run Svelte's browser build, so rune-based classes behave as in the app.
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
