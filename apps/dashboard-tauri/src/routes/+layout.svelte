<script lang="ts">
	import '../app.css';
	import { MagnoliaUIRoot } from '@highlanderrobotics/magnolia-svelte/v2';
	import '@fontsource/roboto/400.css';
	import '@fontsource/roboto/500.css';
	import '@fontsource/heebo/400.css';
	import '@fontsource/heebo/500.css';
	import DesignApp from '#lib/design/DesignApp.svelte';
	import '#lib/magnolia.css';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { lockMobileZoom } from '#lib/mobileZoom.ts';
	import { initializeApi } from '#lib/api/client.ts';
	import NavDrawer from '#lib/components/NavDrawer.svelte';
	import ToastHost from '#lib/components/ToastHost.svelte';
	import { sanitizeStoredFlags } from '#lib/flags.ts';
	import { ensureDefaultPicklists } from '#lib/picklists.ts';

	let { children } = $props();
	onMount(()=>lockMobileZoom(document));

	// Runs once before any page loads data, like the Flutter InitialLoaderPage.
	if (import.meta.env.VITE_DASHBOARD_MOCK !== 'true') {
		initializeApi();
		ensureDefaultPicklists();
		sanitizeStoredFlags();
	}

	const bare = $derived(
		['/', '/onboarding', '/set-url'].includes(page.url.pathname),
	);
	const designMode = $derived(
		import.meta.env.VITE_DASHBOARD_MOCK === 'true' ||
			page.url.pathname.startsWith('/design') ||
			page.url.pathname.startsWith('/forms'),
	);
</script>

<MagnoliaUIRoot theme="dark">
	{#if designMode}
		<DesignApp />
	{:else}
		{#if bare}
			{@render children()}
		{:else}
			<NavDrawer />
			<main class="shell">{@render children()}</main>
		{/if}
		<ToastHost />
	{/if}
</MagnoliaUIRoot>

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
