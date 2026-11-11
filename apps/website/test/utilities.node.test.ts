import { test, expect } from 'vitest';
import { trainingSocketUrl } from '../src/lib/server/trainingSocketUrl';
import { apiErrorCode } from '../src/lib/util/apiError.js';
test('public socket URL discards credentials, query and fragment', () => {
	expect(
		trainingSocketUrl({
			LOVAT_PUBLIC_API_BASE: 'https://user:pass@api.example.invalid/path?q=secret#x'
		})
	).toBe('wss://api.example.invalid/collection/training/socket');
	expect(trainingSocketUrl({ LOVAT_API_BASE: 'http://localhost:3000' })).toBe(
		'ws://localhost:3000/collection/training/socket'
	);
});
test.each([
	{},
	{ LOVAT_API_BASE: 'http://public.invalid' },
	{ LOVAT_API_BASE: 'https://api.railway.internal' },
	{ LOVAT_API_BASE: 'ftp://public.invalid' }
])('rejects unsafe socket config %s', (config) => {
	expect(() => trainingSocketUrl(config)).toThrow();
});
test.each([
	['CODE_EXPIRED', 'CODE_EXPIRED'],
	['{"code":"CODE_EXPIRED"}', 'CODE_EXPIRED'],
	['{}', undefined],
	['null', undefined],
	['{"code":123}', undefined]
])('decodes error %s', (body, expected) => {
	expect(apiErrorCode(body)).toBe(expected);
});
