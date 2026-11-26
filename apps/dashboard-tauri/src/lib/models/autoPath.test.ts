import { describe, expect, it } from 'vitest';
import { AutoPath, AutoPathEventType, AutoPathLocation } from './autoPath.ts';

const map = {
	frequency: 2,
	score: [10, 20],
	matches: [{ matchKey: '2026casj_qm1_0', tournamentName: 'SJ' }],
	positions: [
		{ event: AutoPathEventType.startMatch, location: AutoPathLocation.hub, time: 0 },
		{ event: AutoPathEventType.startScoring, location: 0, time: 2 },
		{ event: AutoPathEventType.stopScoring, location: 0, time: 4, quantity: 4 },
		{ event: AutoPathEventType.intake, location: AutoPathLocation.depot, time: 6 },
		{ event: AutoPathEventType.climb, location: 0, time: 10 }
	]
};

describe('AutoPath', () => {
	it('maps the starting location to its start-line offset', () => {
		const path = AutoPath.fromMap(map);
		expect(path.timeline[0].location).toBe(AutoPathLocation.startHub);
		expect(path.timeline[4].location).toBe(AutoPathLocation.tower);
	});

	it('summarises the path', () => {
		expect(AutoPath.fromMap(map).shortDescription).toBe('Hub 4 fuel + climb');
		expect(AutoPath.fromMap(map).averageScore).toBe(15);
	});

	it('creates one trajectory per scored ball', () => {
		expect(AutoPath.fromMap(map).trajectories).toHaveLength(4);
	});

	it('interpolates position between located events and clamps at the end', () => {
		const path = AutoPath.fromMap(map);
		const start = path.positionAt(0);
		expect(start).toEqual({ x: 57.5, y: 50 });
		const end = path.positionAt(60_000);
		expect(end).toEqual(path.positionAt(10_000));
	});

	it('is deterministic for the same timeline', () => {
		expect(AutoPath.fromMap(map).randomizedOffsets).toEqual(AutoPath.fromMap(map).randomizedOffsets);
	});
});
