import node from '@sveltejs/adapter-node';
import netlify from '@sveltejs/adapter-netlify';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// Keep Netlify deploys working until the production DNS cutover.
		adapter: process.env.NETLIFY === 'true' ? netlify({ split: false, edge: false }) : node(),
		csrf: {
			// Custom logic that checks the origin is implemented in src/hooks.server.ts
			checkOrigin: false
		}
	}
};

export default config;
