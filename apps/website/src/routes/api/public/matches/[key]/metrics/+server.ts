import { json } from '@sveltejs/kit';
import { fetchPublic, publicMatchMetricsSchema } from '$lib/server/publicAnalytics';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, fetch }) => {
	if (!/^\d{4}[a-z0-9]+_(?:qm\d+|(?:ef|qf|sf|f)\d+m\d+)$/.test(params.key))
		return json({ error: 'Invalid match' }, { status: 400 });

	try {
		return json(
			await fetchPublic(fetch, `matches/${params.key}/metrics`, publicMatchMetricsSchema),
			{
				headers: { 'cache-control': 'public, max-age=60' }
			}
		);
	} catch {
		return json({ error: 'Scouting metrics unavailable' }, { status: 503 });
	}
};
