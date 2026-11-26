import { describe, expect, it } from 'vitest';
import { tournamentsThisWeek } from './upcoming.ts';

const event = (key: string, start: string, end?: string) => ({
	key,
	name: key,
	date: new Date(start),
	endDate: end ? new Date(end) : null
});

describe('tournamentsThisWeek', () => {
	// Wednesday, March 4 2026, local time.
	const now = new Date(2026, 2, 4, 12);

	it('keeps ongoing and upcoming events through Sunday', () => {
		const result = tournamentsThisWeek(
			[
				event('past', '2026-02-26', '2026-03-01'),
				event('ongoing', '2026-03-02', '2026-03-05'),
				event('weekend', '2026-03-07', '2026-03-08'),
				event('nextweek', '2026-03-09')
			],
			now
		);
		expect(result.map((t) => t.key)).toEqual(['ongoing', 'weekend']);
	});

	it('treats date-only values as calendar days, not UTC instants', () => {
		expect(tournamentsThisWeek([event('today', '2026-03-04')], now)).toHaveLength(1);
	});
});
