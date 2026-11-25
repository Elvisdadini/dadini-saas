import { defineConfig, devices } from '@playwright/test';

// E2E opcional: requiere `npm i -D @playwright/test && npx playwright install chromium`.
// E2E_BASE_URL=https://dadini-saas.onrender.com npm run test:e2e
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5180',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
