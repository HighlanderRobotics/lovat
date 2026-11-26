<script lang="ts">
	import { getPicklistCSV, type PicklistWeight } from '#lib/api/endpoints.ts';
	import { saveTextFile } from '#lib/download.ts';
	import { getPicklistFlags } from '#lib/flags.ts';
	import { toast } from '#lib/toast.svelte.ts';
	import { currentTournament } from '#lib/tournament.svelte.ts';
	import Dialog from '../Dialog.svelte';
	import Spinner from '../Spinner.svelte';

	let {
		open = $bindable(false),
		title,
		weights
	}: { open?: boolean; title: string; weights: () => Promise<PicklistWeight[]> | PicklistWeight[] } = $props();

	let error = $state<string | null>(null);

	async function run() {
		error = null;
		try {
			if (!currentTournament.value) {
				error = 'No tournament selected';
				return;
			}
			const csv = await getPicklistCSV(getPicklistFlags().map((f) => f.type), await weights());
			if (await saveTextFile(`${title}.csv`, csv)) toast.show(`Exported ${title}.csv`);
			open = false;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to export data';
		}
	}

	$effect(() => {
		if (open) void run();
	});
</script>

<Dialog bind:open title={error ? 'Export failed' : 'Exporting data...'}>
	{#if error}
		<p style="margin: 0">{error}</p>
	{:else}
		<div class="center"><Spinner /></div>
	{/if}
	{#snippet actions()}
		{#if error}
			<button class="btn btn-text" onclick={() => (open = false)}>Close</button>
			<button class="btn btn-filled" onclick={run}>Retry</button>
		{/if}
	{/snippet}
</Dialog>
