// Team "flags" (tags): small colored badges showing one statistic per team.

import { abbreviatedNameWithUnits, formatMetric, metricCategories } from '$lib/metrics';
import { prefs } from '$lib/storage';

export interface FlagType {
	path: string;
	readableName: string;
	description: string;
	defaultHue: number;
	format: (data: unknown) => string;
}

export interface FlagConfiguration {
	type: string;
	hue: number;
}

export const flagTypes: FlagType[] = [
	{
		path: 'rank',
		readableName: 'Tournament Ranking',
		description: 'Leaderboard rank from TBA',
		defaultHue: 220,
		format: (data) => (data === 0 ? 'N/A' : String(data))
	},
	...metricCategories
		.flatMap((c) => c.metrics)
		.filter((m) => !m.hideOverview && !m.hideFlag)
		.map((m) => ({
			path: m.path,
			readableName: abbreviatedNameWithUnits(m),
			description: m.localizedName,
			defaultHue: 1,
			format: (data: unknown) => formatMetric(m, data)
		}))
];

export const unknownFlag: FlagType = {
	path: 'unknown',
	readableName: 'Unknown',
	description: 'An unknown team tag',
	defaultHue: 1,
	format: () => '!'
};

export const flagByPath = (path: string) => flagTypes.find((f) => f.path === path) ?? unknownFlag;

export const startFlag = (type: FlagType): FlagConfiguration => ({ type: type.path, hue: type.defaultHue });

export const flagForeground = (hue: number) => `hsl(${hue} 100% 15%)`;
export const flagBackground = (hue: number) => `hsl(${hue} 60% 70%)`;

export function getPicklistFlags(): FlagConfiguration[] {
	return prefs.getJSON<FlagConfiguration[]>('picklist_flags') ?? [];
}

export function setPicklistFlags(flags: FlagConfiguration[]) {
	prefs.setJSON('picklist_flags', flags);
}

export function getTeamLookupFlag(): FlagConfiguration {
	return prefs.getJSON<FlagConfiguration>('team_lookup_flag') ?? startFlag(flagTypes[0]);
}

export function setTeamLookupFlag(flag: FlagConfiguration) {
	prefs.setJSON('team_lookup_flag', flag);
}

/** Drop stored flags whose metrics no longer exist this season. */
export function sanitizeStoredFlags() {
	setPicklistFlags(getPicklistFlags().filter((f) => flagTypes.some((t) => t.path === f.type)));
	const lookup = prefs.getJSON<FlagConfiguration>('team_lookup_flag');
	if (!lookup || !flagTypes.some((t) => t.path === lookup.type)) setTeamLookupFlag(startFlag(flagTypes[0]));
}
