import { error, isHttpError, json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { tournamentSchema } from '$lib/server/tournament';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, fetch }) => {
	const teamNumber = Number(params.number);

	if (
		!/^[1-9]\d{0,9}$/.test(params.number) ||
		teamNumber > 2_147_483_647 ||
		!/^\d{4}$/.test(params.year) ||
		Number(params.year) < 1992 ||
		!/^[0-9]{4}[a-z0-9]+$/.test(params.key) ||
		!params.key.startsWith(params.year)
	)
		error(404, 'Tournament not found');

	if (!env.LOVAT_API_BASE) error(503, 'Tournament data is not configured');

	try {
		const response = await fetch(`${env.LOVAT_API_BASE}/v1/tournaments/${params.key}`, {
			signal: AbortSignal.timeout(10_000)
		});

		if (response.status === 404) error(404, 'Tournament not found');
		if (!response.ok) error(503, 'Tournament data is temporarily unavailable');

		const parsed = tournamentSchema.safeParse(await response.json());

		if (!parsed.success || parsed.data.key !== params.key)
			error(503, 'Tournament data is temporarily unavailable');

		const tournament = parsed.data;
		const selection =
			tournament.allianceSelections?.findIndex(
				(alliance) => alliance.teams.includes(teamNumber) || alliance.backup?.in === teamNumber
			) ?? -1;

		return json(
			{
				playoffType: tournament.playoffType,
				timezone: tournament.timezone,
				teams: tournament.teams.map(({ team }) => ({ number: team.number, name: team.name })),
				matches: tournament.matches.filter((match) =>
					match.teamSlots.some((slot) => slot.teamNumber === teamNumber)
				),
				alliance:
					selection < 0
						? null
						: {
								number: selection + 1,
								...tournament.allianceSelections![selection]
							}
			},
			{ headers: { 'cache-control': 'public, max-age=30' } }
		);
	} catch (cause) {
		if (isHttpError(cause)) throw cause;

		error(503, 'Tournament data is temporarily unavailable');
	}
};
