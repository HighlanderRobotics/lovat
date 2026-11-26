<script lang="ts">
	import { untrack } from 'svelte';
	import { getTeams } from '#lib/api/endpoints.ts';
	import type { Team } from '#lib/models/types.ts';

	/** Search and check teams; `submit` throws to show an error. */
	let {
		initial = [],
		submitText = 'Next',
		submit
	}: { initial?: number[]; submitText?: string; submit: (teams: Team[]) => Promise<void> } = $props();

	let teams = $state<Team[] | null>(null);
	let selected = $state(new Set<number>());
	let filter = $state('');
	let error = $state<string | null>(null);
	let loading = $state(false);

	$effect(() => {
		untrack(async () => {
			try {
				teams = (await getTeams()).teams;
				selected = new Set(initial.filter((n) => teams!.some((t) => t.number === n)));
			} catch {
				error = 'Error fetching teams';
			}
		});
	});

	const shown = $derived(
		(teams ?? []).filter((t) => t.name.toLowerCase().includes(filter.toLowerCase()) || String(t.number).includes(filter))
	);

	function toggle(n: number) {
		const next = new Set(selected);
		if (next.has(n)) next.delete(n);
		else next.add(n);
		selected = next;
	}

	async function run() {
		loading = true;
		error = null;
		try {
			await submit((teams ?? []).filter((t) => selected.has(t.number)));
		} catch {
			error = 'Error setting source teams';
		} finally {
			loading = false;
		}
	}
</script>

<div class="multi">
	<h2 class="headline-small">Choose teams</h2>
	<!-- svelte-ignore a11y_autofocus -->
	<input class="input filled" placeholder="Search" bind:value={filter} autofocus aria-label="Search teams" />
	<div class="list">
		{#if !teams}
			{#each [0, 1, 2, 3, 4] as i (i)}<div class="skeleton" style="height: 56px; margin-bottom: 4px"></div>{/each}
		{:else}
			{#each shown as team (team.number)}
				<label class="list-item">
					<span class="grow"><span class="body-large">{team.name}</span><br /><span class="subtitle">{team.number}</span></span>
					<input type="checkbox" checked={selected.has(team.number)} onchange={() => toggle(team.number)} />
				</label>
			{/each}
		{/if}
	</div>
	{#if error}<p class="error">{error}</p>{/if}
	<button class="btn btn-filled" disabled={selected.size === 0 || loading} onclick={run}>{loading ? '…' : submitText}</button>
</div>

<style>
	.multi {
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-height: 0;
		flex: 1;
	}
	.list {
		flex: 1;
		overflow-y: auto;
		max-height: 60vh;
		margin: 0 -24px;
	}
	input[type='checkbox'] {
		width: 20px;
		height: 20px;
		accent-color: var(--primary);
	}
	.error {
		color: var(--error);
		margin: 0;
	}
</style>
