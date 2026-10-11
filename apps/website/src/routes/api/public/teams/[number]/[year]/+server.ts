import { json } from '@sveltejs/kit';
import { fetchPublic, metricsSchema, photoSchema } from '$lib/server/publicAnalytics';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, fetch }) => {
	if (
		!/^[1-9]\d{0,9}$/.test(params.number) ||
		Number(params.number) > 2_147_483_647 ||
		!/^\d{4}$/.test(params.year) ||
		Number(params.year) < 1992
	)
		return json({ error: 'Invalid team' }, { status: 400 });

	const path = `teams/${params.number}/${params.year}`;
	const [metrics, photo] = await Promise.allSettled([
		fetchPublic(fetch, `${path}/metrics`, metricsSchema),
		fetchPublic(fetch, `${path}/photo`, photoSchema)
	]);

	return json(
		{
			metrics: metrics.status === 'fulfilled' ? metrics.value.metrics : null,
			photo: photo.status === 'fulfilled' ? photo.value.photo : null
		},
		{ headers: { 'cache-control': 'public, max-age=60' } }
	);
};
