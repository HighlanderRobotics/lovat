import { defineConfig, devices } from '@playwright/test';
const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:4173';
if (!['127.0.0.1', 'localhost'].includes(new URL(baseURL).hostname))
	throw new Error('Browser tests require a local production build');
export default defineConfig({
	testDir: './e2e',
	forbidOnly: !!process.env.CI,
	retries: 0,
	reporter: [['list'], ['html', { open: 'never' }]],
	use: { baseURL, channel: 'chromium', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] } },
		{ name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } }
	],
	webServer: process.env.TEST_BASE_URL
		? undefined
		: [
				{ command: 'node test/fixtures/server.mjs', port: 9876, reuseExistingServer: false },
				{
					command: 'node --import ./test/block-outbound.mjs build',
					url: `${baseURL}/healthz`,
					reuseExistingServer: false,
					env: {
						HOST: '127.0.0.1',
						PORT: '4173',
						ORIGIN: baseURL,
						LOVAT_API_BASE: 'http://127.0.0.1:9876',
						LOVAT_SIGNING_KEY: 'synthetic-browser-key',
						PUBLIC_LEARN_URL: 'http://127.0.0.1:4321',
						PUBLIC_DASHBOARD_URL: 'http://127.0.0.1:4322'
					}
				}
			]
});
