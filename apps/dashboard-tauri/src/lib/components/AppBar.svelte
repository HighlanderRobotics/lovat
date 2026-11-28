<script lang="ts">
	import type { Snippet } from 'svelte';
	import { TopBar } from '@highlanderrobotics/magnolia-svelte/v2';
	import { goBack, ui } from '#lib/ui.svelte.ts';
	import LinearProgress from './LinearProgress.svelte';

	let {
		title,
		back = false,
		backFallback = '/home',
		loading = false,
		actions,
		bottom,
	}: {
		title: string;
		/** Show a back arrow instead of the navigation menu button. */
		back?: boolean;
		backFallback?: string;
		loading?: boolean;
		actions?: Snippet;
		bottom?: Snippet;
	} = $props();

	$effect(() => {
		document.title = `${title} · Lovat Dashboard`;
	});
</script>

<header class="app-bar">
	<TopBar
		{title}
		onback={back ? () => goBack(backFallback) : () => (ui.drawerOpen = true)}
		backLabel={back ? 'Back' : 'Open navigation'}
	>
		{#snippet action()}<div class="actions">
				{@render actions?.()}
			</div>{/snippet}
	</TopBar>
	{@render bottom?.()}
	<LinearProgress active={loading} />
</header>

<style>
	.app-bar {
		position: sticky;
		top: 0;
		z-index: 10;
		background: var(--surface);
		padding-top: var(--safe-top);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 4px;
	}
</style>
