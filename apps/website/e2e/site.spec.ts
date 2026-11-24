import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ context, baseURL }) => {
	await context.route('**/*', (route) => {
		const url = new URL(route.request().url());
		return url.origin === new URL(baseURL!).origin ? route.continue() : route.abort();
	});
});

test('legacy Website colors resolve through the released Magnolia theme', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'light' });
	await page.goto('/download');
	const colors = await page
		.locator('.mg-root')
		.first()
		.evaluate((root) => {
			const style = getComputedStyle(root);
			const aliases = [
				'victory-purple',
				'secondary-container',
				'on-background',
				'body',
				'background',
				'danger',
				'light-gray',
				'light-gray-hover',
				'placeholder',
				'surface-container',
				'outline-variant'
			];
			return Object.fromEntries(
				aliases.map((name) => [name, style.getPropertyValue(`--${name}`).trim()])
			);
		});
	expect(colors).toEqual({
		'victory-purple': '#b59aff',
		'secondary-container': '#292929',
		'on-background': '#e0e0e0',
		body: '#b8b8b8',
		background: '#1f1f1f',
		danger: '#b13b3b',
		'light-gray': '#424242',
		'light-gray-hover': '#585858',
		placeholder: '#a3a3a3',
		'surface-container': '#292929',
		'outline-variant': '#929292'
	});
	await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(31, 31, 31)');
	await expect(page.locator('h1')).toHaveCSS('color', 'rgb(224, 224, 224)');
	await expect(page.locator('.app-card').first()).toHaveCSS('background-color', 'rgb(41, 41, 41)');
	await expect(page.locator('.app-card').first()).toHaveCSS(
		'border-top-color',
		'rgb(146, 146, 146)'
	);
});

for (const path of ['/', '/about', '/download', '/privacy', '/changelog', '/contact']) {
	test(`SSR, hydration and accessibility: ${path}`, async ({ page, request }) => {
		const ssr = await request.get(path);
		expect(ssr.status()).toBe(200);
		expect(await ssr.text()).toContain('<h1');
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.goto(path);
		await expect(page.locator('h1').first()).toBeVisible();
		// These pages have no live dependencies; external fonts/analytics are blocked.
		const result = await new AxeBuilder({ page })
			.withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
			.analyze();
		expect(
			result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))
		).toEqual([]);
		expect(errors).toEqual([]);
	});
}

test('navigation hydrates and the mobile menu works with the keyboard', async ({
	page,
	isMobile
}) => {
	await page.goto('/');
	if (isMobile) {
		const menu = page.getByRole('button', { name: 'Navigation menu' });
		await menu.focus();
		await page.keyboard.press('Enter');
		await expect(menu).toHaveAttribute('aria-expanded', 'true');
	}
	await page.getByRole('navigation').getByRole('link', { name: 'About', exact: true }).click();
	await expect(page).toHaveURL(/\/about$/);
	if (isMobile)
		await expect(page.getByRole('button', { name: 'Navigation menu' })).toHaveAttribute(
			'aria-expanded',
			'false'
		);
	else
		await expect(
			page.getByRole('navigation').getByRole('link', { name: 'Learn', exact: true })
		).toHaveAttribute('href', 'http://127.0.0.1:4321/guides/welcome');
});

test('redirects, missing pages and cross-origin POSTs use real routing hooks', async ({
	request
}) => {
	const redirect = await request.get('/support', { maxRedirects: 0 });
	expect(redirect.status()).toBe(307);
	expect(redirect.headers().location).toBe('/contact');
	expect((await request.get('/missing-test-page')).status()).toBe(404);
	const denied = await request.post('/contact', {
		form: { name: 'Test' },
		headers: { origin: 'https://evil.invalid' }
	});
	expect(denied.status()).toBe(403);
});

test('synthetic verification success and expiry', async ({ page }) => {
	await page.goto('/verify/valid');
	await expect(page.getByText('Your email has been verified.', { exact: true })).toBeVisible();
	await page.goto('/verify/expired');
	await expect(page.getByText('Link expired.', { exact: true })).toBeVisible();
});

test('operational pit display renders synthetic analysis without webcast/network dependencies', async ({
	page
}) => {
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto(
		'/pit/display?tournamentKey=2026test&team=8033&queueMatchCount=2&topTeamCount=5&teamsAboveCount=2'
	);
	await expect(page.getByText('No webcasts available')).toBeVisible();
	await expect(page.getByText('Powered by Lovat')).toBeVisible();
	await expect(page.getByText('8033', { exact: true }).first()).toBeVisible();
	expect(errors).toEqual([]);
});
