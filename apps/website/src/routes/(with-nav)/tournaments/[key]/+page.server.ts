import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { tournamentSchema } from '$lib/server/tournament';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch, setHeaders, params }) => {
	if (!/^[0-9]{4}[a-z0-9]+$/.test(params.key)) error(404, 'Tournament not found');

	if (!env.LOVAT_API_BASE) error(503, 'Tournament data is not configured');

	let response: Response;

	try {
		response = await fetch(
			`${env.LOVAT_API_BASE}/v1/tournaments/${encodeURIComponent(params.key)}`,
			{
				signal: AbortSignal.timeout(10_000)
			}
		);
	} catch {
		error(503, 'Tournament data is temporarily unavailable. Please try again shortly.');
	}

	if (response.status === 404) error(404, 'This tournament has not been imported yet.');
	if (!response.ok) error(503, 'Tournament data is temporarily unavailable.');

	let payload: unknown;

	try {
		payload = await response.json();
	} catch {
		error(503, 'Tournament data is temporarily unavailable.');
	}

	const parsed = tournamentSchema.safeParse(payload);

	if (!parsed.success || parsed.data.key !== params.key)
		error(503, 'Tournament data is temporarily unavailable.');

	setHeaders({ 'cache-control': 'public, max-age=30' });

	return { tournament: parsed.data };
};
