import type { z } from 'zod';
import type { teamSeriesSchema } from '$lib/server/publicAnalytics';

export type SeriesMatch = z.infer<typeof teamSeriesSchema>['matches'][number];
export type GraphMetric = 'points' | 'auto' | 'teleop' | 'feeding';

export function rollingValues(values: (number | null)[], window: number) {
	return values.map((value, index) => {
		if (value === null) return null;

		const sample = values
			.slice(Math.max(0, index - window + 1), index + 1)
			.filter((entry): entry is number => entry !== null);

		return sample.reduce((sum, entry) => sum + entry, 0) / sample.length;
	});
}

export function roleDistribution(matches: Pick<SeriesMatch, 'roles'>[]) {
	const totals = new Map<string, number>();

	for (const match of matches) {
		const roles = [...new Set(match.roles)];

		for (const role of roles) totals.set(role, (totals.get(role) ?? 0) + 1 / roles.length);
	}

	const total = [...totals.values()].reduce((sum, value) => sum + value, 0);

	return [...totals].map(([role, value]) => ({ role, percentage: (value / total) * 100 }));
}
