<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { getCachedMutablePicklist, getFlags, getMutablePicklist, updateMutablePicklist, type MutablePicklist } from '#lib/api/endpoints.ts';
	import AppBar from '#lib/components/AppBar.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import ErrorView from '#lib/components/ErrorView.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import LinearProgress from '#lib/components/LinearProgress.svelte';
	import FlagRow from '#lib/components/picklist/FlagRow.svelte';
	import Spinner from '#lib/components/Spinner.svelte';
	import { getPicklistFlags } from '#lib/flags.ts';
	import { pickedTeams } from '#lib/pickedTeams.svelte.ts';
	import { toast } from '#lib/toast.svelte.ts';

	const id = page.url.searchParams.get('id') ?? '';
	const flags = getPicklistFlags();
	let picklist = $state<MutablePicklist | null>(getCachedMutablePicklist(id));
	let error = $state<string | null>(null);
	let saving = $state(false);
	let flagData = $state<Record<number, Record<string, unknown>>>({});
	let dragging = $state<number | null>(null);
	let marking = $state(false);
	let markValue = $state('');

	async function load() {
		error = null;
		try {
			picklist = await getMutablePicklist(id);
		} catch (e) {
			if (!picklist) error = e instanceof Error ? e.message : String(e);
		}
	}

	$effect(() => {
		untrack(load);
	});

	$effect(() => {
		const teams = picklist?.teams ?? [];
		untrack(() => {
			if (flags.length === 0) return;
			for (const team of teams) {
				if (flagData[team]) continue;
				getFlags(flags.map((f) => f.type), team)
					.then((values) => (flagData[team] = Object.fromEntries(flags.map((f, i) => [f.type, values[i]]))))
					.catch(() => {});
			}
		});
	});

	/** Optimistically reorder, then persist; revert if the server rejects it. */
	async function reorder(from: number, to: number) {
		if (!picklist || from === to || to < 0 || to >= picklist.teams.length) return;
		const previous = [...picklist.teams];
		const teams = [...previous];
		const [team] = teams.splice(from, 1);
		teams.splice(to, 0, team);
		picklist.teams = teams;
		saving = true;
		try {
			await updateMutablePicklist({ ...picklist, teams });
		} catch (e) {
			picklist.teams = previous;
			toast.error(`Error moving team: ${e instanceof Error ? e.message : e}`);
		} finally {
			saving = false;
		}
	}

	function mark() {
		const team = Number(markValue);
		pickedTeams.add(team);
		toast.show(`Marked ${team} as picked`);
		marking = false;
		markValue = '';
	}
</script>

<AppBar title={picklist?.name ?? 'Mutable picklist'} back backFallback="/picklists?tab=2" loading={saving}>
	{#snippet actions()}
		<button class="icon-btn" title="Mark a team as picked" aria-label="Mark a team as picked" onclick={() => (marking = true)}><Icon name="format_strikethrough" /></button>
		<a class="icon-btn" href="/picked_teams" title="View picked teams" aria-label="View picked teams"><Icon name="rule" /></a>
	{/snippet}
</AppBar>

{#if error}
	<ErrorView message={error} onRetry={load} />
{:else if !picklist}
	<div class="center" style="flex: 1"><Spinner /></div>
{:else}
	<LinearProgress active={false} />
	<ol class="list">
		{#each picklist.teams as team, i (team)}
			<li
				class="team"
				class:picked={pickedTeams.list.includes(team)}
				class:dragging={dragging === i}
				draggable={!saving}
				ondragstart={(e) => {
					dragging = i;
					e.dataTransfer?.setData('text/plain', String(i));
				}}
				ondragend={() => (dragging = null)}
				ondragover={(e) => e.preventDefault()}
				ondrop={(e) => {
					e.preventDefault();
					if (dragging !== null) void reorder(dragging, i);
					dragging = null;
				}}
			>
				<span class="handle" aria-hidden="true"><Icon name="drag_indicator" /></span>
				<span class="rank">{i + 1}</span>
				<a class="grow body-large number" href="/team_lookup?team={team}">{team}</a>
				{#if flags.length}<FlagRow {flags} data={flagData[team] ?? null} {team} />{/if}
				<button class="icon-btn" aria-label="Move {team} up" disabled={saving || i === 0} onclick={() => reorder(i, i - 1)}><Icon name="arrow_upward" /></button>
				<button class="icon-btn" aria-label="Move {team} down" disabled={saving || i === picklist.teams.length - 1} onclick={() => reorder(i, i + 1)}><Icon name="arrow_downward" /></button>
			</li>
		{/each}
	</ol>
{/if}

<Dialog bind:open={marking} title="Mark team as picked">
	<label class="field"><span>Team #</span><input class="input filled" inputmode="numeric" bind:value={markValue} oninput={() => (markValue = markValue.replace(/\D/g, ''))} /></label>
	{#snippet actions()}
		<button class="btn btn-tonal" onclick={() => (marking = false)}>Cancel</button>
		<button class="btn btn-filled" disabled={!/^\d+$/.test(markValue)} onclick={mark}>Mark</button>
	{/snippet}
</Dialog>

<style>
	.list {
		list-style: none;
		margin: 0 auto;
		padding: 0;
		max-width: 900px;
		width: 100%;
	}
	.team {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 56px;
		padding: 4px 8px;
		border-bottom: 1px solid var(--surface-high);
		background: var(--surface);
	}
	.team.dragging {
		opacity: 0.4;
	}
	.handle {
		cursor: grab;
		color: var(--on-surface-variant);
	}
	.rank {
		width: 28px;
		color: var(--on-surface-variant);
		font-variant-numeric: tabular-nums;
	}
	.number {
		color: var(--on-surface);
		text-decoration: none;
	}
	.picked .number {
		color: #f44336;
		text-decoration: line-through;
	}
</style>
