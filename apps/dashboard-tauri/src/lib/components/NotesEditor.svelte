<script lang="ts">
	import { updateNote } from '#lib/api/endpoints.ts';
	import Dialog from './Dialog.svelte';

	let {
		open = $bindable(false),
		uuid,
		initialNotes = '',
		onSubmitted
	}: { open?: boolean; uuid: string; initialNotes?: string | null; onSubmitted?: () => void } = $props();

	let notes = $state('');
	let saving = $state(false);
	let error = $state<string | null>(null);

	$effect(() => {
		if (open) {
			notes = initialNotes ?? '';
			error = null;
		}
	});

	async function submit() {
		saving = true;
		error = null;
		try {
			await updateNote(uuid, notes);
			open = false;
			onSubmitted?.();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to update notes';
		} finally {
			saving = false;
		}
	}
</script>

<Dialog bind:open title="Edit Notes" dismissible={!saving}>
	<!-- svelte-ignore a11y_autofocus -->
	<textarea class="input" rows="10" bind:value={notes} autofocus aria-label="Notes"></textarea>
	{#if error}<p class="error">{error}</p>{/if}
	{#snippet actions()}
		<button class="btn btn-text" onclick={() => (open = false)} disabled={saving}>Cancel</button>
		<button class="btn btn-filled" onclick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
	{/snippet}
</Dialog>

<style>
	textarea {
		resize: vertical;
	}
	.error {
		color: var(--error);
		margin: 0;
	}
</style>
