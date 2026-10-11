import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { z } from 'zod';
import type { PageServerLoad } from './$types';

const teamSchema = z.object({
	teamNumber: z.number().int(),
	seasonYear: z.number().int(),
	name: z.string(),
	city: z.string().nullable(),
	stateProvince: z.string().nullable(),
	country: z.string().nullable(),
	avatar: z
		.string()
		.regex(/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/)
		.nullable(),
	district: z.object({ key: z.string(), abbreviation: z.string(), name: z.string() }).nullable(),
	seasonYears: z.array(z.number().int()),
	tournaments: z.array(
		z.object({
			key: z.string(),
			name: z.string(),
			location: z.string().nullable(),
			week: z.number().int().nullable(),
			startDate: z.iso.datetime().nullable(),
			endDate: z.iso.datetime().nullable(),
			awards: z.array(z.string()),
			district: z.object({ abbreviation: z.string() }).nullable()
		})
	)
});

export const load: PageServerLoad = async ({ params, fetch, setHeaders }) => {
	if (
		!/^[1-9]\d{0,9}$/.test(params.number) ||
		Number(params.number) > 2_147_483_647 ||
		!/^\d{4}$/.test(params.year) ||
		Number(params.year) < 1992
	)
		error(404, 'Team not found');

	if (!env.LOVAT_API_BASE) error(503, 'Team data is not configured');

	let response: Response;

	try {
		response = await fetch(
			`${env.LOVAT_API_BASE}/v1/teams/${params.number}/seasons/${params.year}`,
			{
				signal: AbortSignal.timeout(10_000)
			}
		);
	} catch {
		error(503, 'Team data is temporarily unavailable');
	}

	if (response.status === 404) error(404, 'This team season has not been imported yet');
	if (!response.ok) error(503, 'Team data is temporarily unavailable');

	let payload: unknown;

	try {
		payload = await response.json();
	} catch {
		error(503, 'Team data is temporarily unavailable');
	}

	const parsed = teamSchema.safeParse(payload);

	if (
		!parsed.success ||
		parsed.data.seasonYear !== Number(params.year) ||
		parsed.data.teamNumber !== Number(params.number)
	)
		error(503, 'Team data is temporarily unavailable');

	setHeaders({ 'cache-control': 'public, max-age=300' });

	return { team: parsed.data };
};
