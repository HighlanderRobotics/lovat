<script lang="ts">
	import { untrack } from 'svelte';
	import { getTournaments } from '#lib/api/endpoints.ts';
	import { toast } from '#lib/toast.svelte.ts';
	import { currentTournament, tournamentLabel, type Tournament } from '#lib/tournament.svelte.ts';
	import Dialog from '../Dialog.svelte';
	import Icon from '../Icon.svelte';

	/** Searchable selector for the current tournament (TournamentKeyPicker). */
	let { label = 'At tournament', onchange }: { label?: string; onchange?: (t: Tournament | null) => void } = $props();

	let tournaments = $state<Tournament[] | null>(null);
	let failed = $state(false);
	let open = $state(false);
	let filter = $state('');
	let manual = $state(false);
	let manualName = $state('');
	let manualKey = $state('');

	$effect(() => {
		untrack(async () => {
			try {
				tournaments = (await getTournaments()).tournaments;
			} catch (e) {
				failed = true;
				toast.error(`Error getting tournaments: ${e instanceof Error ? e.message : e}`);
			}
		});
	});

	const shown = $derived((tournaments ?? []).filter((t) => tournamentLabel(t).toLowerCase().includes(filter.toLowerCase())));
	const keyValid = $derived(/^\d+.+$/.test(manualKey));

	function choose(t: Tournament | null) {
		currentTournament.set(t);
		onchange?.(t);
		open = false;
		manual = false;
	}
</script>

<div class="picker">
	<span class="label">{label}</span>
	{#if !tournaments && !failed}
		<div class="skeleton" style="height: 56px; border-radius: 4px 4px 0 0"></div>
	{:else}
		<div class="row">
			<button class="input filled value" onclick={() => (open = true)} disabled={!tournaments}>
				{currentTournament.value?.name ?? 'None'}
			</button>
			{#if currentTournament.value}
				<button class="icon-btn" aria-label="Clear tournament" onclick={() => choose(null)}><Icon name="close" /></button>
			{/if}
		</div>
		{#if failed}<button class="btn btn-filled" onclick={() => (manual = true)}>Enter manually</button>{/if}
	{/if}
</div>

<Dialog bind:open title="Select tournament">
	<!-- svelte-ignore a11y_autofocus -->
	<input class="input" placeholder="Search" bind:value={filter} autofocus aria-label="Search tournaments" />
	<div class="options">
		{#each shown as t (t.key)}
			<button class="list-item" class:current={currentTournament.value?.key === t.key} onclick={() => choose(t)}>
				<span class="grow">{tournamentLabel(t)}{#if t.location}<br /><span class="subtitle">{t.location}</span>{/if}</span>
				{#if currentTournament.value?.key === t.key}<Icon name="check" />{/if}
			</button>
		{/each}
	</div>
</Dialog>

<Dialog bind:open={manual} title="Enter tournament">
	<label class="field"><span>Name</span><input class="input filled" bind:value={manualName} /><span class="helper-text">Only used visually</span></label>
	<label class="field">
		<span>Key</span><input class="input filled" bind:value={manualKey} />
		{#if manualKey && !keyValid}<span class="error-text">Must include the year, i.e. 2023cafr</span>{/if}
	</label>
	<button class="btn btn-tonal" onclick={() => choose(null)}>I'm not at a tournament</button>
	{#snippet actions()}
		<button class="btn btn-tonal" onclick={() => (manual = false)}>Cancel</button>
		<button class="btn btn-filled" disabled={!keyValid || !manualName} onclick={() => choose({ key: manualKey, name: manualName })}>Save</button>
	{/snippet}
</Dialog>

<style>
	.picker {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.label {
		font-size: 12px;
		color: var(--on-surface-variant);
	}
	.value {
		text-align: left;
		cursor: pointer;
		flex: 1;
	}
	.options {
		max-height: 60vh;
		overflow-y: auto;
		margin: 0 -24px;
	}
	.current {
		color: var(--primary);
	}
</style>
