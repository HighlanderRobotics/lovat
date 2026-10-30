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

const { exponentialFit, predictExponential, topCohorts } = await vite.ssrLoadModule(
	'/src/lib/tournaments/dropoff.ts'
);

test('exponential regression recovers a known decay in the original points scale', () => {
	const points = Array.from({ length: 32 }, (_, index) => ({
		rank: index + 1,
		points: 400 * Math.exp(-0.12 * (index + 1))
	}));
	const fit = exponentialFit(points);
	assert.ok(fit);
	assert.ok(Math.abs(fit.rate + 0.12) < 1e-7);
	assert.ok(Math.abs(predictExponential(fit, 1) - points[0].points) < 1e-5);
	assert.ok(Math.abs(predictExponential(fit, 32) - points[31].points) < 1e-5);
	assert.ok(Math.abs(fit.rSquared - 1) < 1e-10);
});

test('zero scores influence the exponential fit and its R squared is computed in points', () => {
	const points = [100, 90, 80, 0, 0, 0].map((points, index) => ({ rank: index + 1, points }));
	const fit = exponentialFit(points);
	const positiveOnly = exponentialFit(points.slice(0, 3));
	assert.ok(fit && positiveOnly);
	assert.ok(fit.rate < positiveOnly.rate);
	const mean = points.reduce((sum, point) => sum + point.points, 0) / points.length;
	const residuals = points.reduce(
		(sum, point) => sum + (point.points - predictExponential(fit, point.rank)) ** 2,
		0
	);
	const variation = points.reduce((sum, point) => sum + (point.points - mean) ** 2, 0);
	assert.ok(Math.abs(fit.rSquared - (1 - residuals / variation)) < 1e-10);
});

test('exponential regression handles flat, missing, and insufficient data', () => {
	assert.equal(exponentialFit([]), null);
	assert.equal(exponentialFit([{ rank: 1, points: 100 }]), null);
	assert.equal(
		exponentialFit([
			{ rank: 1, points: 100 },
			{ rank: 1, points: 80 }
		]),
		null
	);
	assert.equal(
		exponentialFit([
			{ rank: 1, points: 0 },
			{ rank: 2, points: 0 }
		]),
		null
	);
	const flat = exponentialFit([
		{ rank: 1, points: 50 },
		{ rank: 2, points: 50 }
	]);
	assert.equal(flat.rate, 0);
	assert.equal(flat.amplitude, 50);
	assert.equal(flat.rSquared, null);
	const fit = exponentialFit([
		{ rank: 1, points: 100 },
		{ rank: 2, points: 50 },
		{ rank: NaN, points: 100 },
		{ rank: 3, points: Infinity }
	]);
	assert.ok(Math.abs(predictExponential(fit, 2) - 50) < 1e-5);
});

test('cohorts average only the top 32 teams, retain zeros, and handle partial groups', () => {
	const ranked = Array.from({ length: 35 }, (_, index) => ({
		rank: index + 1,
		points: 35 - index
	}));
	assert.deepEqual(topCohorts(ranked), [
		{ index: 0, start: 1, end: 8, average: 31.5 },
		{ index: 1, start: 9, end: 16, average: 23.5 },
		{ index: 2, start: 17, end: 24, average: 15.5 },
		{ index: 3, start: 25, end: 32, average: 7.5 }
	]);
	assert.deepEqual(
		topCohorts([
			{ rank: 1, points: 10 },
			{ rank: 2, points: 0 }
		]),
		[{ index: 0, start: 1, end: 2, average: 5 }]
	);
	assert.deepEqual(topCohorts([]), []);
});
