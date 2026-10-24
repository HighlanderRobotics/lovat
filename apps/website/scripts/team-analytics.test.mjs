import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

process.env.LOVAT_API_BASE = 'https://api.example.test';
const vite = await createServer({
	server: { middlewareMode: true, hmr: false },
	appType: 'custom'
});
after(() => vite.close());

const { rollingValues, roleDistribution } = await vite.ssrLoadModule(
	'/src/lib/tournaments/teamAnalytics.ts'
);
const { GET } = await vite.ssrLoadModule(
	'/src/routes/api/public/teams/[number]/[year]/series/+server.ts'
);

test('rolling averages preserve zeros and gaps, using only known values', () => {
	assert.deepEqual(rollingValues([0, 10, null, 20, 30], 3), [0, 5, null, 15, 25]);
	assert.deepEqual(rollingValues([0, null, 5], 1), [0, null, 5]);
});

test('role pie weights a tied match once and percentages total 100', () => {
	const result = roleDistribution([
		{ roles: ['CYCLING'] },
		{ roles: ['SCORING', 'FEEDING', 'SCORING'] },
		{ roles: [] }
	]);
	assert.deepEqual(result, [
		{ role: 'CYCLING', percentage: 50 },
		{ role: 'SCORING', percentage: 25 },
		{ role: 'FEEDING', percentage: 25 }
	]);
	assert.equal(
		result.reduce((sum, entry) => sum + entry.percentage, 0),
		100
	);
	assert.deepEqual(roleDistribution([]), []);
});

test('series proxy exposes only public aggregates and sends no credentials', async () => {
	const match = {
		matchKey: '2026casnf_qm4',
		eventKey: '2026casnf',
		eventName: 'San Francisco',
		label: 'Qualification 4',
		points: 0,
		auto: null,
		teleop: 0,
		feeding: 20,
		roles: ['FEEDING']
	};
	const response = await GET({
		params: { number: '8033', year: '2026' },
		fetch: async (url, options) => {
			assert.equal(url, 'https://api.example.test/v1/public/teams/8033/2026/series');
			assert.equal(options.credentials, 'omit');
			return Response.json({
				matches: [{ ...match, notes: 'private', scoutReports: ['private'] }],
				sources: ['private']
			});
		}
	});
	assert.deepEqual(await response.json(), { matches: [match] });
	assert.equal(response.headers.get('cache-control'), 'public, max-age=60');
});

test('series proxy validates team IDs and handles unsupported data safely', async () => {
	const invalid = await GET({
		params: { number: '0', year: '2026' },
		fetch: () => {
			throw new Error('Should not call');
		}
	});
	assert.equal(invalid.status, 400);
	const unavailable = await GET({
		params: { number: '8033', year: '2026' },
		fetch: async () => Response.json({ matches: [{ notes: 'private' }] })
	});
	assert.equal(unavailable.status, 503);
	assert.deepEqual(await unavailable.json(), { error: 'Team analytics unavailable' });
});
