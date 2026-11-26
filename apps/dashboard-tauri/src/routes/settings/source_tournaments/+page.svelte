<script lang="ts">
	import { untrack } from 'svelte';
	import { getSourceTournamentKeys, getTournaments, setSourceTournamentKeys } from '#lib/api/endpoints.ts';
	import AppBar from '#lib/components/AppBar.svelte';
	import ErrorView from '#lib/components/ErrorView.svelte';
	import TournamentMultiSelect from '#lib/components/settings/TournamentMultiSelect.svelte';
	import { clearAnalysisCaches } from '#lib/sourceSettings.ts';
	import type { Tournament } from '#lib/tournament.svelte.ts';
	import { goBack } from '#lib/ui.svelte.ts';

	let tournaments = $state<Tournament[] | null>(null);
	let selected = $state(new Set<string>());
	let error = $state<string | null>(null);
	let saving = $state(false);

	async function load() {
		error = null;
		try {
			const [{ tournaments: all }, keys] = await Promise.all([getTournaments(), getSourceTournamentKeys()]);
			tournaments = all;
			selected = new Set(keys);
		} catch {
			error = 'Failed to load tournaments';
		}
	}

	$effect(() => {
		untrack(load);
	});

	const allSelected = $derived(!!tournaments && selected.size === tournaments.length);

	async function save() {
		saving = true;
		try {
			await setSourceTournamentKeys([...selected]);
			clearAnalysisCaches();
			goBack('/settings');
		} catch {
			error = 'Failed to save source tournament settings';
		} finally {
			saving = false;
		}
	}
</script>

<AppBar title="Select tournaments" back backFallback="/settings" loading={saving} />

{#if error && !tournaments}
	<ErrorView message={error} onRetry={load} />
{:else if !tournaments}
	<div class="page-body stack">{#each [0, 1, 2, 3, 4] as i (i)}<div class="skeleton" style="height: 56px"></div>{/each}</div>
{:else}
	<div class="page-body stack" style="padding-bottom: 96px">
		<TournamentMultiSelect {tournaments} bind:selected />
	</div>
	<div class="bar">
		{#if error}<span class="error-text">{error}</span>{/if}
		<button class="btn btn-tonal" disabled={saving} onclick={() => (selected = allSelected ? new Set() : new Set(tournaments!.map((t) => t.key)))}>
			{allSelected ? 'Deselect all' : 'Select all'}
		</button>
		<button class="btn btn-filled" disabled={saving} onclick={save}>Save</button>
	</div>
{/if}

<style>
	.bar {
		position: sticky;
		bottom: 0;
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 10px;
		padding: 16px 16px calc(16px + var(--safe-bottom));
		background: linear-gradient(transparent, var(--surface) 30%);
	}
	.error-text {
		color: var(--error);
	}
</style>
