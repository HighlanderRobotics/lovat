import { expect, test, vi } from 'vitest';

test('browser-runner preload permits its configured fixture API and rejects every other origin', async () => {
	const original = vi.mocked(fetch).mockResolvedValue(new Response('synthetic fixture'));
	vi.stubEnv('LOVAT_API_BASE', 'http://stub:9876');
	try {
		await import('./block-outbound.mjs');
		expect(() => fetch('https://example.invalid/live')).toThrow('Blocked test network request');
		expect(original).not.toHaveBeenCalled();
		const response = await fetch('http://stub:9876/v1/analysis/pitdisplay');
		expect(await response.text()).toBe('synthetic fixture');
		expect(original).toHaveBeenCalledOnce();
	} finally {
		vi.unstubAllEnvs();
	}
});
