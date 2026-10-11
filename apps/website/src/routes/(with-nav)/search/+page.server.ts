import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import { z } from 'zod';
import type { PageServerLoad } from './$types';

const schema = z.object({
	year: z.number().int(),
	events: z.array(z.object({ key: z.string(), name: z.string(), location: z.string().nullable() })),
	teams: z.array(
		z.object({ teamNumber: z.number().int(), name: z.string(), city: z.string().nullable() })
	)
});

export const load: PageServerLoad = async ({ url, fetch }) => {
	const query = (url.searchParams.get('q') ?? '').trim();
	const year = Number(url.searchParams.get('year') ?? new Date().getFullYear());

	if (!Number.isInteger(year) || year < 1992 || year > 9999 || query.length > 80)
		error(400, 'Invalid search');
	if (!query) return { query, year, events: [], teams: [] };
	if (!env.LOVAT_API_BASE) error(503, 'Search unavailable');

	try {
		const response = await fetch(
			`${env.LOVAT_API_BASE}/v1/search?${new URLSearchParams({ q: query, year: String(year) })}`,
			{ signal: AbortSignal.timeout(15_000) }
		);

		if (!response.ok) error(503, 'Search unavailable');

		return { query, ...schema.parse(await response.json()) };
	} catch {
		error(503, 'Search unavailable');
	}
};
