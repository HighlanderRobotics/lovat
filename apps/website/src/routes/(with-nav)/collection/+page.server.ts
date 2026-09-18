import { learnUrl } from '$lib/siteUrls';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	throw redirect(301, `${learnUrl()}/guides/scouting-a-match`);
};
