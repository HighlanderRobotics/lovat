import { describe, expect, it } from 'vitest';
import { GameMatchIdentity, MatchType } from './match.ts';

describe('GameMatchIdentity', () => {
	it('parses long match keys', () => {
		const match = GameMatchIdentity.fromLongKey('2022cc_qm14_1', 'Chezy');
		expect(match.type).toBe(MatchType.qualifier);
		expect(match.number).toBe(14);
		expect(match.tournamentKey).toBe('2022cc');
		expect(match.toMediumKey()).toBe('2022cc_qm14');
		expect(match.getShortLocalizedDescription()).toBe('QM14');
	});

	it('names double-elimination rounds like the Flutter app', () => {
		const name = (n: number) => new GameMatchIdentity(MatchType.elimination, n, 'k').getSpecificName();
		expect(name(1)).toBe('Match 1 - Upper Bracket - Round 1');
		expect(name(5)).toBe('Match 5 - Lower Bracket - Round 2');
		expect(name(13)).toBe('Match 13 - Lower Bracket - Round 5');
		expect(name(15)).toBe('Match 15 - Finals 2');
	});

	it('builds localized descriptions', () => {
		const match = new GameMatchIdentity(MatchType.qualifier, 3, '2026casj', 'Silicon Valley');
		expect(match.getLocalizedDescription()).toBe('Qualifier 3 at Silicon Valley');
		expect(match.getLocalizedDescription({ includeTournament: false })).toBe('Qualifier 3');
		expect(match.getLocalizedDescription({ abbreviateName: true, includeTournament: false })).toBe('QM3');
	});
});
