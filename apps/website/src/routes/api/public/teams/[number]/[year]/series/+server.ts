import { json } from '@sveltejs/kit';
import { fetchPublic, teamSeriesSchema } from '$lib/server/publicAnalytics';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, fetch }) => {
	if (
		!/^[1-9]\d{0,9}$/.test(params.number) ||
		Number(params.number) > 2_147_483_647 ||
		!/^\d{4}$/.test(params.year) ||
		Number(params.year) < 1992
	)
		return json({ error: 'Invalid team' }, { status: 400 });

	try {
		return json(
			await fetchPublic(fetch, `teams/${params.number}/${params.year}/series`, teamSeriesSchema),
			{
				headers: { 'cache-control': 'public, max-age=60' }
			}
		);
	} catch {
		return json({ error: 'Team analytics unavailable' }, { status: 503 });
	}
};
