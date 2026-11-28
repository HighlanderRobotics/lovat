<script lang="ts">
	import type { AllianceAnalysis } from '#lib/api/endpoints.ts';
	import type { AutoPath } from '#lib/models/autoPath.ts';
	import { numToStringRounded } from '#lib/metrics.ts';
	import AutoPathPlayer from './AutoPathPlayer.svelte';
	import Dialog from './Dialog.svelte';
	import TeamAutoPaths from './TeamAutoPaths.svelte';

	const colors = ['#4255F9', '#0D984D', '#F95842'];

	let { data }: { data: AllianceAnalysis } = $props();
	let selected = $state<(AutoPath | null)[]>([null, null, null]);
	let picking = $state<number | null>(null);
	let draft = $state<AutoPath | null>(null);

	const shown = $derived(
		selected.flatMap((path, i) => (path ? [{ path, color: colors[i] }] : []))
	);
	const total = $derived(shown.length ? shown.reduce((sum, p) => sum + p.path.averageScore, 0) : null);

	function open(index: number) {
		draft = selected[index];
		picking = index;
	}
</script>

<div class="paths">
	<div class="inner">
		<div class="teams">
			{#each data.teams as team, i (team.team)}
				<button class="team" onclick={() => open(i)}>
					<span class="row" style="gap: 5px">
						<span class="dot" style:background={colors[i]}></span>
						<span class="label-medium">{team.team}</span>
					</span>
					<span class="label-medium">Score</span>
					<span class="body-large">{selected[i] ? numToStringRounded(selected[i]!.averageScore) : '--'}</span>
				</button>
			{/each}
		</div>
		<div class="field-wrap" class:empty={shown.length === 0}>
			<AutoPathPlayer paths={shown} />
			{#if shown.length === 0}<span class="hint label-large">Tap a team to select a path</span>{/if}
		</div>
	</div>
	<div class="total">
		<span class="label-large">Total auto score</span>
		<span>{total === null ? '--' : numToStringRounded(total)}</span>
	</div>
</div>

{#if picking !== null}
	{@const team = data.teams[picking]}
	<Dialog open={true} title="{team.team}'s Auto Paths" dismissible>
		{#if team.paths.length === 0}
			<p>No auto paths recorded.</p>
		{:else}
			<TeamAutoPaths autoPaths={team.paths} bind:selected={draft} />
		{/if}
		{#snippet actions()}
			<button class="btn btn-text" onclick={() => (picking = null)}>Cancel</button>
			<button
				class="btn btn-filled"
				onclick={() => {
					selected[picking!] = draft;
					picking = null;
				}}>Use this path</button
			>
		{/snippet}
	</Dialog>
{/if}

<style>
	.paths {
		border-radius: 10px;
		overflow: hidden;
		background: var(--surface-high);
	}
	.inner {
		padding: 10px 10px 3px;
	}
	.teams {
		display: flex;
		justify-content: space-between;
		margin-bottom: 10px;
	}
	.team {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		border: none;
		background: none;
		color: var(--on-surface-variant);
		cursor: pointer;
		padding: 4px 8px;
		border-radius: 8px;
	}
	.team:hover {
		background: rgba(255, 255, 255, 0.05);
	}
	.dot {
		width: 20px;
		height: 20px;
		border-radius: 10px;
	}
	.field-wrap {
		position: relative;
	}
	.field-wrap.empty :global(.field) {
		opacity: 0.3;
	}
	.field-wrap :global(.player) {
		padding: 0;
	}
	.hint {
		position: absolute;
		top: 45%;
		left: 0;
		right: 0;
		text-align: center;
		color: var(--on-surface-variant);
	}
	.total {
		display: flex;
		justify-content: space-between;
		padding: 15px;
		background: var(--primary-container);
		color: var(--on-primary-container);
	}
</style>
