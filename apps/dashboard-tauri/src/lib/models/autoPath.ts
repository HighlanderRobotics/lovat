import { GameMatchIdentity } from './match';

export interface Offset {
	x: number;
	y: number;
}

export enum AutoPathEventType {
	startScoring,
	stopScoring,
	startMatch,
	unused1,
	unused2,
	unused3,
	unused4,
	intake,
	outtake,
	disrupt,
	cross,
	climb,
	startFeeding,
	stopFeeding
}

export enum AutoPathLocation {
	leftTrench,
	leftBump,
	hub,
	rightTrench,
	rightBump,
	neutralZone,
	depot,
	outpost,
	none,
	tower,
	startLeftTrench,
	startLeftBump,
	startHub,
	startRightTrench,
	startRightBump
}

/** `x` and `y` are between 0 and 100, from the top left of the field image. */
const locationOffsets: Partial<Record<AutoPathLocation, Offset>> = {
	[AutoPathLocation.leftTrench]: { x: 35, y: 10 },
	[AutoPathLocation.leftBump]: { x: 35, y: 25 },
	[AutoPathLocation.hub]: { x: 42, y: 50 },
	[AutoPathLocation.rightTrench]: { x: 35, y: 90 },
	[AutoPathLocation.rightBump]: { x: 35, y: 75 },
	[AutoPathLocation.startLeftTrench]: { x: 45, y: 10 },
	[AutoPathLocation.startLeftBump]: { x: 45, y: 25 },
	[AutoPathLocation.startHub]: { x: 57.5, y: 50 },
	[AutoPathLocation.startRightTrench]: { x: 45, y: 90 },
	[AutoPathLocation.startRightBump]: { x: 45, y: 75 },
	[AutoPathLocation.neutralZone]: { x: 20, y: 50 },
	[AutoPathLocation.depot]: { x: 93, y: 72.5 },
	[AutoPathLocation.outpost]: { x: 93, y: 10 },
	[AutoPathLocation.tower]: { x: 92, y: 45 }
};

export const locationOffset = (l: AutoPathLocation): Offset => locationOffsets[l] ?? { x: 0, y: 0 };

function adjacentStartingLocation(l: AutoPathLocation): AutoPathLocation {
	switch (l) {
		case AutoPathLocation.leftTrench:
			return AutoPathLocation.startLeftTrench;
		case AutoPathLocation.leftBump:
			return AutoPathLocation.startLeftBump;
		case AutoPathLocation.hub:
			return AutoPathLocation.startHub;
		case AutoPathLocation.rightTrench:
			return AutoPathLocation.startRightTrench;
		case AutoPathLocation.rightBump:
			return AutoPathLocation.startRightBump;
		default:
			return AutoPathLocation.none;
	}
}

function randomVariance(l: AutoPathLocation): Offset {
	if (l <= AutoPathLocation.rightBump || l >= AutoPathLocation.startLeftTrench) return { x: 0, y: 0 };
	if (l === AutoPathLocation.outpost || l === AutoPathLocation.depot || l === AutoPathLocation.tower)
		return { x: 0, y: 5 };
	return { x: 10, y: 10 };
}

export function locationName(l: AutoPathLocation): string {
	switch (l) {
		case AutoPathLocation.leftTrench:
		case AutoPathLocation.startLeftTrench:
			return 'Left trench';
		case AutoPathLocation.leftBump:
		case AutoPathLocation.startLeftBump:
			return 'Left bump';
		case AutoPathLocation.hub:
		case AutoPathLocation.startHub:
			return 'Hub';
		case AutoPathLocation.rightTrench:
		case AutoPathLocation.startRightTrench:
			return 'Right trench';
		case AutoPathLocation.rightBump:
		case AutoPathLocation.startRightBump:
			return 'Right bump';
		case AutoPathLocation.neutralZone:
			return 'Neutral Zone';
		case AutoPathLocation.depot:
			return 'Depot';
		case AutoPathLocation.outpost:
			return 'Outpost';
		case AutoPathLocation.tower:
			return 'Tower';
		default:
			return 'Unknown';
	}
}

export interface AutoPathEvent {
	/** Milliseconds since the start of the match. */
	timestamp: number;
	type: AutoPathEventType;
	location: AutoPathLocation;
	quantity?: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function eventFromMap(map: any): AutoPathEvent {
	const type = map.event as AutoPathEventType;
	let location: AutoPathLocation;
	if (type === AutoPathEventType.climb) location = AutoPathLocation.tower;
	else if (type === AutoPathEventType.startScoring || type === AutoPathEventType.stopScoring)
		location = AutoPathLocation.none;
	else if (type === AutoPathEventType.startMatch) location = adjacentStartingLocation(map.location);
	else location = map.location;
	return { timestamp: Math.round(map.time * 1000), type, location, quantity: map.quantity ?? null };
}

export interface BallTrajectory {
	startPos: Offset;
	endPos: Offset;
	startTime: number;
	endTime: number;
}

export type GamePiece = 'fuel' | 'disrupt';

export interface PositionedGamePiece {
	piece: GamePiece;
	position: Offset;
}

/** Deterministic PRNG so a path always jitters the same way. */
function mulberry32(seed: number) {
	return () => {
		seed |= 0;
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function hashString(s: string) {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
	return h >>> 0;
}

export class AutoPath {
	readonly timeline: AutoPathEvent[];
	readonly trajectories: BallTrajectory[];
	private _randomized: Offset[] | null = null;

	constructor(
		readonly frequency: number,
		readonly scores: number[],
		timeline: AutoPathEvent[],
		readonly matches: GameMatchIdentity[]
	) {
		this.timeline = [...timeline].sort((a, b) => a.timestamp - b.timestamp);
		this.trajectories = [
			...this.trajectoriesFor(AutoPathEventType.startScoring, AutoPathEventType.stopScoring, () =>
				locationOffset(AutoPathLocation.hub)
			),
			...this.trajectoriesFor(AutoPathEventType.startFeeding, AutoPathEventType.stopFeeding, (start) => ({
				x: 77.8,
				y: start.y
			}))
		];
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	static fromMap(map: any) {
		return new AutoPath(
			map.frequency,
			map.score,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(map.positions as any[]).map(eventFromMap),
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(map.matches as any[]).map((m) => GameMatchIdentity.fromLongKey(m.matchKey, m.tournamentName))
		);
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	static fromMapSingleMatch(map: any) {
		return new AutoPath(1, [map.autoPoints], map.positions.map(eventFromMap), [
			GameMatchIdentity.fromLongKey(map.match)
		]);
	}

	private trajectoriesFor(
		startType: AutoPathEventType,
		stopType: AutoPathEventType,
		end: (start: Offset) => Offset
	): BallTrajectory[] {
		const out: BallTrajectory[] = [];
		for (const stop of this.timeline.filter((e) => e.type === stopType)) {
			const start = [...this.timeline]
				.reverse()
				.find((e) => e.type === startType && e.timestamp <= stop.timestamp);
			if (!start || !stop.quantity || stop.quantity <= 0) continue;
			for (let i = 1; i <= stop.quantity; i++) {
				const startTime = Math.round(start.timestamp + (i / stop.quantity) * (stop.timestamp - start.timestamp));
				const startPos = this.positionAt(startTime);
				out.push({ startPos, endPos: end(startPos), startTime, endTime: startTime + 400 });
			}
		}
		return out;
	}

	get averageScore() {
		return this.scores.length ? this.scores.reduce((a, b) => a + b, 0) / this.scores.length : 0;
	}

	get shortDescription(): string {
		const startEvent = this.timeline.find((e) => e.type === AutoPathEventType.startMatch);
		const start = startEvent ? locationName(startEvent.location).replaceAll(' ', '-') : 'Unknown';
		const disrupts = this.timeline.some((e) => e.type === AutoPathEventType.disrupt);
		const sum = (t: AutoPathEventType) =>
			this.timeline.filter((e) => e.type === t).reduce((total, e) => total + (e.quantity ?? 0), 0);
		const fuelScored = sum(AutoPathEventType.stopScoring);
		const fuelFed = sum(AutoPathEventType.stopFeeding);
		const climb = this.timeline.some((e) => e.type === AutoPathEventType.climb);
		return `${start}${fuelScored > 0 ? ` ${fuelScored} fuel` : ''}${disrupts ? ', disrupt' : ''}${
			fuelFed > 0 ? `, ${fuelFed} feed` : ''
		} ${climb ? '+ climb' : ''}`.trim();
	}

	private get located() {
		return this.timeline.filter((e) => e.location !== AutoPathLocation.none);
	}

	private get baseOffsets(): Offset[] {
		const random = mulberry32(hashString(JSON.stringify(this.timeline)));
		return this.located.map((event) => {
			const o = locationOffset(event.location);
			const v = randomVariance(event.location);
			return { x: o.x + (random() * 2 - 0.5) * v.x, y: o.y + (random() * 2 - 0.5) * v.y };
		});
	}

	/** Offsets for every timeline event, interpolating unlocated events. */
	get randomizedOffsets(): Offset[] {
		if (!this._randomized) {
			const base = this.baseOffsets;
			this._randomized = this.timeline.map((e) => this.positionAt(e.timestamp, base));
		}
		return this._randomized;
	}

	/** Polyline of located events, for drawing the static path. */
	get pathPoints(): Offset[] {
		return this.baseOffsets;
	}

	positionAt(timestamp: number, offsets?: Offset[]): Offset {
		const located = this.located;
		if (located.length === 0) return { x: 0, y: 0 };
		const ours = offsets ?? this.baseOffsets;
		const last = located[located.length - 1].timestamp;
		const progress = Math.min(timestamp, last);
		const nextIndex = located.findIndex((e) => e.timestamp >= progress);
		const next = nextIndex === -1 ? located.length - 1 : nextIndex;
		const previous = Math.max(0, next - 1);
		const prevEvent = located[previous];
		const nextEvent = located[next];
		let t = (progress - prevEvent.timestamp) / (nextEvent.timestamp - prevEvent.timestamp);
		if (!Number.isFinite(t)) t = 0;
		const a = ours[previous];
		const b = ours[next];
		return { x: (b.x - a.x) * t + a.x, y: (b.y - a.y) * t + a.y };
	}

	gamePiecesAt(timestamp: number): PositionedGamePiece[] {
		const disrupt = this.timeline.find((e) => e.type === AutoPathEventType.disrupt);
		const disruptTime = disrupt ? disrupt.timestamp : Number.POSITIVE_INFINITY;
		const balls: PositionedGamePiece[] = this.trajectories
			.filter((t) => t.startTime <= timestamp && timestamp <= t.endTime)
			.map((t) => {
				const p = (timestamp - t.startTime) / (t.endTime - t.startTime);
				return {
					piece: 'fuel',
					position: { x: p * (t.endPos.x - t.startPos.x) + t.startPos.x, y: p * (t.endPos.y - t.startPos.y) + t.startPos.y }
				};
			});
		if (timestamp > disruptTime) {
			balls.push({ piece: 'disrupt', position: locationOffset(AutoPathLocation.neutralZone) });
		}
		return balls;
	}
}
