import { AutoPath } from './autoPath';
import { RobotRole } from './types';

export enum EndgameClimbResult {
	notAttempted,
	failed,
	l1,
	l2,
	l3
}

export const endgameClimbNames = ['None', 'Failed', 'L1', 'L2', 'L3'];

export enum AutoClimbResult {
	notAttempted,
	failed,
	succeeded
}

export const autoClimbNames = ['None', 'Failed', 'Succeeded'];

export enum FeederType {
	continuous,
	stopToShoot,
	dump
}

export const feederTypeNames = ['Continuous', 'Stop to Shoot', 'Dump'];

export const accuracyBands = ['<50', '50-60', '60-70', '70-80', '80-90', '90-100'];

export interface SingleScoutReportAnalysis {
	totalPoints: number;
	driverAbility: number;
	robotRoles: RobotRole[];
	autoClimb: AutoClimbResult;
	autoClimbStartTime: number;
	contactDefenseTime: number;
	campingDefenseTime: number;
	scoringRate: number;
	feedingRate: number;
	defenseEffectiveness: number;
	feeds: number;
	accuracy: number | null;
	climbResult: EndgameClimbResult;
	climbStartTime: number;
	feederType: FeederType[];
	autoPath: AutoPath;
	volleys: number;
	ballsFed: number;
	ballsPerFeed: number;
	autoScore: number;
	autoPathScore: number;
	fuelScore: number;
	notes: string | null;
	robotBrokeDescription: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function scoutReportAnalysisFromJson(json: any): SingleScoutReportAnalysis {
	const autoPathScore = json.autoPath.autoPoints as number;
	const autoClimb = json.autoClimb as AutoClimbResult;
	const climbResult = json.climbResult as EndgameClimbResult;
	const totalPoints = json.totalPoints as number;
	const endgamePoints =
		climbResult === EndgameClimbResult.l1
			? 10
			: climbResult === EndgameClimbResult.l2
				? 20
				: climbResult === EndgameClimbResult.l3
					? 30
					: 0;
	const autoClimbPoints = autoClimb === AutoClimbResult.succeeded ? 15 : 0;
	return {
		totalPoints,
		driverAbility: json.driverAbility,
		robotRoles: json.robotRoles,
		feederType: json.feederType,
		scoringRate: json.scoringRate,
		feedingRate: json.feedingRate,
		autoClimbStartTime: json.autoClimbStartTime,
		contactDefenseTime: json.contactDefenseTime,
		campingDefenseTime: json.campingDefenseTime,
		defenseEffectiveness: json.defenseEffectiveness + 1,
		feeds: json.feeds,
		accuracy: json.accuracy ?? null,
		climbStartTime: json.climbStartTime,
		climbResult,
		autoClimb,
		autoPath: AutoPath.fromMapSingleMatch(json.autoPath),
		autoScore: json.autoPoints ?? autoPathScore + autoClimbPoints,
		autoPathScore,
		volleys: json.volleys,
		ballsFed: json.totalBallsFed,
		ballsPerFeed: json.volleys !== 0 ? json.totalBallsFed / json.volleys : 0,
		fuelScore: totalPoints - endgamePoints - autoClimbPoints,
		notes: json.note ? json.note : null,
		robotBrokeDescription: json.robotBrokeDescription ?? null
	};
}

const actionPastTense = [
	'Started scoring',
	'Finished scoring',
	'Started the match',
	'Started camping',
	'Stopped camping',
	'Started contact defending',
	'Stopped contact defending',
	'Took in fuel',
	'Outtaked fuel',
	'Disrupt neutral zone fuel',
	'Crossed into the neutral zone',
	'Started climbing',
	'Started feeding',
	'Finished feeding'
];

const positionNames = [
	'the left trench',
	'the left bump',
	'the hub',
	'the right trench',
	'the right bump',
	'the neutral zone',
	'the depot',
	'the outpost',
	''
];

const POSITION_NONE = 8;

export interface ScoutReportEvent {
	/** Milliseconds since match start. */
	timestamp: number;
	action: number;
	position: number;
	quantity: number;
}

export function scoutReportEventFromList(list: number[]): ScoutReportEvent {
	return {
		timestamp: Math.round(list[0] * 1000),
		action: list[1],
		position: list[2],
		quantity: list.length >= 4 ? list[3] : 0
	};
}

export function describeEvent(event: ScoutReportEvent): string {
	let output = actionPastTense[event.action] ?? 'Unknown action';
	if (event.quantity > 0) output += ` ${event.quantity} fuel`;
	if (event.position !== POSITION_NONE && positionNames[event.position]) {
		output += ` at ${positionNames[event.position]}`;
	}
	return output;
}
