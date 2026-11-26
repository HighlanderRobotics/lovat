<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import { initializeApi } from '#lib/api/client.ts';
	import NavDrawer from '#lib/components/NavDrawer.svelte';
	import ToastHost from '#lib/components/ToastHost.svelte';
	import { sanitizeStoredFlags } from '#lib/flags.ts';
	import { ensureDefaultPicklists } from '#lib/picklists.ts';

	let { children } = $props();

	// Runs once before any page loads data, like the Flutter InitialLoaderPage.
	initializeApi();
	ensureDefaultPicklists();
	sanitizeStoredFlags();

	const bare = $derived(['/', '/onboarding', '/set-url'].includes(page.url.pathname));
</script>

{#if bare}
	{@render children()}
{:else}
	<NavDrawer />
	<main class="shell">{@render children()}</main>
{/if}
<ToastHost />

<style>
	.shell {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}
	@media (min-width: 1100px) {
		.shell {
			margin-left: var(--drawer-width);
		}
	}
</style>
