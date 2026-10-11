import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { z } from 'zod';
import type { PageServerLoad } from './$types';

const seasonSchema = z.object({
	year: z.number().int(),
	gameName: z.string().nullable(),
	districtSeasons: z.array(
		z.object({ key: z.string(), abbreviation: z.string(), name: z.string() })
	),
	tournaments: z.array(
		z.object({
			key: z.string(),
			parentTournamentKey: z.string().nullable(),
			name: z.string(),
			location: z.string().nullable(),
			startDate: z.iso.datetime().nullable(),
			endDate: z.iso.datetime().nullable(),
			week: z.number().int().nullable(),
			eventType: z.number().int().nullable()
		})
	)
});

export const load: PageServerLoad = async ({ params, fetch, setHeaders }) => {
	if (!/^\d{4}$/.test(params.year) || Number(params.year) < 1992) error(404, 'Season not found');

	if (!env.LOVAT_API_BASE) error(503, 'Season data is not configured');

	let response: Response;

	try {
		response = await fetch(`${env.LOVAT_API_BASE}/v1/seasons/${params.year}`, {
			signal: AbortSignal.timeout(10_000)
		});
	} catch {
		error(503, 'Season data is temporarily unavailable');
	}

	if (response.status === 404) error(404, 'This season has not been imported yet');
	if (!response.ok) error(503, 'Season data is temporarily unavailable');

	let payload: unknown;

	try {
		payload = await response.json();
	} catch {
		error(503, 'Season data is temporarily unavailable');
	}

	const parsed = seasonSchema.safeParse(payload);

	if (!parsed.success || parsed.data.year !== Number(params.year))
		error(503, 'Season data is temporarily unavailable');

	setHeaders({ 'cache-control': 'public, max-age=300' });

	return { season: parsed.data };
};
