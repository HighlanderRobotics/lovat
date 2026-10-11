import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { z } from 'zod';
import { tournamentSchema } from '$lib/server/tournament';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, fetch, setHeaders }) => {
	const key = params.key.match(
		/^([0-9]{4}[a-z0-9]+)_(?:qm[1-9]\d*|(?:ef|qf|sf|f)[1-9]\d*m[1-9]\d*)$/
	);

	if (!key) error(404, 'Match not found');
	if (!env.LOVAT_API_BASE) error(503, 'Match data is not configured');

	let response: Response;

	try {
		response = await fetch(`${env.LOVAT_API_BASE}/v1/tournaments/${key[1]}`, {
			signal: AbortSignal.timeout(10_000)
		});
	} catch {
		error(503, 'Match data is temporarily unavailable');
	}

	if (response.status === 404) error(404, 'Match not found');
	if (!response.ok) error(503, 'Match data is temporarily unavailable');

	let payload: unknown;

	try {
		payload = await response.json();
	} catch {
		error(503, 'Match data is temporarily unavailable');
	}

	const parsed = tournamentSchema.safeParse(payload);

	if (!parsed.success || parsed.data.key !== key[1])
		error(503, 'Match data is temporarily unavailable');

	const tournament = parsed.data;
	const index = tournament.matches.findIndex((match) => match.key === params.key);

	if (index < 0) error(404, 'Match not found');

	setHeaders({ 'cache-control': 'public, max-age=30' });

	let breakdowns: { color: 'BLUE' | 'RED'; scoreBreakdown: Record<string, unknown> | null }[] = [];

	try {
		const breakdownResponse = await fetch(`${env.LOVAT_API_BASE}/v1/matches/${params.key}`, {
			signal: AbortSignal.timeout(10_000)
		});

		if (breakdownResponse.ok) {
			const result = z
				.object({
					key: z.literal(params.key),
					alliances: z.array(
						z.object({
							color: z.enum(['BLUE', 'RED']),
							scoreBreakdown: z.record(z.string(), z.unknown()).nullable()
						})
					)
				})
				.safeParse(await breakdownResponse.json());

			if (result.success) breakdowns = result.data.alliances;
		}
	} catch {
		// Keep the match result available while breakdown data is unavailable.
	}

	return {
		breakdowns,
		match: tournament.matches[index],
		previous: tournament.matches[index - 1] ?? null,
		next: tournament.matches[index + 1] ?? null,
		tournament: {
			key: tournament.key,
			name: tournament.name,
			seasonYear: tournament.seasonYear ?? Number(key[1].slice(0, 4)),
			district: tournament.district,
			timezone: tournament.timezone,
			playoffType: tournament.playoffType,
			teams: tournament.teams.map(({ team }) => ({ number: team.number, name: team.name }))
		}
	};
};
