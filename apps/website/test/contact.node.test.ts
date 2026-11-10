import { test, expect, vi, beforeEach } from 'vitest';
import { env } from '$env/dynamic/private';
import { actions, load } from '../src/routes/(with-nav)/contact/+page.server';

beforeEach(() => {
	Object.assign(env, {
		RECAPTCHA_SITE_KEY: 'test-public-key',
		RECAPTCHA_SECRET_KEY: 'test-private-key',
		SLACK_WEBHOOK: 'https://slack.invalid/test'
	});
});
function submit(fields: Record<string, string> = {}) {
	const body = new URLSearchParams({
		name: 'Test Person',
		email: 'test@example.invalid',
		team: '1234',
		message: 'Synthetic question',
		'g-recaptcha-response': 'test-token',
		...fields
	});
	return actions.default({
		request: new Request('http://localhost/contact', { method: 'POST', body })
	} as never);
}
test('only the public site key reaches the page', async () => {
	expect(await load!({} as never)).toEqual({ recaptchaSiteKey: 'test-public-key' });
});
test('missing config or token never sends requests', async () => {
	expect(await submit({ 'g-recaptcha-response': '' })).toMatchObject({ status: 400 });
	delete env.RECAPTCHA_SECRET_KEY;
	expect(await submit()).toMatchObject({ status: 503 });
	expect(fetch).not.toHaveBeenCalled();
});
test.each(['8033', '123456', 'invalid'])(
	'honeypot or invalid team %s sends nothing',
	async (team) => {
		await expect(submit({ team })).rejects.toMatchObject({
			status: team === 'invalid' ? 400 : 303
		});
		expect(fetch).not.toHaveBeenCalled();
	}
);
test.each([false, 'true', null])(
	'failed/malformed captcha %s never delivers to Slack',
	async (success) => {
		vi.mocked(fetch).mockResolvedValue(Response.json({ success }));
		expect(await submit()).toMatchObject({ status: 400 });
		expect(fetch).toHaveBeenCalledOnce();
		expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
			'https://www.google.com/recaptcha/api/siteverify'
		);
	}
);
test('provider failure permits retry without delivery', async () => {
	vi.mocked(fetch).mockRejectedValue(new Error('offline'));
	expect(await submit()).toMatchObject({ status: 503 });
	expect(fetch).toHaveBeenCalledOnce();
});
test('verified message delivers once then redirects', async () => {
	const stub = vi
		.mocked(fetch)
		.mockResolvedValueOnce(Response.json({ success: true }))
		.mockResolvedValueOnce(new Response('ok'));
	await expect(submit()).rejects.toMatchObject({ status: 303, location: '/contact/success' });
	expect(stub).toHaveBeenCalledTimes(2);
	expect(stub.mock.calls[1][0]).toBe(env.SLACK_WEBHOOK);
	expect(stub.mock.calls[1][1]?.body).toContain('Synthetic question');
	expect(stub.mock.calls[1][1]?.body).not.toContain('test-private-key');
});
test('Slack delivery failure does not report success', async () => {
	vi.mocked(fetch)
		.mockResolvedValueOnce(Response.json({ success: true }))
		.mockResolvedValueOnce(new Response('unavailable', { status: 503 }));
	await expect(submit()).rejects.toMatchObject({ status: 500 });
});
