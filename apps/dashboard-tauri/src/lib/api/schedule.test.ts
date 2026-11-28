import { describe, expect, it } from 'vitest';
import { validateSchedule, type ScoutingShift } from './endpoints.ts';

const shift = (start: number, end: number): ScoutingShift => ({ start, end, teams: [[], [], [], [], [], []] });

describe('validateSchedule', () => {
	it('accepts disjoint shifts', () => {
		expect(validateSchedule({ hash: '', shifts: [shift(1, 10), shift(11, 20)] })).toBeNull();
	});

	it('reports overlaps, negative numbers, and inverted ranges', () => {
		expect(validateSchedule({ hash: '', shifts: [shift(1, 10), shift(10, 20)] })).toBe('Some shifts overlap.');
		expect(validateSchedule({ hash: '', shifts: [shift(-1, 3)] })).toBe('Some match numbers are negative.');
		expect(validateSchedule({ hash: '', shifts: [shift(5, 3)] })).toBe("Some shifts don't have valid ranges.");
	});
});
