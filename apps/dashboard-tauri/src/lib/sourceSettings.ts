import { lovatAPI } from '#lib/api/client.ts';
import { queryCache } from '#lib/api/query.svelte.ts';

/** Source settings change every analysis result, so drop all cached data. */
export function clearAnalysisCaches() {
	queryCache.clearAll();
	lovatAPI.cache.clear();
}
