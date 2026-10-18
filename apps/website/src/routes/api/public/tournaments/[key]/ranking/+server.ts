import { json } from '@sveltejs/kit';
import { fetchPublic, tournamentRankingSchema } from '$lib/server/publicAnalytics';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, fetch }) => {
	if (!/^\d{4}[a-z0-9]+$/.test(params.key))
		return json({ error: 'Invalid tournament' }, { status: 400 });

	try {
		return json(
			await fetchPublic(fetch, `tournaments/${params.key}/ranking`, tournamentRankingSchema),
			{ headers: { 'cache-control': 'public, max-age=60' } }
		);
	} catch {
		return json({ error: 'Tournament ranking unavailable' }, { status: 503 });
	}
};
