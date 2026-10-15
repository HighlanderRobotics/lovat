import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';
const vite = await createServer({
	server: { middlewareMode: true, hmr: false },
	appType: 'custom'
});
after(() => vite.close());
const { consistency, rollingValues, tournamentRanges } = await vite.ssrLoadModule(
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

test('tournament averages and elimination boundaries follow filtered raw match values', () => {
	const matches = [
		{ eventKey: '2026a', eventName: 'A', points: 0, elimination: false, reportedBroken: false },
		{ eventKey: '2026a', eventName: 'A', points: 100, elimination: true, reportedBroken: true },
		{ eventKey: '2026b', eventName: 'B', points: null, elimination: true, reportedBroken: false },
		{ eventKey: '2026b', eventName: 'B', points: 20, elimination: true, reportedBroken: false }
	];
	assert.deepEqual(tournamentRanges(matches, 'points', true), [
		{ key: '2026a', name: 'A', start: 0, end: 1, average: 50, eliminationIndex: 1 },
		{ key: '2026b', name: 'B', start: 2, end: 3, average: 20, eliminationIndex: 2 }
	]);
	assert.equal(tournamentRanges(matches, 'points', false)[0].average, 0);
	assert.deepEqual(tournamentRanges([], 'points', true), []);
	assert.equal(tournamentRanges([matches[2]], 'points', true)[0].average, null);
});
