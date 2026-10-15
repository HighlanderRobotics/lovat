import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';
const vite = await createServer({
	server: { middlewareMode: true, hmr: false },
	appType: 'custom'
});
after(() => vite.close());
const { consistency, rollingValues } = await vite.ssrLoadModule(
	'/src/lib/tournaments/teamAnalytics.ts'
);
test('consistency includes zero and ignores missing/non-finite values', () => {
	assert.deepEqual(consistency([null, 0, 10, 20, 30, NaN]), {
		average: 15,
		median: 15,
		lower: 7.5,
		upper: 22.5,
		best: 30,
		recent: 15,
		recentCount: 4,
		count: 4
	});
	assert.equal(consistency([null, NaN]), null);
	assert.equal(consistency([100, 0, 1, 2, 3, 4]).recent, 2);
});
test('rolling averages preserve missing matches', () => {
	assert.deepEqual(rollingValues([0, null, 10], 3), [0, null, 5]);
});

test('rolling values restart when tournaments change', () => {
	assert.deepEqual(rollingValues([100, 10, 20], 3, ['a', 'b', 'b']), [100, 10, 15]);
});
