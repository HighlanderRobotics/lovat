import { error, redirect } from '@sveltejs/kit';
import { search } from '$lib/server/search';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, fetch }) => {
	const query = (url.searchParams.get('q') ?? '').trim();
	const year = Number(url.searchParams.get('year') ?? new Date().getFullYear());

	if (!Number.isInteger(year) || year < 1992 || year > 9999 || query.length > 80)
		error(400, 'Invalid search');
	if (!query) return { query, year, events: [], teams: [] };
	if (/^\d+$/.test(query) && Number(query) > 0) redirect(303, `/teams/${Number(query)}/${year}`);

	return { query, ...(await search(query, year, fetch)) };
};
