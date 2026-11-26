<script lang="ts">
	import type { Snippet } from 'svelte';
	import { goBack, ui } from '#lib/ui.svelte.ts';
	import Icon from './Icon.svelte';
	import LinearProgress from './LinearProgress.svelte';

	let {
		title,
		back = false,
		backFallback = '/home',
		loading = false,
		actions,
		bottom
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
	<div class="bar">
		{#if back}
			<button class="icon-btn" aria-label="Back" onclick={() => goBack(backFallback)}><Icon name="arrow_back" /></button>
		{:else}
			<button class="icon-btn menu" aria-label="Open navigation" onclick={() => (ui.drawerOpen = true)}><Icon name="menu" /></button>
		{/if}
		<h1 class="title">{title}</h1>
		<div class="actions">{@render actions?.()}</div>
	</div>
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
	.bar {
		display: flex;
		align-items: center;
		gap: 4px;
		height: 64px;
		padding: 0 8px;
	}
	.title {
		flex: 1;
		min-width: 0;
		font-size: 22px;
		font-weight: 400;
		margin-left: 8px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	@media (min-width: 1100px) {
		.menu {
			visibility: hidden;
			width: 0;
		}
	}
</style>
