<script lang="ts">
	import type { AutoPath } from '#lib/models/autoPath.ts';
	import { numToStringRounded } from '#lib/metrics.ts';
	import AutoPathPlayer from './AutoPathPlayer.svelte';

	let {
		autoPaths,
		selected = $bindable(null),
		onchange
	}: { autoPaths: AutoPath[]; selected?: AutoPath | null; onchange?: (path: AutoPath | null) => void } = $props();

	let selectedIndex = $state(-1);

	$effect(() => {
		selectedIndex = selected ? autoPaths.indexOf(selected) : -1;
	});

	function choose(e: Event) {
		const index = Number((e.target as HTMLSelectElement).value);
		selected = index < 0 ? null : autoPaths[index];
		onchange?.(selected);
	}
</script>

<div class="stack">
	<label class="field">
		<span>Path</span>
		<select class="input filled" value={selectedIndex} onchange={choose}>
			<option value={-1}>None</option>
			{#each autoPaths as path, i (i)}
				<option value={i}>{path.shortDescription} — Score: {numToStringRounded(path.averageScore)}</option>
			{/each}
		</select>
	</label>
	{#if selected}
		<AutoPathPlayer paths={[{ path: selected }]} />
		<div class="boxes">
			<div class="box colored"><strong>{numToStringRounded(selected.averageScore)}</strong><span>Avg score</span></div>
			<div class="box emphasis">
				<strong>{selected.frequency}</strong><span>{selected.frequency === 1 ? 'Time used' : 'Times used'}</span>
			</div>
		</div>
		<div class="card stack">
			<div class="title-medium">Used in matches</div>
			{#each selected.matches as match, i (i)}
				<div class="row">
					<span class="grow">{match.getLocalizedDescription({ abbreviateName: true })}</span>
					<span class="score">Score: {numToStringRounded(selected.scores[i])}</span>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.boxes {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.box {
		border-radius: 6px;
		padding: 10px;
		display: flex;
		flex-direction: column;
		align-items: center;
	}
	.box strong {
		font-size: 22px;
		font-weight: 400;
	}
	.box span {
		font-size: 12px;
		font-weight: 500;
	}
	.colored {
		background: var(--primary-container);
		color: var(--on-primary-container);
	}
	.emphasis {
		background: var(--primary);
		color: var(--on-primary);
	}
	.score {
		background: var(--surface);
		border-radius: 7px;
		padding: 4px 7px;
	}
</style>
