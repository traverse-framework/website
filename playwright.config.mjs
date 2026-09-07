import { defineConfig, devices } from '@playwright/test';

const PORT = 4321;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // Static build + Astro's static preview server. The discover-real bundle
    // ships under public/ so it is served at /bundles/discover-real/*.
    command: `npm run build && npm run preview -- --port ${PORT}`,
    url: `${BASE_URL}/discover.html`,
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});
