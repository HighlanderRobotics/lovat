import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { districtSchema } from '$lib/server/district';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, fetch, setHeaders }) => {
	const key = `${params.year}${params.district}`;

	if (!/^[a-z][a-z0-9]{0,9}$/.test(params.district) || !/^\d{4}$/.test(params.year))
		error(404, 'District not found');

	if (!env.LOVAT_API_BASE) error(503, 'District data is not configured');

	let response: Response;

	try {
		response = await fetch(`${env.LOVAT_API_BASE}/v1/districts/${encodeURIComponent(key)}`, {
			signal: AbortSignal.timeout(10_000)
		});
	} catch {
		error(503, 'District data is temporarily unavailable');
	}

	if (response.status === 404) error(404, 'This district has not been imported yet');
	if (!response.ok) error(503, 'District data is temporarily unavailable');

	let payload: unknown;

	try {
		payload = await response.json();
	} catch {
		error(503, 'District data is temporarily unavailable');
	}

	const parsed = districtSchema.safeParse(payload);

	if (!parsed.success || parsed.data.key !== key)
		error(503, 'District data is temporarily unavailable');

	setHeaders({ 'cache-control': 'public, max-age=300' });

	return { district: parsed.data };
};
