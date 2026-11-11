import { describe, test, expect, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import type { RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { handle } from '../src/hooks.server';
import { sendSignedRequest } from '../src/lib/util/sendSignedRequest';
import { POST } from '../src/routes/(with-nav)/api/slack/interaction/+server';
import { load as verify } from '../src/routes/(with-nav)/verify/[code]/+page.server';
import { load as support } from '../src/routes/(with-nav)/support/+page.server';

function event(path: string, init: RequestInit = {}) {
	const url = new URL(path, 'http://localhost');
	return { url, request: new Request(url, init), params: {} } as RequestEvent;
}
function signingConfig() {
	Object.assign(env, {
		LOVAT_SIGNING_KEY: 'synthetic-signing-key',
		LOVAT_API_BASE: 'http://127.0.0.1:9876'
	});
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
}

describe('routing and CSRF boundary', () => {
	test.each(['application/x-www-form-urlencoded', 'multipart/form-data'])(
		'rejects cross-origin %s without resolving or sending',
		async (type) => {
			const resolve = vi.fn();
			const response = await handle({
				event: event('/contact', {
					method: 'POST',
					headers: {
						origin: 'https://evil.invalid',
						'content-type': type,
						accept: 'application/json'
					}
				}),
				resolve
			});
			expect(response.status).toBe(403);
			expect(await response.json()).toEqual({
				message: 'Cross-site POST form submissions are forbidden'
			});
			expect(resolve).not.toHaveBeenCalled();
			expect(fetch).not.toHaveBeenCalled();
		}
	);
	test.each(['/contact', '/api/slack/interaction'])(
		'allows same-origin or signed Slack endpoint: %s',
		async (path) => {
			const resolve = vi.fn(async () => new Response('ok'));
			const response = await handle({
				event: event(path, {
					method: 'POST',
					headers: {
						origin: path === '/contact' ? 'http://localhost' : 'https://slack.invalid',
						'content-type': 'application/x-www-form-urlencoded'
					}
				}),
				resolve
			});
			expect(resolve).toHaveBeenCalledOnce();
			expect(response.headers.get('cache-control')).toBe('private, no-store');
		}
	);
	test('support route redirects locally', async () => {
		await expect(Promise.resolve().then(() => support!({} as never))).rejects.toMatchObject({
			status: 307,
			location: '/contact'
		});
	});
});

describe('signed Server requests', () => {
	test('missing configuration fails closed without network', async () => {
		await expect(sendSignedRequest('/path', 'POST', '{}')).rejects.toMatchObject({ status: 503 });
		expect(fetch).not.toHaveBeenCalled();
	});
	test('signs exact method, path, body and timestamp', async () => {
		signingConfig();
		const body = JSON.stringify({ code: 'ABC' });
		const stub = vi.mocked(fetch).mockResolvedValue(new Response('ok'));
		await sendSignedRequest('/verify', 'POST', body);
		const timestamp = Math.floor(Date.now() / 1000);
		const expected = createHmac('sha256', 'synthetic-signing-key')
			.update(JSON.stringify({ path: '/verify', method: 'POST', body, timestamp }))
			.digest('hex');
		expect(stub).toHaveBeenCalledWith('http://127.0.0.1:9876/verify', {
			method: 'POST',
			body,
			headers: {
				'Content-Type': 'application/json',
				'X-Lovat-Error-Format': 'json-v1',
				'X-Signature': expected,
				'X-Timestamp': String(timestamp)
			}
		});
	});
	test('authentication and transport failures propagate', async () => {
		signingConfig();
		vi.mocked(fetch)
			.mockResolvedValueOnce(new Response('denied', { status: 401 }))
			.mockRejectedValueOnce(new Error('offline'));
		await expect(sendSignedRequest('/x', 'POST', '')).rejects.toThrow(
			'Failed to send signed request'
		);
		await expect(sendSignedRequest('/x', 'POST', '')).rejects.toThrow('offline');
	});
});

function slack(
	timestamp = String(Math.floor(Date.now() / 1000)),
	signature?: string,
	payload = JSON.stringify({
		type: 'block_actions',
		actions: [{ action_id: 'verify_action', value: 'team_8033' }]
	})
) {
	env.SLACK_SIGNING_SECRET = 'synthetic-slack-key';
	const body = new URLSearchParams({ payload }).toString();
	return event('/api/slack/interaction', {
		method: 'POST',
		body,
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			'X-Slack-Request-Timestamp': timestamp,
			'X-Slack-Signature':
				signature ??
				`v0=${createHmac('sha256', env.SLACK_SIGNING_SECRET).update(`v0:${timestamp}:${body}`).digest('hex')}`
		}
	}) as Parameters<typeof POST>[0];
}

describe('Slack signature verification', () => {
	test('missing payload and unconfigured integration fail without network', async () => {
		const noPayload = slack();
		noPayload.request = new Request(noPayload.url, { method: 'POST', body: new URLSearchParams() });
		await expect(POST(noPayload)).rejects.toMatchObject({ status: 400 });
		const unconfigured = slack();
		delete env.SLACK_SIGNING_SECRET;
		await expect(POST(unconfigured)).rejects.toMatchObject({ status: 503 });
		expect(fetch).not.toHaveBeenCalled();
	});
	test('future timestamps outside the replay window are rejected', async () => {
		await expect(POST(slack(String(Math.floor(Date.now() / 1000) + 301)))).rejects.toMatchObject({
			status: 400
		});
		expect(fetch).not.toHaveBeenCalled();
	});

	test.each(['0', 'NaN', '123abc'])(
		'rejects stale or malformed timestamp %s with zero outbound calls',
		async (timestamp) => {
			await expect(POST(slack(timestamp))).rejects.toMatchObject({ status: 400 });
			expect(fetch).not.toHaveBeenCalled();
		}
	);
	test('rejects invalid signature and missing headers without outbound calls', async () => {
		await expect(POST(slack(undefined, 'v0=invalid'))).rejects.toMatchObject({ status: 500 });
		const missing = slack();
		missing.request.headers.delete('X-Slack-Signature');
		await expect(POST(missing)).rejects.toMatchObject({ status: 400 });
		expect(fetch).not.toHaveBeenCalled();
	});
	test.each(['verify_action', 'reject_action'])(
		'valid %s makes only the signed Server call',
		async (action_id) => {
			signingConfig();
			vi.mocked(fetch).mockResolvedValue(new Response('ok'));
			const response = await POST(
				slack(
					undefined,
					undefined,
					JSON.stringify({ type: 'block_actions', actions: [{ action_id, value: 'team_8033' }] })
				)
			);
			expect(await response.text()).toBe('ok');
			expect(fetch).toHaveBeenCalledOnce();
			expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
				`http://127.0.0.1:9876/v1/manager/registeredteams/8033/${action_id === 'verify_action' ? 'approve' : 'reject'}`
			);
		}
	);
	test('upstream failure is surfaced', async () => {
		signingConfig();
		vi.mocked(fetch).mockRejectedValue(new Error('offline'));
		await expect(POST(slack())).rejects.toMatchObject({ status: 500 });
	});
	test('unknown action sends nothing', async () => {
		const response = await POST(
			slack(
				undefined,
				undefined,
				JSON.stringify({ type: 'block_actions', actions: [{ action_id: 'unknown' }] })
			)
		);
		expect(response.status).toBe(200);
		expect(fetch).not.toHaveBeenCalled();
	});
});

describe('email verification pages', () => {
	test.each([
		[200, '', 'Your email has been verified.'],
		[400, 'CODE_NOT_RECOGNIZED', 'Invalid link.'],
		[400, JSON.stringify({ code: 'CODE_EXPIRED' }), 'Link expired.'],
		[400, 'EMAIL_ALREADY_VERIFIED', 'Email already verified.']
	])('renders status %s / %s', async (status, body, title) => {
		signingConfig();
		vi.mocked(fetch).mockResolvedValue(new Response(body, { status }));
		const result = await verify!({ params: { code: 'abc' } } as never);
		expect(result).toMatchObject({ title });
		expect(vi.mocked(fetch).mock.calls[0][1]?.body).toBe(JSON.stringify({ code: 'ABC' }));
	});
	test('unknown response fails visibly', async () => {
		signingConfig();
		vi.mocked(fetch).mockResolvedValue(new Response('unexpected', { status: 500 }));
		await expect(verify!({ params: { code: 'abc' } } as never)).rejects.toMatchObject({
			status: 500
		});
	});
});
