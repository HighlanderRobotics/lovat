import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createServer } from 'vite';

process.env.LOVAT_API_BASE = 'https://api.example.test';
const vite = await createServer({
	server: { middlewareMode: true, hmr: false },
	appType: 'custom'
});
after(() => vite.close());
const { POST } = await vite.ssrLoadModule('/src/routes/api/prediction/+server.ts');
const { teamRecords } = await vite.ssrLoadModule('/src/lib/tournaments/teamRecords.ts');
const teams = { blue: [1, 2, 3], red: [4, 5, 6] };

function event({
	origin = 'https://website.example.test',
	authorization = 'Bearer test-token',
	body = teams,
	upstream
} = {}) {
	return {
		url: new URL('https://website.example.test/api/prediction'),
		request: new Request('https://website.example.test/api/prediction', {
			method: 'POST',
			headers: {
				origin,
				...(authorization ? { authorization } : {}),
				'content-type': 'application/json'
			},
			body: JSON.stringify(body)
		}),
		fetch:
			upstream ??
			(() => {
				throw new Error('Upstream must not be called');
			})
	};
}

test('rejects anonymous, cross-origin and duplicate team requests before upstream', async () => {
	assert.equal((await POST(event({ authorization: '' }))).status, 401);
	assert.equal((await POST(event({ origin: 'https://other.example.test' }))).status, 403);
	assert.equal((await POST(event({ body: { blue: [1, 1, 2], red: [3, 4, 5] } }))).status, 400);
});

test('forwards the user token, returns only probabilities and forbids shared caching', async () => {
	const response = await POST(
		event({
			upstream: async (url, options) => {
				assert.equal(options.headers.authorization, 'Bearer test-token');
				assert.equal(new URL(url).searchParams.get('blue3'), '3');
				return Response.json({
					blueWinning: 0.25,
					redWinning: 0.75,
					redAlliance: { privateData: 'hidden' }
				});
			}
		})
	);

	assert.equal(response.headers.get('cache-control'), 'private, no-store');
	assert.equal(response.headers.get('vary'), 'Authorization');
	assert.deepEqual(await response.json(), { prediction: { blueWinning: 0.25, redWinning: 0.75 } });
});

test('handles no scouting data, expired authorization, outages and invalid probabilities', async () => {
	const noData = await POST(event({ upstream: async () => new Response('not enough data') }));
	assert.deepEqual(await noData.json(), { prediction: null });
	assert.equal(
		(await POST(event({ upstream: async () => new Response('', { status: 401 }) }))).status,
		401
	);
	assert.equal(
		(
			await POST(
				event({
					upstream: async () => {
						throw new Error('secret');
					}
				})
			)
		).status,
		503
	);
	const invalid = await POST(
		event({ upstream: async () => Response.json({ blueWinning: 0.9, redWinning: 0.9 }) })
	);
	assert.deepEqual(await invalid.json(), { prediction: null });
});

test('distinguishes a missing verified team from an expired session', async () => {
	for (const [body, status] of [
		['No team', 401],
		['Your team has not been verified yet', 403]
	]) {
		const response = await POST(event({ upstream: async () => new Response(body, { status }) }));

		assert.equal(response.status, 403);
		assert.deepEqual(await response.json(), { error: 'Verified team required' });
	}
});

test('records count wins, losses and ties; skip surrogates, unplayed and unresolved matches; DQs lose', () => {
	const match = {
		status: 'COMPLETED',
		winningAlliance: 'BLUE',
		alliances: [
			{ color: 'BLUE', score: 100 },
			{ color: 'RED', score: 50 }
		],
		teamSlots: [
			{ teamNumber: 1, alliance: 'BLUE' },
			{ teamNumber: 2, alliance: 'RED' },
			{ teamNumber: 3, alliance: 'BLUE', surrogate: true }
		]
	};
	const records = teamRecords([
		match,
		{
			...match,
			winningAlliance: null,
			alliances: [
				{ color: 'BLUE', score: 50 },
				{ color: 'RED', score: 50 }
			]
		},
		{ ...match, status: 'SCHEDULED' },
		{ ...match, winningAlliance: null, alliances: [] },
		{ ...match, teamSlots: [{ teamNumber: 1, alliance: 'BLUE', disqualified: true }] }
	]);
	assert.deepEqual(records.get(1), { wins: 1, losses: 1, ties: 1 });
	assert.deepEqual(records.get(2), { wins: 0, losses: 1, ties: 1 });
	assert.equal(records.has(3), false);
});

const { GET: publicMatch } = await vite.ssrLoadModule(
	'/src/routes/api/public/matches/[key]/+server.ts'
);
test('public predictions omit credentials and strip all fields outside the approved projection', async () => {
	const response = await publicMatch({
		params: { key: '2026casnf_qm4' },
		fetch: async (_url, options) => {
			assert.equal(options.credentials, 'omit');
			assert.equal(options.headers, undefined);
			return Response.json({
				prediction: { blueWinning: 0.6, redWinning: 0.4, notes: 'private' },
				roles: [{ teamNumber: 8033, role: 'SCORING', scouter: 'private' }],
				reports: ['private']
			});
		}
	});
	assert.equal(response.headers.get('cache-control'), 'public, max-age=60');
	assert.deepEqual(await response.json(), {
		prediction: { blueWinning: 0.6, redWinning: 0.4 },
		roles: [{ teamNumber: 8033, role: 'SCORING' }]
	});
});
test('public predictions reject malformed matches and provider failures', async () => {
	const fetch = async () => {
		throw new Error('private provider details');
	};
	assert.equal((await publicMatch({ params: { key: 'invalid' }, fetch })).status, 400);
	const response = await publicMatch({ params: { key: '2026casnf_qm4' }, fetch });
	assert.equal(response.status, 503);
	assert.deepEqual(await response.json(), { error: 'Prediction unavailable' });
});

const { GET: publicMetrics } = await vite.ssrLoadModule(
	'/src/routes/api/public/matches/[key]/metrics/+server.ts'
);
test('public match metrics return approved aggregates without reports or source identities', async () => {
	const team = {
		teamNumber: 8033,
		alliance: 'BLUE',
		reports: 2,
		points: 42,
		auto: 10,
		teleop: 30,
		fuelOutput: 50,
		fuelFed: 20,
		defenseSeconds: 12
	};
	const response = await publicMetrics({
		params: { key: '2026casnf_qm4' },
		fetch: async (_url, options) => {
			assert.equal(options.credentials, 'omit');
			return Response.json({
				teams: [{ ...team, scoutReports: ['private'], notes: 'private' }],
				sourceTeams: ['private']
			});
		}
	});
	assert.deepEqual(await response.json(), { teams: [team] });
	assert.equal(response.headers.get('cache-control'), 'public, max-age=60');
});
