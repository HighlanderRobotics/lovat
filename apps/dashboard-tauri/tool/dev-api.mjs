// Synthetic Lovat Server for local UI work. Every value here is invented;
// never paste real scouting data into this file.
//
//   node tool/dev-api.mjs            # listens on http://127.0.0.1:9879
//   LOVAT_API_BASE=http://127.0.0.1:9879 LOVAT_DEV_TOKEN=dev npm run dev

import http from 'node:http';

const T = '2026synth';
const teams = [8033, 254, 1678, 971, 604, 649, 1323, 4414, 5940, 6036, 2910, 3476];
const names = Object.fromEntries(teams.map((n, i) => [n, `Synthetic Robotics ${String.fromCharCode(65 + i)}`]));
const scouters = ['Avery', 'Blake', 'Casey', 'Devon', 'Emery', 'Finley'].map((name, i) => ({ name, uuid: `s${i}` }));

const teamInfo = (n, scouted) => ({
	number: n,
	scouters: [{ name: scouters[n % 6].name, scouted }],
	externalReports: n % 5 === 0 ? 1 : 0
});
const matches = Array.from({ length: 12 }, (_, i) => {
	const six = Array.from({ length: 6 }, (_, j) => teams[(i * 5 + j * 7) % teams.length]);
	const finished = i < 5;
	return {
		matchType: 0,
		matchNumber: i + 1,
		scouted: finished,
		finished,
		...Object.fromEntries(six.map((n, j) => [`team${j + 1}`, teamInfo(n, finished)]))
	};
});

const autoPath = (seed) => ({
	frequency: 2 + (seed % 3),
	score: [12 + seed, 18 + seed],
	matches: [{ matchKey: `${T}_qm${seed + 1}_0`, tournamentName: 'Synthetic Regional' }],
	positions: [
		{ event: 2, location: seed % 5, time: 0 },
		{ event: 0, location: 0, time: 1.5 },
		{ event: 1, location: 0, time: 4, quantity: 6 + seed },
		{ event: 7, location: 6, time: 8 },
		{ event: 9, location: 5, time: 11 },
		{ event: 11, location: 0, time: 16 }
	]
});

const alliance = (ts) => ({
	teams: ts.map((t, i) => ({ team: t, role: i % 5, averagePoints: 40 + i * 7, paths: [autoPath(i), autoPath(i + 1)] })),
	totalPoints: 121.5,
	l1StartTime: [12, null, 9],
	l2StartTime: [null, 18, null],
	l3StartTime: [25, null, null],
	totalFuelOutputted: 88,
	totalBallThroughput: 132
});

const ranked = teams.map((n, i) => ({ number: n, rank: i + 1, rankingPoints: 30 - i * 2, matchesPlayed: 5 }));

let mutable = { uuid: 'mutable-1', name: 'Alliance selection board', teams: [...teams], userName: 'Avery' };
let shifts = [
	{ uuid: 'shift-1', startMatchOrdinalNumber: 1, endMatchOrdinalNumber: 6, ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`team${n}`, [scouters[n - 1]]])) }
];

function route(method, path, query) {
	const team = Number(path.match(/team\/(\d+)/)?.[1] ?? 0);
	if (path === '/v1/manager/profile')
		return { email: 'lead@example.com', username: 'Synthetic Lead', role: 'SCOUTING_LEAD', team: { team: { number: 8033, name: names[8033] } } };
	if (path === '/v1/manager/tournaments')
		return {
			count: 2,
			tournaments: [
				{ key: T, name: 'Synthetic Regional', date: new Date().toISOString().slice(0, 10), location: 'San Jose, CA', isParticipant: true },
				{ key: '2026synth2', name: 'Synthetic Championship', date: '2026-04-15', location: 'Houston, TX' }
			]
		};
	if (path === `/v1/manager/matches/${T}`) {
		const filter = query.get('teams') ? JSON.parse(query.get('teams')) : null;
		return filter ? matches.filter((m) => [1, 2, 3, 4, 5, 6].some((j) => filter.includes(m[`team${j}`].number))) : matches;
	}
	if (path.endsWith('/rankedTeams')) return ranked;
	if (path.endsWith('/teams') && path.includes('/tournament/')) return teams.map((n) => ({ number: n, name: names[n] }));
	if (path === '/v1/manager/teams') {
		const f = (query.get('filter') ?? '').toLowerCase();
		const all = teams.map((n) => ({ number: n, name: names[n] })).filter((t) => t.name.toLowerCase().includes(f) || String(t.number).includes(f));
		return { count: all.length, teams: all.slice(Number(query.get('skip') ?? 0), Number(query.get('skip') ?? 0) + Number(query.get('take') ?? 999)) };
	}
	if (path === '/v1/manager/team-tournament-status') return { rank: 1, rankingPoints: 30, matchesPlayed: 5, matchesTotal: 12, number: 8033, name: names[8033] };
	if (path.endsWith('/scoutershifts') && method === 'GET') return { hash: 'synthetic', data: shifts };
	if (path.endsWith('/scoutershifts') && method === 'POST') return {};
	if (path === '/v1/manager/scoutershift/scouters') return scouters;
	if (path === '/v1/manager/scouterspage')
		return scouters.map((s, i) => ({ scouterUuid: s.uuid, scouterName: s.name, matchesScouted: 10 - i, missedMatches: i % 3 }));
	if (path === '/v1/manager/scouterreports')
		return [1, 2, 3].map((m) => ({ uuid: `report-${m}`, teamMatchData: { key: `${T}_qm${m}_0`, teamNumber: teams[m], tournament: { name: 'Synthetic Regional' } } }));
	if (path.startsWith('/v1/analysis/category/team/'))
		return {
			totalPoints: 52.3 + (team % 7), autoPoints: 18.1, teleopPoints: 34.2, fuelPerSecond: 2.4, accuracy: 71.6, volleysPerMatch: 6.5,
			timeFeeding: 12, feedingRate: 1.8, feedsPerMatch: 3, driverAbility: 4, contactDefenseTime: 6, defenseEffectiveness: 3.5,
			campingDefenseTime: 3, totalDefenseTime: 9, l1StartTime: 14, l2StartTime: 19, l3StartTime: null, autoClimbStartTime: 4,
			totalFuelOutputted: 64, outpostIntakes: 2
		};
	if (/^\/v1\/analysis\/breakdown\/team\/\d+$/.test(path))
		return {
			robotRole: { CYCLING: 0.5, SCORING: 0.3, FEEDING: 0.2 },
			fieldTraversal: { TRENCH: 0.6, BUMP: 0.4 },
			climbResult: { L1: 0.2, L2: 0.5, L3: 0.1, FAILED: 0.2 },
			beached: {},
			scoresWhileMoving: { TRUE: 0.7, FALSE: 0.3 },
			intakeType: { GROUND: 0.8, OUTPOST: 0.2 },
			disrupts: { TRUE: 0.25, FALSE: 0.75 },
			feederType: { CONTINUOUS: 1 }
		};
	if (/^\/v1\/analysis\/breakdown\/team\/\d+\/\w+$/.test(path))
		return [1, 2, 3, 4].map((m) => ({ breakdown: m % 2 ? 'CYCLING' : 'SCORING', key: `${T}_qm${m}_0`, tournamentName: 'Synthetic Regional', sourceTeam: 8033, scouter: scouters[m].name }));
	if (path.startsWith('/v1/analysis/notes/team/'))
		return [
			{ notes: 'Fast cycles from the trench; struggled with the bump late in the match.', match: `${T}_qm2_1`, tournamentName: 'Synthetic Regional', scouterName: 'Blake', uuid: 'note-1' },
			{ notes: '', robotBrokeDescription: 'Intake jammed in the last 30 seconds.', match: `${T}_qm4_1`, tournamentName: 'Synthetic Regional', scouterName: 'Casey', uuid: 'note-2' }
		];
	if (path.startsWith('/v1/analysis/metric/'))
		return {
			result: 48.2, all: 41.7, difference: 6.5, team,
			array: [1, 2, 3, 4, 5].map((m) => ({ match: `${T}_qm${m}_0`, tournamentName: 'Synthetic Regional', dataPoint: 35 + ((m * 7) % 20) })),
			...(path.includes('autoPoints') ? { paths: [autoPath(1), autoPath(3)] } : {})
		};
	if (path.startsWith('/v1/analysis/flag/team/')) return JSON.parse(query.get('flags') ?? '[]').map((f) => (f === 'rank' ? (team % 12) + 1 : 40 + (team % 9)));
	if (path === '/v1/analysis/alliance') return alliance([query.get('teamOne'), query.get('teamTwo'), query.get('teamThree')].map(Number));
	if (path === '/v1/analysis/matchprediction')
		return {
			redWinning: 0.62, blueWinning: 0.38,
			redAlliance: alliance([1, 2, 3].map((i) => Number(query.get(`red${i}`)))),
			blueAlliance: alliance([1, 2, 3].map((i) => Number(query.get(`blue${i}`))))
		};
	if (path === '/v1/analysis/picklist') {
		const flags = JSON.parse(query.get('flags') ?? '[]');
		return {
			teams: teams.map((t, i) => ({
				team: t,
				result: 2 - i * 0.3,
				breakdown: [{ type: 'totalPoints', result: 1.2 - i * 0.2 }, { type: 'driverAbility', result: 0.4 - i * 0.1 }],
				unweighted: [{ type: 'totalPoints', result: 1.5 - i * 0.25 }, { type: 'driverAbility', result: 0.8 - i * 0.15 }],
				flags: flags.map((f) => ({ type: f, result: f === 'rank' ? i + 1 : 40 + i }))
			}))
		};
	}
	if (path === '/v1/manager/picklists' && method === 'GET') return [{ uuid: 'shared-1', name: 'Defense first', author: { username: 'Blake' } }];
	if (path === '/v1/manager/picklists/shared-1') return { uuid: 'shared-1', name: 'Defense first', totalPoints: 0.5, defenseEffectiveness: 1, userName: 'Blake' };
	if (path === '/v1/manager/mutablepicklists' && method === 'GET') return [{ uuid: mutable.uuid, name: mutable.name, author: { username: 'Avery' }, tournamentKey: T }];
	if (path === `/v1/manager/mutablepicklists/${mutable.uuid}`) return mutable;
	if (path === '/v1/manager/settings/teamsource') return 'ALL_TEAMS';
	if (path === '/v1/manager/settings/tournamentsource') return [T];
	if (path === '/v1/manager/analysts') return [{ id: 'a1', username: 'Jordan', email: 'jordan@example.com' }];
	if (path === '/v1/manager/code') return 'SYN123';
	if (path === '/v1/manager/settings/teamemail') return 'team@example.com';
	if (path === '/v1/analysis/scoutreports/match/' + path.split('/').pop())
		return [{ uuid: 'report-1', scouterUuid: 's1', scouter: { name: 'Blake' }, startTime: new Date().toISOString(), canModify: true }];
	if (path.startsWith('/v1/analysis/metrics/scoutreport/'))
		return {
			totalPoints: 61, driverAbility: 4, robotRoles: [0, 2], feederType: [0], scoringRate: 2.1, feedingRate: 1.4, autoClimbStartTime: 3,
			contactDefenseTime: 4, campingDefenseTime: 2, defenseEffectiveness: 2, feeds: 3, accuracy: 3, climbStartTime: 18, climbResult: 3,
			autoClimb: 2, autoPoints: 27, volleys: 6, totalBallsFed: 18, note: 'Clean match, no penalties.', robotBrokeDescription: null,
			autoPath: { ...autoPath(2), autoPoints: 12, match: `${T}_qm3_0` }
		};
	if (path.startsWith('/v1/analysis/timeline/scoutreport/')) return [[0, 2, 2], [1.5, 0, 8], [4, 1, 8, 6], [8, 7, 6], [20, 12, 8], [24, 13, 8, 5], [130, 11, 8]];
	if (method !== 'GET') {
		if (path.startsWith('/v1/manager/mutablepicklists/')) return mutable;
		return path === '/v1/manager/scouterdashboard' ? { name: 'New scouter', uuid: `s${Date.now()}` } : {};
	}
	return undefined;
}

http
	.createServer(async (request, response) => {
		const url = new URL(request.url, 'http://127.0.0.1');
		response.setHeader('Access-Control-Allow-Origin', '*');
		response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
		response.setHeader('Access-Control-Allow-Headers', '*');
		response.setHeader('Access-Control-Expose-Headers', 'ETag');
		if (request.method === 'OPTIONS') return response.writeHead(204).end();
		let body = '';
		for await (const chunk of request) body += chunk;
		if (request.method === 'PUT' && url.pathname.startsWith('/v1/manager/mutablepicklists/')) mutable = { ...mutable, ...JSON.parse(body) };
		const result = route(request.method, url.pathname, url.searchParams);
		if (result === undefined) {
			response.writeHead(404, { 'Content-Type': 'application/json' });
			return response.end(JSON.stringify({ displayError: `No synthetic data for ${url.pathname}` }));
		}
		const status = request.method === 'POST' && url.pathname === '/v1/manager/scouterdashboard' ? 201 : 200;
		const text = typeof result === 'string' ? result : JSON.stringify(result);
		response.writeHead(status, { 'Content-Type': typeof result === 'string' ? 'text/plain' : 'application/json' });
		response.end(text);
	})
	.listen(9879, '127.0.0.1', () => console.log('Synthetic Lovat API on http://127.0.0.1:9879'));
