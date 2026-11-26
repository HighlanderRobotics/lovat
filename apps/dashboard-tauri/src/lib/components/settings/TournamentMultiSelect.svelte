<script lang="ts">
	import { tournamentLabel, type Tournament } from '#lib/tournament.svelte.ts';

	let {
		tournaments,
		selected = $bindable(new Set<string>())
	}: { tournaments: Tournament[]; selected?: Set<string> } = $props();

	let filter = $state('');
	const shown = $derived(tournaments.filter((t) => tournamentLabel(t).toLowerCase().includes(filter.toLowerCase())));

	function toggle(key: string) {
		const next = new Set(selected);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		selected = next;
	}
</script>

<input class="input filled" placeholder="Search" bind:value={filter} aria-label="Search tournaments" />
<div class="list">
	{#if shown.length === 0}<p class="muted" style="padding: 16px 24px">No tournaments found</p>{/if}
	{#each shown as t (t.key)}
		<label class="list-item">
			<span class="grow body-large">{tournamentLabel(t)}</span>
			<input type="checkbox" checked={selected.has(t.key)} onchange={() => toggle(t.key)} />
		</label>
	{/each}
</div>

<style>
	.list {
		margin: 0 -24px;
	}
	input[type='checkbox'] {
		width: 20px;
		height: 20px;
		accent-color: var(--primary);
	}
</style>
