import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { set_private_env } from '../.svelte-kit/output/server/internal.js';
import {
	actions,
	load
} from '../.svelte-kit/output/server/entries/pages/(with-nav)/contact/_page.server.ts.js';

const configuration = {
	RECAPTCHA_SITE_KEY: 'test-site-key',
	RECAPTCHA_SECRET_KEY: 'test-secret-key',
	SLACK_WEBHOOK: 'https://example.invalid/slack'
};
const originalFetch = global.fetch;
afterEach(() => {
	global.fetch = originalFetch;
	set_private_env({});
});

function submit(token = 'test-token') {
	const data = new FormData();
	data.set('name', 'Test Person');
	data.set('email', 'test@example.com');
	data.set('message', 'A question about Lovat');
	if (token !== null) data.set('g-recaptcha-response', token);
	return actions.default({
		request: new Request('https://example.invalid/contact', { method: 'POST', body: data })
	});
}

function forbidDelivery() {
	global.fetch = async () => assert.fail('Unverified submission made an outgoing request');
}

test('the contact page exposes only the public site key', () => {
	set_private_env(configuration);
	assert.deepEqual(load(), { recaptchaSiteKey: configuration.RECAPTCHA_SITE_KEY });
});

test('missing configuration blocks delivery', async () => {
	forbidDelivery();
	for (const key of ['RECAPTCHA_SITE_KEY', 'RECAPTCHA_SECRET_KEY']) {
		set_private_env({ ...configuration, [key]: '' });
		assert.equal((await submit()).status, 503);
	}
});

test('missing, blank, and file tokens block delivery', async () => {
	set_private_env(configuration);
	forbidDelivery();
	for (const token of [null, '', '  ', new Blob(['invalid'])]) {
		assert.equal((await submit(token)).status, 400);
	}
});

test('failed, expired, and malformed verification results never reach Slack', async () => {
	set_private_env(configuration);
	for (const result of [
		{ success: false, 'error-codes': ['timeout-or-duplicate'] },
		{ success: 'true' },
		{},
		null
	]) {
		let requests = 0;
		global.fetch = async (url) => {
			requests++;
			assert.equal(url, 'https://www.google.com/recaptcha/api/siteverify');
			return Response.json(result);
		};
		assert.equal((await submit()).status, 400);
		assert.equal(requests, 1);
	}
});

test('provider and network failures block delivery with a retryable error', async () => {
	set_private_env(configuration);
	for (const failure of ['http', 'network', 'json']) {
		let requests = 0;
		global.fetch = async (url) => {
			requests++;
			assert.equal(url, 'https://www.google.com/recaptcha/api/siteverify');
			if (failure === 'network') throw new TypeError('Network unavailable');
			return new Response('invalid json', { status: failure === 'http' ? 503 : 200 });
		};
		assert.equal((await submit()).status, 503);
		assert.equal(requests, 1);
	}
});

test('verified messages reach Slack only after successful verification', async () => {
	set_private_env(configuration);
	const destinations = [];
	global.fetch = async (url, options) => {
		destinations.push(url);
		if (destinations.length === 1) {
			assert.equal(url, 'https://www.google.com/recaptcha/api/siteverify');
			assert.equal(options.method, 'POST');
			assert.equal(options.body.get('secret'), configuration.RECAPTCHA_SECRET_KEY);
			assert.equal(options.body.get('response'), 'test-token');
			return Response.json({ success: true });
		}
		assert.equal(url, configuration.SLACK_WEBHOOK);
		assert(options.body.includes('A question about Lovat'));
		assert(!options.body.includes(configuration.RECAPTCHA_SECRET_KEY));
		return new Response('ok');
	};
	await assert.rejects(submit(), (result) => {
		assert.equal(result.status, 303);
		assert.equal(result.location, '/contact/success');
		return true;
	});
	assert.equal(destinations.length, 2);
});
