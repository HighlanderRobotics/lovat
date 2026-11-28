<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Dialog as MagnoliaDialog } from '@highlanderrobotics/magnolia-svelte/v2';

	let {
		open = $bindable(false),
		title,
		dismissible = true,
		children,
		actions: footer,
	}: {
		open?: boolean;
		title?: string;
		dismissible?: boolean;
		children: Snippet;
		actions?: Snippet;
	} = $props();
</script>

<MagnoliaDialog bind:open title={title ?? ''} canClose={dismissible}>
	{@render children()}
	{#snippet actions()}
		{@render footer?.()}
	{/snippet}
</MagnoliaDialog>
