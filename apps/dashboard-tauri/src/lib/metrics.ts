// 2026 season metric definitions, ported from apps/dashboard/lib/metrics.dart.
// These paths are a cross-app contract with the Server analysis endpoints.

import type { PicklistWeight } from '#lib/api/endpoints.ts';

export function numToStringRounded(value: number | null | undefined): string {
	if (value === null || value === undefined || Number.isNaN(value)) return '--';
	return value.toFixed(1).replace(/\.?0+$/, '') || '0';
}

export interface CategoryMetric {
	localizedName: string;
	abbreviatedLocalizedName: string;
	path: string;
	units?: string;
	max?: number;
	hideDetails?: boolean;
	hideOverview?: boolean;
	hideFlag?: boolean;
	valueToString?: (value: string) => string;
}

export function abbreviatedNameWithUnits(m: CategoryMetric) {
	const units = m.units?.trim();
	return units ? `${m.abbreviatedLocalizedName} (${units})` : m.abbreviatedLocalizedName;
}

export function formatMetric(m: CategoryMetric, value: unknown): string {
	if (value === null || value === undefined) return '--';
	if (m.valueToString) {
		return m.valueToString(typeof value === 'number' ? numToStringRounded(value) : String(value));
	}
	if (typeof value === 'number') {
		const rounded = numToStringRounded(value);
		return m.units !== undefined ? `${rounded}${m.units}` : rounded;
	}
	return String(value);
}

export interface MetricCategoryData {
	localizedName: string;
	metrics: CategoryMetric[];
}

const outOfFive = (v: string) => `${v}/5`;

export const metricCategories: MetricCategoryData[] = [
	{
		localizedName: 'Score',
		metrics: [
			{ localizedName: 'Total score in a match', abbreviatedLocalizedName: 'Total', path: 'totalPoints' },
			{ localizedName: 'Total score during autonomous', abbreviatedLocalizedName: 'Auto', path: 'autoPoints' },
			{ localizedName: 'Total score during teleop', abbreviatedLocalizedName: 'Teleop', path: 'teleopPoints' }
		]
	},
	{
		localizedName: 'Hub',
		metrics: [
			{ localizedName: 'Fuel scored per second', abbreviatedLocalizedName: 'Scoring Rate', units: ' bps', path: 'fuelPerSecond' },
			{ localizedName: 'Accuracy when shooting fuel', abbreviatedLocalizedName: 'Accuracy', units: '%', max: 100, path: 'accuracy' },
			{ localizedName: 'Volleys per match', abbreviatedLocalizedName: 'Volleys/Match', path: 'volleysPerMatch' }
		]
	},
	{
		localizedName: 'Feeding',
		metrics: [
			{ localizedName: 'Time spent feeding in a match', abbreviatedLocalizedName: 'Time Feeding', units: 's', path: 'timeFeeding' },
			{ localizedName: 'Fuel fed per second', abbreviatedLocalizedName: 'Feeding Rate', units: ' bps', path: 'feedingRate' },
			{ localizedName: 'Feeing volleys/dumps per match', abbreviatedLocalizedName: 'Feeds/Match', path: 'feedsPerMatch' }
		]
	},
	{
		localizedName: 'Driving & Defense',
		metrics: [
			{
				localizedName: 'Manually scored driving rating',
				abbreviatedLocalizedName: 'Driver Ability',
				max: 5,
				units: '1-5',
				valueToString: outOfFive,
				path: 'driverAbility'
			},
			{
				localizedName: 'Time spent doing contact defense in a match',
				abbreviatedLocalizedName: 'Contact Defense Time',
				units: 's',
				path: 'contactDefenseTime'
			},
			{
				localizedName: 'Manually scored defense rating',
				abbreviatedLocalizedName: 'Defense effectiveness',
				units: '1-5',
				valueToString: outOfFive,
				max: 5,
				path: 'defenseEffectiveness'
			},
			{
				localizedName: 'Time spent doing camping defense in a match',
				abbreviatedLocalizedName: 'Camping Defense Time',
				units: 's',
				path: 'campingDefenseTime'
			},
			{
				localizedName: 'Total defense time (camping + contact)',
				abbreviatedLocalizedName: 'Total Defense Time',
				units: 's',
				path: 'totalDefenseTime'
			}
		]
	},
	{
		localizedName: 'Climb',
		metrics: [
			{ localizedName: 'Seconds left when starting to climb L1', abbreviatedLocalizedName: 'L1 Time', units: 's left', path: 'l1StartTime' },
			{ localizedName: 'Seconds left when starting to climb L2', abbreviatedLocalizedName: 'L2 Time', units: 's left', path: 'l2StartTime' },
			{ localizedName: 'Seconds left when starting to climb L3', abbreviatedLocalizedName: 'L3 Time', units: 's left', path: 'l3StartTime' },
			{
				localizedName: 'Seconds left in auto when starting to climb in auto',
				abbreviatedLocalizedName: 'Auto Time',
				units: 's left',
				path: 'autoClimbStartTime'
			}
		]
	},
	{
		localizedName: 'Other',
		metrics: [
			{
				localizedName: 'Total fuel outputted between both feeding and scoring',
				abbreviatedLocalizedName: 'Total Fuel Throughput',
				path: 'totalFuelOutputted'
			},
			{
				localizedName: 'Number of times outpost was used to intake during a match',
				abbreviatedLocalizedName: 'Outpost Intakes',
				path: 'outpostIntakes'
			}
		]
	}
];

export interface BreakdownSegmentData {
	localizedNameSingular: string;
	localizedNamePlural?: string;
	path: string;
}

export interface BreakdownData {
	localizedName: string;
	path: string;
	segments: BreakdownSegmentData[];
}

const seg = (localizedNameSingular: string, path: string): BreakdownSegmentData => ({ localizedNameSingular, path });

export const breakdowns: BreakdownData[] = [
	{
		localizedName: 'Roles',
		path: 'robotRole',
		segments: [seg('Cycling', 'CYCLING'), seg('Scoring', 'SCORING'), seg('Feeding', 'FEEDING'), seg('Defending', 'DEFENDING'), seg('Immobile', 'IMMOBILE')]
	},
	{
		localizedName: 'Traversal',
		path: 'fieldTraversal',
		segments: [seg('None', 'NONE'), seg('Trench', 'TRENCH'), seg('Bump', 'BUMP'), seg('Both', 'BOTH')]
	},
	{
		localizedName: 'Climb Result',
		path: 'climbResult',
		segments: [seg('Not Attempted', 'NOT_ATTEMPTED'), seg('Failed', 'FAILED'), seg('L1', 'L1'), seg('L2', 'L2'), seg('L3', 'L3')]
	},
	{
		localizedName: 'Beaching',
		path: 'beached',
		segments: [seg('On Fuel', 'ON_FUEL'), seg('On Bump', 'ON_BUMP'), seg('Neither', 'NEITHER'), seg('Both', 'BOTH')]
	},
	{ localizedName: 'Scores While Moving', path: 'scoresWhileMoving', segments: [seg('Yes', 'TRUE'), seg('No', 'FALSE')] },
	{
		localizedName: 'Intake Type',
		path: 'intakeType',
		segments: [seg('Ground', 'GROUND'), seg('Outpost', 'OUTPOST'), seg('Both', 'BOTH'), seg('Neither', 'NEITHER')]
	},
	{ localizedName: 'Disrupts Fuel in Auto', path: 'disrupts', segments: [seg('Yes', 'TRUE'), seg('No', 'FALSE')] },
	{
		localizedName: 'Feeder Type',
		path: 'feederType',
		segments: [seg('Continuous', 'CONTINUOUS'), seg('Stop to Shoot', 'STOP_TO_SHOOT'), seg('Dump', 'DUMP')]
	}
];

export function segmentName(breakdownPath: string, segmentPath: string) {
	return (
		breakdowns.find((b) => b.path === breakdownPath)?.segments.find((s) => s.path === segmentPath)
			?.localizedNameSingular ?? segmentPath
	);
}

export const picklistWeights: Omit<PicklistWeight, 'value'>[] = [
	['totalPoints', 'Total Points'],
	['autoPoints', 'Auto Points'],
	['teleopPoints', 'Teleop Points'],
	['driverAbility', 'Driver Ability'],
	['climbResult', 'Climb Result'],
	['autoClimb', 'Auto Climb'],
	['defenseEffectiveness', 'Defense Effectiveness'],
	['contactDefenseTime', 'Contact Defense Time'],
	['campingDefenseTime', 'Camping Defense Time'],
	['totalDefensiveTime', 'Total Defensive Time'],
	['totalFuelThroughput', 'Total Fuel Throughput'],
	['totalFuelFed', 'Total Fuel Fed'],
	['feedingRate', 'Feeding Rate'],
	['scoringRate', 'Scoring Rate'],
	['estimatedSuccessfulFuelRate', 'Estimated Successful Fuel Rate'],
	['estimatedTotalFuelScored', 'Estimated Total Fuel Scored']
].map(([path, localizedName]) => ({ path, localizedName }));

export const picklistWeightNames = new Map(picklistWeights.map((w) => [w.path, w.localizedName]));
