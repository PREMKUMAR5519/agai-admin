import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests/browser', workers: 1, timeout: 60000,
  globalTeardown: './scripts/e2e-cleanup.js',
  use: { baseURL: process.env.E2E_BUILT_CLIENT === '1' ? 'http://127.0.0.1:5002' : 'http://127.0.0.1:5178', browserName: 'chromium', channel: process.platform === 'win32' ? 'msedge' : undefined, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/e2e-server.js', url: 'http://127.0.0.1:5178', reuseExistingServer: false, timeout: 30000 },
})
