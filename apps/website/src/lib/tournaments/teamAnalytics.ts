import type { z } from 'zod';
import type { teamSeriesSchema } from '$lib/server/publicAnalytics';

export type SeriesMatch = z.infer<typeof teamSeriesSchema>['matches'][number];
export type GraphMetric = 'points' | 'auto' | 'teleop' | 'feeding';

export function rollingValues(values: (number | null)[], window: number, groups?: string[]) {
	return values.map((value, index) => {
		if (value === null) return null;

		const sample = values
			.slice(Math.max(0, index - window + 1), index + 1)
			.filter(
				(entry, offset): entry is number =>
					entry !== null &&
					(!groups || groups[Math.max(0, index - window + 1) + offset] === groups[index])
			);

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

export function consistency(values: (number | null)[]) {
	const sample = values.filter(
		(value): value is number => value !== null && Number.isFinite(value)
	);
	if (!sample.length) return null;
	const sorted = [...sample].sort((a, b) => a - b);
	const quantile = (fraction: number) => {
		const index = (sorted.length - 1) * fraction;
		const lower = Math.floor(index);
		return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower);
	};
	const recent = sample.slice(-5);
	return {
		average: sample.reduce((a, b) => a + b, 0) / sample.length,
		median: quantile(0.5),
		lower: quantile(0.25),
		upper: quantile(0.75),
		best: sorted[sorted.length - 1],
		recent: recent.reduce((a, b) => a + b, 0) / recent.length,
		recentCount: recent.length,
		count: sample.length
	};
}
