import { error, json } from '@sveltejs/kit';
import { search } from '$lib/server/search';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, fetch }) => {
	const query = (url.searchParams.get('q') ?? '').trim();
	const year = Number(url.searchParams.get('year'));

	if (!query || query.length > 80 || !Number.isInteger(year) || year < 1992 || year > 9999)
		error(400, 'Invalid search');

	return json(await search(query, year, fetch), {
		headers: { 'Cache-Control': 'public, max-age=60' }
	});
};
