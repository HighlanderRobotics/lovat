<script lang="ts">
	import Dialog from '../Dialog.svelte';

	/** Shared add/rename dialog: `submit` throws to show an error. */
	let {
		open = $bindable(false),
		title,
		action,
		initial = '',
		submit
	}: { open?: boolean; title: string; action: string; initial?: string; submit: (name: string) => Promise<void> } = $props();

	let name = $state('');
	let submitting = $state(false);
	let error = $state<string | null>(null);

	$effect(() => {
		if (open) {
			name = initial;
			error = null;
			submitting = false;
		}
	});

	async function run(e: SubmitEvent) {
		e.preventDefault();
		submitting = true;
		error = null;
		try {
			await submit(name);
			open = false;
		} catch (err) {
			error = err instanceof Error ? err.message : `Failed to ${action.toLowerCase()} scouter`;
		} finally {
			submitting = false;
		}
	}
</script>

<Dialog bind:open {title} dismissible={!submitting}>
	<form id="name-form" onsubmit={run}>
		<label class="field">
			<span>Name</span>
			<!-- svelte-ignore a11y_autofocus -->
			<input class="input filled" bind:value={name} autocapitalize="words" autofocus />
			{#if error}<span class="error-text">{error}</span>{/if}
		</label>
	</form>
	{#snippet actions()}
		<button class="btn btn-text" type="button" disabled={submitting} onclick={() => (open = false)}>Cancel</button>
		<button class="btn btn-filled" type="submit" form="name-form" disabled={submitting || !name}>{submitting ? '…' : action}</button>
	{/snippet}
</Dialog>
