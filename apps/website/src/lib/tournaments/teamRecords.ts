import type { z } from 'zod';
import type { tournamentSchema } from '$lib/server/tournament';

type Match = z.infer<typeof tournamentSchema>['matches'][number];

export function teamRecords(matches: Match[]) {
	const records = new Map<number, { wins: number; losses: number; ties: number }>();

	for (const match of matches) {
		if (match.status !== 'COMPLETED') continue;

		const blue = match.alliances.find((alliance) => alliance.color === 'BLUE')?.score;
		const red = match.alliances.find((alliance) => alliance.color === 'RED')?.score;
		const tie = blue != null && red != null && blue === red;

		if (!match.winningAlliance && !tie) continue;

		for (const slot of match.teamSlots) {
			if (!slot.alliance || slot.surrogate) continue;

			const record = records.get(slot.teamNumber) ?? { wins: 0, losses: 0, ties: 0 };

			if (slot.disqualified) record.losses++;
			else if (tie) record.ties++;
			else if (match.winningAlliance === slot.alliance) record.wins++;
			else record.losses++;

			records.set(slot.teamNumber, record);
		}
	}

	return records;
}
