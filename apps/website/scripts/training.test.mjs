import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server, render, Results, Roles, Roster, trainingSocketUrl, connectTrainingHost, GradeDetails;
before(async () => {
	server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
	({ render } = await server.ssrLoadModule('svelte/server'));
	({ default: GradeDetails } = await server.ssrLoadModule(
		'/src/lib/training/TrainingGradeDetails.svelte'
	));
	({ default: Results } = await server.ssrLoadModule('/src/lib/training/TrainingResults.svelte'));
	({ default: Roles } = await server.ssrLoadModule('/src/lib/training/TrainingRoles.svelte'));
	({ default: Roster } = await server.ssrLoadModule('/src/lib/training/TrainingRoster.svelte'));
	({ trainingSocketUrl } = await server.ssrLoadModule('/src/lib/server/trainingSocketUrl.ts'));
	({ connectTrainingHost } = await server.ssrLoadModule('/src/lib/training/hostConnection.ts'));
});
after(async () => server?.close());

const settle = () => new Promise((resolve) => setImmediate(resolve));
function hostFixture() {
	const credentials = {
		uuid: 'session',
		browserToken: 'browser-secret',
		pairingToken: 'pairing-secret'
	};
	let time = 1000;
	let response = {
		uuid: 'session',
		serverTime: 1000,
		video: { teamNumber: 118 },
		participants: [{ ready: true, connected: true }]
	};
	const sockets = [],
		repeats = [],
		retries = [],
		calls = [],
		snapshots = [],
		connected = [],
		errors = [];
	let read = async () => response;
	const stop = connectTrainingHost({
		credentials,
		api: async (path) => {
			calls.push(path);
			return path === 'config'
				? { socketUrl: `wss://api.example/socket-${calls.filter((p) => p === 'config').length}` }
				: read();
		},
		onSnapshot: (value) => snapshots.push(value),
		onConnected: (value) => connected.push(value),
		onError: (value) => errors.push(value),
		now: () => time,
		createSocket: (url) => {
			const socket = {
				url,
				sent: [],
				send(value) {
					this.sent.push(value);
				},
				close() {
					this.closed = true;
				}
			};
			sockets.push(socket);
			return socket;
		},
		repeat: (callback) => {
			const timer = { callback, stopped: false };
			repeats.push(timer);
			return () => {
				timer.stopped = true;
			};
		},
		later: (callback) => {
			const timer = { callback, stopped: false };
			retries.push(timer);
			return () => {
				timer.stopped = true;
			};
		}
	});
	return {
		stop,
		sockets,
		repeats,
		retries,
		calls,
		snapshots,
		connected,
		errors,
		setTime: (value) => {
			time = value;
		},
		setRead: (value) => {
			read = value;
		},
		setResponse: (value) => {
			response = value;
		}
	};
}

test('the host roster connects through authenticated HTTP when WebSockets never open', async () => {
	const host = hostFixture();
	try {
		await settle();
		assert.equal(host.connected.at(-1), true);
		assert.equal(host.snapshots.at(-1).participants[0].ready, true);
		assert(host.calls.includes('sessions/session'));
		host.sockets[0].onopen();
		assert.deepEqual(JSON.parse(host.sockets[0].sent[0]), {
			sessionUuid: 'session',
			token: 'browser-secret'
		});
		assert(!host.sockets[0].url.includes('secret'));
	} finally {
		host.stop();
	}
});

test('reconnect reloads socket configuration and preserves polling availability', async () => {
	const host = hostFixture();
	try {
		await settle();
		host.sockets[0].onclose({ code: 1006 });
		await settle();
		assert.equal(host.connected.at(-1), true);
		host.retries[0].callback();
		await settle();
		assert.equal(host.sockets[1].url, 'wss://api.example/socket-2');
		assert.equal(host.sockets[0].onmessage, null);
	} finally {
		host.stop();
	}
});

test('healthy socket snapshots suppress redundant polls but silence enables fallback', async () => {
	const host = hostFixture();
	try {
		await settle();
		host.sockets[0].onmessage({
			data: JSON.stringify({ uuid: 'session', serverTime: 2000, video: {}, participants: [] })
		});
		const before = host.calls.length;
		host.setTime(2000);
		host.repeats[0].callback();
		await settle();
		assert.equal(host.calls.length, before);
		host.setTime(5001);
		host.setResponse({ uuid: 'session', serverTime: 5001, video: {}, participants: [] });
		host.repeats[0].callback();
		await settle();
		assert.equal(host.calls.length, before + 1);
		assert.equal(host.connected.at(-1), true);
	} finally {
		host.stop();
	}
});

test('late polls cannot roll back newer playback state', async () => {
	const host = hostFixture();
	try {
		await settle();
		let finish;
		host.setRead(
			() =>
				new Promise((resolve) => {
					finish = resolve;
				})
		);
		host.repeats[0].callback();
		await settle();
		host.sockets[0].onmessage({
			data: JSON.stringify({
				uuid: 'session',
				serverTime: 3000,
				video: {},
				participants: [],
				status: 'PLAYING'
			})
		});
		finish({ uuid: 'session', serverTime: 2000, video: {}, participants: [], status: 'LOBBY' });
		await settle();
		assert.equal(host.snapshots.at(-1).status, 'PLAYING');
	} finally {
		host.stop();
	}
});

test('closing the host cancels timers and ignores pending responses', async () => {
	const host = hostFixture();
	await settle();
	let finish;
	host.setRead(
		() =>
			new Promise((resolve) => {
				finish = resolve;
			})
	);
	host.repeats[0].callback();
	await settle();
	const before = host.snapshots.length;
	host.stop();
	finish({ uuid: 'session', serverTime: 4000, video: {}, participants: [] });
	await settle();
	assert.equal(host.snapshots.length, before);
	assert.equal(host.repeats[0].stopped, true);
	assert.equal(host.sockets[0].closed, true);
});

test('authentication rejection remains terminal rather than bypassing access checks', async () => {
	const host = hostFixture();
	try {
		await settle();
		host.sockets[0].onclose({ code: 1008 });
		const before = host.calls.length;
		host.repeats[0].callback();
		await settle();
		assert.equal(host.calls.length, before);
		assert.equal(host.connected.at(-1), false);
		assert.match(host.errors.at(-1), /expired or unavailable/);
	} finally {
		host.stop();
	}
});

test('Railway previews send browsers to the public API socket, not private DNS', () => {
	assert.equal(
		trainingSocketUrl({
			LOVAT_API_BASE: 'http://lovat-server.railway.internal',
			RAILWAY_SERVICE_API_URL: 'api-lovat-pr-93.up.railway.app'
		}),
		'wss://api-lovat-pr-93.up.railway.app/collection/training/socket'
	);
});

test('explicit public API configuration takes priority and strips private URL fields', () => {
	assert.equal(
		trainingSocketUrl({
			LOVAT_PUBLIC_API_BASE: 'https://user:secret@api.example/base?token=secret#secret',
			RAILWAY_SERVICE_API_URL: 'other.example'
		}),
		'wss://api.example/collection/training/socket'
	);
});

test('public production URLs and local development remain supported', () => {
	assert.equal(
		trainingSocketUrl({ LOVAT_API_BASE: 'https://api.lovat.app' }),
		'wss://api.lovat.app/collection/training/socket'
	);
	assert.equal(
		trainingSocketUrl({ LOVAT_API_BASE: 'http://127.0.0.1:3002' }),
		'ws://127.0.0.1:3002/collection/training/socket'
	);
});

test('missing, private, malformed, and insecure public URLs fail explicitly', () => {
	for (const value of [
		undefined,
		'http://api.railway.internal',
		'http://api.example',
		'ftp://api.example',
		'https://['
	]) {
		assert.throws(() => trainingSocketUrl({ LOVAT_API_BASE: value }));
	}
});

const participant = (overrides = {}) => ({
	uuid: 'scout-1',
	name: 'Test scout',
	teamNumber: 8033,
	deviceName: 'Test phone',
	ready: true,
	connected: true,
	status: 'SUBMITTED',
	reportUuid: 'report-1',
	score: null,
	...overrides
});
const score = {
	overallScore: 95,
	breakdown: {
		quantities: [
			{ action: 'STOP_SCORING', expected: 227, actual: 220, score: 0.96 },
			{ action: 'STOP_FEEDING', expected: 28, actual: 28, score: 1 }
		],
		timeline: { expected: 30, actual: 30, matched: 29 },
		fields: [
			{ field: 'autoClimb', expected: 'NOT_ATTEMPTED', actual: 'NOT_ATTEMPTED', correct: true },
			{ field: 'endgameClimb', expected: 'L3', actual: 'L3', correct: true },
			{
				field: 'robotRoles',
				expected: ['CYCLING', 'SCORING'],
				actual: ['CYCLING', 'SCORING'],
				correct: true
			},
			{ field: 'mobility', expected: 'BOTH', actual: 'BOTH', correct: true }
		]
	}
};

test('2026 results render fuel totals, climbing, roles, and passing status', () => {
	const { body } = render(Results, { props: { participants: [participant({ score })] } });
	for (const value of [
		'Fuel scored',
		'Fuel fed',
		'227',
		'220',
		'28',
		'L3',
		'Cycling',
		'Scoring',
		'Passed'
	]) {
		assert(body.includes(value), `Missing ${value}`);
	}
	assert(!/Cones|Cubes|Coopertition/.test(body));
});

test('incomplete and failed reports stay distinct from passing reports', () => {
	const participants = [
		participant({ status: 'POST_MATCH' }),
		participant({ uuid: 'scout-2' }),
		participant({ uuid: 'scout-3', score: { ...score, overallScore: 79 } })
	];
	const { body } = render(Results, { props: { participants } });
	for (const value of ['Waiting for report', 'Grading pending', 'Needs practice'])
		assert(body.includes(value));
});

test('all 2026 roles have their own accessible label', () => {
	const { body } = render(Roles, {
		props: { roles: ['CYCLING', 'SCORING', 'FEEDING', 'DEFENDING', 'IMMOBILE'] }
	});
	for (const role of ['Cycling', 'Scoring', 'Feeding', 'Defence', 'Immobile'])
		assert(body.includes(role));
});

test('rosters distinguish ready, disconnected, and submitted scouts', () => {
	const people = [participant(), participant({ uuid: 'scout-2', connected: false })];
	const ready = render(Roster, { props: { participants: people } }).body;
	assert(ready.includes('team 8033, ready'));
	assert(ready.includes('team 8033, disconnected'));
	const submitted = render(Roster, { props: { participants: people, submitted: true } }).body;
	assert(submitted.includes('team 8033, submitted'));
});

test('grade details explain tolerances, counts, post-match answers and missed events', () => {
	const { body } = render(GradeDetails, {
		props: {
			score: {
				overallScore: 87,
				breakdown: {
					rubricVersion: 'training-v2',
					quantities: [
						{
							action: 'STOP_SCORING',
							expected: 36,
							actual: 39,
							allowance: 6,
							score: 1,
							differences: [{ time: 8, expected: 36, actual: 39, allowance: 6 }]
						}
					],
					timeline: {
						matched: 1,
						expected: 2,
						actual: 2,
						score: 0.5,
						toleranceSeconds: 5,
						differences: [
							{
								action: 'INTAKE',
								position: 'NONE',
								expectedTime: 10,
								actualTime: null,
								deltaSeconds: null
							},
							{
								action: 'STOP_SCORING',
								position: 'NONE',
								expectedTime: null,
								actualTime: 20,
								deltaSeconds: null
							},
							{
								action: 'START_SCORING',
								position: 'NONE',
								expectedTime: 8,
								actualTime: 12,
								deltaSeconds: 4
							}
						]
					},
					fields: [{ field: 'autoClimb', expected: 'NONE', actual: 'L1', correct: false }]
				}
			}
		}
	});
	for (const text of [
		'87%',
		'training-v2',
		'±5s',
		'allowance ±6',
		'Missing event',
		'Extra event',
		'+4s',
		'Expected',
		'Recorded',
		'Review'
	])
		assert(body.includes(text), text);
});
test('legacy score details remain readable without new feedback metadata', () => {
	const { body } = render(GradeDetails, {
		props: {
			score: {
				overallScore: 100,
				breakdown: { quantities: [], fields: [], timeline: { matched: 0, expected: 0, actual: 0 } }
			}
		}
	});
	assert(body.includes('training-v1'));
	assert(body.includes('newly graded reports'));
});
