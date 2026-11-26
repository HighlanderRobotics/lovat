import type { PicklistBreakdownEntry } from '#lib/api/endpoints.ts';

/** In-memory hand-off of z-scores from a ranking list to its breakdown page. */
export interface BreakdownHandoff {
	team: number;
	title: string;
	weighted: PicklistBreakdownEntry[];
	unweighted: PicklistBreakdownEntry[];
}

let current: BreakdownHandoff | null = null;

export const breakdownHandoff = {
	set(value: BreakdownHandoff) {
		current = value;
	},
	get(team: number) {
		return current?.team === team ? current : null;
	}
};
