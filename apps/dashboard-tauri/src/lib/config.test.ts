import { describe, expect, it } from 'vitest';
import { productionWebClientId, resolveWebAuth } from './config.ts';

describe('resolveWebAuth', () => {
	it('uses production when no sandbox values are set', () => {
		expect(resolveWebAuth({})).toEqual({
			domain: 'lovat.us.auth0.com',
			clientId: productionWebClientId,
			audience: 'https://api.lovat.app'
		});
	});

	it('accepts a complete sandbox and pins its API origin', () => {
		const auth = resolveWebAuth({
			domain: 'Lovat-Sandbox.us.auth0.com',
			clientId: 'abc_123',
			audience: 'https://sandbox-api',
			apiBase: 'https://sandbox.lovat.app/'
		});
		expect(auth.domain).toBe('lovat-sandbox.us.auth0.com');
		expect(auth.sandboxApiOrigin).toBe('https://sandbox.lovat.app');
	});

	it('rejects partial sandbox configuration', () => {
		expect(() => resolveWebAuth({ domain: 'x.auth0.com' })).toThrow(/together/);
	});

	it('refuses to point a sandbox at production', () => {
		const base = { clientId: 'abc', audience: 'aud', apiBase: 'https://sandbox.lovat.app' };
		expect(() => resolveWebAuth({ ...base, domain: 'lovat.us.auth0.com' })).toThrow(/separate hostname/);
		expect(() => resolveWebAuth({ ...base, domain: 'x.auth0.com', apiBase: 'https://api.lovat.app' })).toThrow(/separate HTTPS/);
	});

	it('rejects API bases with paths, queries, or plain HTTP', () => {
		const base = { domain: 'x.auth0.com', clientId: 'abc', audience: 'aud' };
		for (const apiBase of ['http://sandbox.lovat.app', 'https://sandbox.lovat.app/v1', 'https://sandbox.lovat.app?x=1']) {
			expect(() => resolveWebAuth({ ...base, apiBase })).toThrow();
		}
	});
});
