import type { z } from 'zod';
import type { tournamentSchema } from '$lib/server/tournament';

type Match = z.infer<typeof tournamentSchema>['matches'][number];

export function matchLabel(match: Match, playoffType: number | null) {
	if (match.competitionLevel === 'QUALIFICATION') return `Qualification ${match.matchNumber}`;

	if (match.competitionLevel === 'FINAL') {
		return match.matchNumber === 3 ? 'Finals Tiebreaker' : `Finals Match ${match.matchNumber}`;
	}

	// Only apply double-elimination labels to that format.
	if (match.competitionLevel === 'SEMIFINAL' && playoffType === 10) {
		const bracketNames: Record<number, string> = {
			1: 'Upper Bracket Round 1',
			2: 'Upper Bracket Round 1',
			3: 'Upper Bracket Round 1',
			4: 'Upper Bracket Round 1',
			5: 'Lower Bracket Round 1',
			6: 'Lower Bracket Round 1',
			7: 'Upper Bracket Round 2',
			8: 'Upper Bracket Round 2',
			9: 'Lower Bracket Round 2',
			10: 'Lower Bracket Round 2',
			11: 'Upper Bracket Final',
			12: 'Lower Bracket Semifinal',
			13: 'Lower Bracket Final'
		};

		return `${bracketNames[match.setNumber]} · Match ${match.setNumber}`;
	}

	const stage =
		match.competitionLevel === 'SEMIFINAL'
			? 'Semifinal'
			: match.competitionLevel === 'QUARTERFINAL'
				? 'Quarterfinal'
				: 'Eighthfinal';

	return `${stage} ${match.setNumber} · Match ${match.matchNumber}`;
}
