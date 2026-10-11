import { env } from '$env/dynamic/private';
import { error } from '@sveltejs/kit';
import { z } from 'zod';

const schema = z.object({
	year: z.number().int(),
	events: z.array(z.object({ key: z.string(), name: z.string(), location: z.string().nullable() })),
	teams: z.array(
		z.object({ teamNumber: z.number().int(), name: z.string(), city: z.string().nullable() })
	)
});

export async function search(query: string, year: number, fetcher: typeof fetch) {
	if (!env.LOVAT_API_BASE) error(503, 'Search unavailable');

	try {
		const response = await fetcher(
			`${env.LOVAT_API_BASE}/v1/search?${new URLSearchParams({ q: query, year: String(year) })}`,
			{ signal: AbortSignal.timeout(15_000) }
		);

		if (!response.ok) error(503, 'Search unavailable');

		return schema.parse(await response.json());
	} catch {
		error(503, 'Search unavailable');
	}
}
