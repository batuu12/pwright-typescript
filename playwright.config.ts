import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import * as os from 'os';

dotenv.config();

const isWebkitSupported = !(os.platform() === 'darwin' && os.arch() === 'arm64' && parseInt(os.release()) <= 21);

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['list'],
    ['./src/reporter/customHtmlReporter.ts', {
      outputFile: 'custom-report/index.html',
    }],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'https://example.com',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 15_000
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    ...(isWebkitSupported ? [{
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    }] : [])
  ]
});