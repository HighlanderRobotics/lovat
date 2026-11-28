import type { Tournament } from '#lib/tournament.svelte.ts';
import { tournamentLabel } from '#lib/tournament.svelte.ts';

const calendarDate = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Date-only API values are UTC midnight; read them as calendar dates. */
export const utcCalendarDate = (d: Date) => new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** Upcoming and ongoing events through Sunday. */
export function tournamentsThisWeek(tournaments: Tournament[], now = new Date()): Tournament[] {
	const today = calendarDate(now);
	const weekday = today.getDay() === 0 ? 7 : today.getDay();
	const nextMonday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 8 - weekday);
	return tournaments
		.filter((t) => {
			if (!t.date) return false;
			const start = utcCalendarDate(t.date);
			const end = utcCalendarDate(t.endDate ?? t.date);
			return start < nextMonday && end >= today;
		})
		.sort((a, b) => a.date!.getTime() - b.date!.getTime() || tournamentLabel(a).localeCompare(tournamentLabel(b)));
}

export function formatDateRange(t: Tournament): string {
	const fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
	const start = utcCalendarDate(t.date!);
	const end = t.endDate ? utcCalendarDate(t.endDate) : null;
	return end && end.getTime() !== start.getTime() ? `${fmt.format(start)} – ${fmt.format(end)}` : fmt.format(start);
}
