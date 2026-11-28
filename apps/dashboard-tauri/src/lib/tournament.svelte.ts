import { prefs } from '#lib/storage.ts';

export interface Tournament {
	key: string;
	name: string;
	date?: Date | null;
	endDate?: Date | null;
	location?: string | null;
	isParticipant?: boolean;
}

export function tournamentLabel(t: Tournament): string {
	if (!t.date || t.date.getFullYear() === new Date().getFullYear()) return t.name;
	return `${t.date.getFullYear()} ${t.name}`.trim();
}

function parseDate(value: unknown): Date | null {
	if (typeof value !== 'string' || !value) return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function tournamentFromJson(json: any): Tournament {
	return {
		key: json.key,
		name: json.name,
		date: parseDate(json.startDate ?? json.date),
		endDate: parseDate(json.endDate),
		location: json.location ?? null,
		isParticipant: json.isParticipant ?? false
	};
}

/**
 * The selected tournament, shared by every page, stored under the same
 * preference names the Flutter app used (`tournament`, `tournament_localized`).
 */
class CurrentTournament {
	value = $state<Tournament | null>(null);

	constructor() {
		const key = prefs.getString('tournament');
		const name = prefs.getString('tournament_localized');
		if (key && name) this.value = { key, name };
	}

	set(t: Tournament | null) {
		if (t) {
			prefs.setString('tournament', t.key);
			prefs.setString('tournament_localized', tournamentLabel(t));
			this.value = { ...t, name: tournamentLabel(t), date: null };
		} else {
			prefs.remove('tournament');
			prefs.remove('tournament_localized');
			this.value = null;
		}
	}
}

export const currentTournament = new CurrentTournament();
