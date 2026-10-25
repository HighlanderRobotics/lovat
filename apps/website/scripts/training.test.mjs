import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server, render, Results, Roles, Roster;
before(async () => {
	server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
	({ render } = await server.ssrLoadModule('svelte/server'));
	({ default: Results } = await server.ssrLoadModule('/src/lib/training/TrainingResults.svelte'));
	({ default: Roles } = await server.ssrLoadModule('/src/lib/training/TrainingRoles.svelte'));
	({ default: Roster } = await server.ssrLoadModule('/src/lib/training/TrainingRoster.svelte'));
});
after(async () => server?.close());

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
