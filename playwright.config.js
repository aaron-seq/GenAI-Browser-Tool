import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for E2E testing of GenAI Browser Tool
 * Tests the extension in actual browser environments
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },

  projects: [
    {
      name: 'chromium-extension',
      use: { 
        ...devices['Desktop Chrome'],
        // Extension-specific configuration
        launchOptions: {
          args: [
            '--disable-extensions-except=.',
            '--load-extension=.',
            '--disable-web-security',
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection'
          ]
        }
      },
    },
    {
      name: 'edge-extension',
      use: { 
        ...devices['Desktop Edge'],
        launchOptions: {
          args: [
            '--disable-extensions-except=.',
            '--load-extension=.',
            '--disable-web-security'
          ]
        }
      },
    }
  ],

  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI
  }
});