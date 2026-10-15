import { json } from '@sveltejs/kit';
import { fetchPublic, publicMatchSchema } from '$lib/server/publicAnalytics';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, fetch }) => {
	const teams = url.searchParams.get('teams') ?? '';
	const year = url.searchParams.get('year');
	const numbers = teams.split(',').map(Number);
	if (
		!/^\d+(,\d+){5}$/.test(teams) ||
		new Set(numbers).size !== 6 ||
		numbers.some((n) => !Number.isInteger(n) || n <= 0 || n > 2147483647) ||
		year !== '2026'
	)
		return json({ error: 'Choose six distinct teams in 2026' }, { status: 400 });
	try {
		return json(
			await fetchPublic(
				fetch,
				`prediction?year=2026&teams=${encodeURIComponent(teams)}`,
				publicMatchSchema.pick({ prediction: true })
			),
			{ headers: { 'cache-control': 'public, max-age=60' } }
		);
	} catch {
		return json({ error: 'Prediction unavailable' }, { status: 503 });
	}
};
