<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		open = $bindable(false),
		title,
		dismissible = true,
		children,
		actions
	}: {
		open?: boolean;
		title?: string;
		dismissible?: boolean;
		children: Snippet;
		actions?: Snippet;
	} = $props();

	let dialog: HTMLDialogElement | undefined = $state();

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});
</script>

<dialog
	bind:this={dialog}
	onclose={() => (open = false)}
	oncancel={(e) => {
		if (!dismissible) e.preventDefault();
	}}
	onclick={(e) => {
		if (dismissible && e.target === dialog) open = false;
	}}
>
	<div class="content">
		{#if title}<h2 class="headline-small">{title}</h2>{/if}
		{@render children()}
		{#if actions}<div class="actions">{@render actions()}</div>{/if}
	</div>
</dialog>

<style>
	dialog {
		border: none;
		border-radius: 28px;
		padding: 0;
		background: var(--surface-high);
		color: var(--on-surface);
		width: min(560px, calc(100vw - 48px));
		max-height: calc(100vh - 48px);
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	dialog::backdrop {
		background: rgba(0, 0, 0, 0.5);
	}
	.content {
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		flex-wrap: wrap;
	}
</style>
