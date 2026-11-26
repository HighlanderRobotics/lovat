export enum MatchType {
	qualifier = 0,
	elimination = 1,
	practice = 2
}

const shortNames: Record<MatchType, string> = {
	[MatchType.qualifier]: 'qm',
	[MatchType.elimination]: 'em',
	[MatchType.practice]: 'pm'
};

const pluralNames: Record<MatchType, string> = {
	[MatchType.qualifier]: 'Qualifiers',
	[MatchType.elimination]: 'Eliminations',
	[MatchType.practice]: 'Practice matches'
};

export function matchTypeFromShortName(name: string): MatchType {
	const entry = Object.entries(shortNames).find(([, short]) => short === name);
	if (!entry) throw new Error(`Unknown match type ${name}`);
	return Number(entry[0]) as MatchType;
}

export class GameMatchIdentity {
	constructor(
		public type: MatchType,
		public number: number,
		public tournamentKey: string,
		public tournamentName?: string | null
	) {}

	get localizedTournament() {
		return this.tournamentName ?? this.tournamentKey;
	}

	getShortLocalizedDescription() {
		return `${shortNames[this.type].toUpperCase()}${this.number}`;
	}

	getSpecificName(): string {
		const n = this.number;
		if (this.type === MatchType.qualifier) return `Qualifier ${n}`;
		let bracket = '';
		if ([1, 2, 3, 4, 7, 8, 11, 12].includes(n)) bracket = 'Upper Bracket - ';
		else if (n < 14) bracket = 'Lower Bracket - ';
		let round: string;
		if (n < 5) round = 'Round 1';
		else if (n <= 8) round = 'Round 2';
		else if (n <= 10) round = 'Round 3';
		else if (n <= 12) round = 'Round 4';
		else if (n === 13) round = 'Round 5';
		else round = 'Finals';
		return round !== 'Finals' ? `Match ${n} - ${bracket}${round}` : `Match ${n} - ${round} ${n - 13}`;
	}

	getLocalizedDescription({
		includeType = true,
		includeNumber = true,
		includeTournament = true,
		abbreviateName = false
	} = {}): string {
		const typed = abbreviateName ? this.getShortLocalizedDescription() : this.getSpecificName();
		const t = this.localizedTournament;
		if (includeType && !includeNumber && !includeTournament) return `${pluralNames[this.type]} match`;
		if (includeType && !includeNumber && includeTournament) return `${pluralNames[this.type]} match at ${t}`;
		if (includeType && includeNumber && !includeTournament) return typed;
		if (!includeType && includeNumber && includeTournament) return `Match #${this.number} at ${t}`;
		if (!includeType && includeNumber && !includeTournament) return `Match #${this.number}`;
		if (!includeType && !includeNumber && includeTournament) return `Match at ${t}`;
		if (includeType && includeNumber && includeTournament) return `${typed} at ${t}`;
		return 'Match';
	}

	/**
	 * Parse a long match key such as `2022cc_qm14_1`. Lovat's own keys use
	 * `qm`, `em` and `pm`; reports from other sources can carry The Blue
	 * Alliance's playoff keys (`sf3m1`, `f1m2`), which map onto Lovat's
	 * double-elimination numbering (rounds 1-13, then finals 14-16).
	 */
	static fromLongKey(longKey: string, tournamentName?: string | null) {
		const [tournamentKey, match = ''] = longKey.split('_');
		const playoff = /^(qf|sf|f)(\d+)m(\d+)$/.exec(match);
		if (playoff) {
			const [, level, set, game] = playoff;
			const number = level === 'f' ? 13 + Number(game) : Number(set);
			return new GameMatchIdentity(MatchType.elimination, number, tournamentKey, tournamentName);
		}
		const simple = /^([a-z]+)(\d+)$/.exec(match);
		if (!simple) throw new Error(`Unrecognized match key ${longKey}`);
		return new GameMatchIdentity(matchTypeFromShortName(simple[1]), Number(simple[2]), tournamentKey, tournamentName);
	}

	toMediumKey() {
		return `${this.tournamentKey}_${shortNames[this.type]}${this.number}`;
	}
}

export type Alliance = 'red' | 'blue';
