import { describe, expect, it } from 'vitest';
import { ResponseCache } from './cache.ts';

describe('ResponseCache', () => {
	it('stores bodies with etags and timestamps', () => {
		const cache = new ResponseCache(() => 42);
		cache.put('k', '{"a":1}', 'W/"1"');
		expect(cache.get('k')).toEqual({ body: '{"a":1}', etag: 'W/"1"', ts: 42 });
		cache.remove('k');
		expect(cache.get('k')).toBeUndefined();
	});

	it('clears everything on identity change', () => {
		const cache = new ResponseCache();
		cache.put('a', '1');
		cache.put('b', '2');
		cache.clear();
		expect(cache.get('a')).toBeUndefined();
		expect(cache.get('b')).toBeUndefined();
	});
});
