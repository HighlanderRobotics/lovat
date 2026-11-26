<script lang="ts">
	import {
		createScoutScheduleShift,
		deleteScoutScheduleShift,
		getCachedScouts,
		getScouts,
		scouterScheduleQuery,
		updateScoutScheduleShift,
		type ScoutingShift
	} from '#lib/api/endpoints.ts';
	import { useQuery } from '#lib/api/query.svelte.ts';
	import AppBar from '#lib/components/AppBar.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import ErrorView from '#lib/components/ErrorView.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import ScoutPicker from '#lib/components/scouters/ScoutPicker.svelte';
	import type { Scout } from '#lib/models/types.ts';
	import { toast } from '#lib/toast.svelte.ts';
	import { currentTournament } from '#lib/tournament.svelte.ts';

	const robots = ['Red 1', 'Red 2', 'Red 3', 'Blue 1', 'Blue 2', 'Blue 3'];
	const tournament = currentTournament.value;
	const query = useQuery(() => (tournament ? scouterScheduleQuery(tournament.key) : null));

	let editing = $state<ScoutingShift | null>(null);
	let startField = $state('');
	let endField = $state('');
	let allScouts = $state<Scout[] | null>(getCachedScouts());
	let scoutsError = $state<string | null>(null);
	let saving = $state(false);

	async function loadScouts() {
		try {
			allScouts = await getScouts();
			scoutsError = null;
		} catch {
			if (!allScouts) scoutsError = 'Failed to load scouts';
		}
	}

	function open(shift?: ScoutingShift) {
		editing = shift
			? { ...shift, teams: shift.teams.map((t) => [...t]) as ScoutingShift['teams'] }
			: { start: 1, end: 1, teams: [[], [], [], [], [], []] };
		startField = String(editing.start);
		endField = String(editing.end);
		void loadScouts();
	}

	const valid = $derived(/^\d+$/.test(startField) && /^\d+$/.test(endField));

	async function save() {
		if (!editing || !valid) return;
		const shift = { ...$state.snapshot(editing), start: Number(startField), end: Number(endField) } as ScoutingShift;
		saving = true;
		try {
			await (shift.id ? updateScoutScheduleShift(shift) : createScoutScheduleShift(shift));
			editing = null;
			query.refetch();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : `Failed to ${shift.id ? 'update' : 'create'} shift`);
		} finally {
			saving = false;
		}
	}

	async function remove(shift: ScoutingShift) {
		if (!shift.id || !confirm(`Delete the shift for matches ${shift.start} to ${shift.end}?`)) return;
		try {
			await deleteScoutScheduleShift(shift.id);
			query.refetch();
		} catch {
			toast.error('Failed to delete shift');
		}
	}

	const names = (shift: ScoutingShift) => shift.teams.flat().map((s) => s.name).join(', ');
</script>

<AppBar title="Edit Scout Schedule" back backFallback="/match_schedule" loading={query.isFetching && query.hasData} />

{#if !tournament}
	<div class="center" style="flex: 1">No tournament selected</div>
{:else if query.error && !query.hasData}
	<ErrorView message={query.error} onRetry={query.refetch} retryLabel="Reload" />
{:else if !query.data}
	<div class="page-body stack">{#each [0, 1, 2, 3] as i (i)}<div class="skeleton" style="height: 56px"></div>{/each}</div>
{:else}
	<ul class="list">
		{#each query.data.shifts as shift (shift.id)}
			<li class="row-item">
				<button class="list-item" onclick={() => open(shift)}>
					<span class="grow"><span class="body-large">{shift.start} to {shift.end}</span><br /><span class="subtitle">{names(shift)}</span></span>
				</button>
				<button class="icon-btn" aria-label="Delete shift {shift.start} to {shift.end}" onclick={() => remove(shift)}><Icon name="delete" /></button>
			</li>
		{/each}
	</ul>
	<button class="fab" aria-label="Add shift" title="Add shift" onclick={() => open()}><Icon name="add" /></button>
{/if}

{#if editing}
	<Dialog open={true} title="Shift" dismissible={!saving}>
		{#if scoutsError && !allScouts}
			<ErrorView message={scoutsError} onRetry={loadScouts} />
		{:else if !allScouts}
			<p>Loading scouters…</p>
		{:else}
			<div class="stack" style="gap: 14px">
				<label class="field">
					<span>Start match number</span>
					<input class="input filled" inputmode="numeric" bind:value={startField} />
					{#if !/^\d+$/.test(startField)}<span class="error-text">Invalid</span>{/if}
				</label>
				<label class="field">
					<span>End match number</span>
					<input class="input filled" inputmode="numeric" bind:value={endField} />
					{#if !/^\d+$/.test(endField)}<span class="error-text">Invalid</span>{/if}
				</label>
				{#each robots as robot, i (robot)}
					<ScoutPicker label={robot} bind:scouts={editing.teams[i]} {allScouts} onScouterAdded={loadScouts} />
				{/each}
			</div>
		{/if}
		{#snippet actions()}
			<button class="btn btn-text" disabled={saving} onclick={() => (editing = null)}>Cancel</button>
			<button class="btn btn-filled" disabled={saving || !valid || !allScouts} onclick={save}>{saving ? 'Saving…' : 'Save'}</button>
		{/snippet}
	</Dialog>
{/if}

<style>
	.list {
		list-style: none;
		margin: 0 auto;
		padding: 0;
		max-width: 900px;
		width: 100%;
	}
	.row-item {
		display: flex;
		align-items: center;
		padding-right: 8px;
		border-bottom: 1px solid var(--surface-high);
	}
	.fab {
		position: fixed;
		right: 16px;
		bottom: calc(16px + var(--safe-bottom));
		width: 56px;
		height: 56px;
		border-radius: 16px;
		border: none;
		background: var(--primary-container);
		color: var(--on-primary-container);
		box-shadow: 0 3px 8px rgba(0, 0, 0, 0.4);
		cursor: pointer;
	}
</style>
