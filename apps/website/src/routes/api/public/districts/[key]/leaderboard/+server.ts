import { json } from '@sveltejs/kit';
import { fetchPublic, leaderboardSchema } from '$lib/server/publicAnalytics';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, fetch }) => {
	if (!/^\d{4}[a-z0-9]+$/.test(params.key))
		return json({ error: 'Invalid district' }, { status: 400 });
	try {
		return json(
			await fetchPublic(fetch, `districts/${params.key}/leaderboard`, leaderboardSchema),
			{
				headers: { 'cache-control': 'public, max-age=60' }
			}
		);
	} catch {
		return json({ error: 'Leaderboard unavailable' }, { status: 503 });
	}
};
