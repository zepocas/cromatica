import { defineConfig } from '@playwright/test';

// Each worktree tests its own code on its own port (CLAUDE.md); an existing server on that port is reused.
const port = Number(process.env.PORT ?? 5173);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  use: {
    baseURL: `http://localhost:${port}`,
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
  },
});
