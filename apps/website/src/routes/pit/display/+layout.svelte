<script lang="ts">
	import { browser } from '$app/environment';
	import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
	import { MagnoliaUIRoot } from '@highlanderrobotics/magnolia-svelte';

	const queryClient = new QueryClient({
		defaultOptions: {
			queries: {
				enabled: browser
			}
		}
	});
</script>

<QueryClientProvider client={queryClient}>
	<MagnoliaUIRoot theme="dark">
		<main><slot /></main>
	</MagnoliaUIRoot>
</QueryClientProvider>
