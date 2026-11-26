<script lang="ts">
	import { page } from '$app/state';
	import AppBar from '#lib/components/AppBar.svelte';
	import ErrorView from '#lib/components/ErrorView.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { picklistWeightNames } from '#lib/metrics.ts';
	import { breakdownHandoff } from '#lib/picklistHandoff.ts';

	const team = Number(page.url.searchParams.get('team'));
	const data = breakdownHandoff.get(team);
	let weighted = $state(true);
	let sameHeights = $state(false);

	const list = $derived(
		(weighted ? (data?.weighted ?? []) : (data?.unweighted ?? []))
			.filter((e) => e.result !== 0)
			.sort((a, b) => b.result - a.result)
	);
	const total = $derived(list.reduce((sum, e) => sum + Math.abs(e.result), 0));
</script>

<AppBar title="{team} - {data?.title ?? ''} Picklist" back backFallback="/picklists">
	{#snippet actions()}
		<button class="icon-btn" onclick={() => (weighted = !weighted)} title={weighted ? 'Show unweighted z-scores' : 'Show weighted z-scores'}>
			<Icon name={weighted ? 'fitness_center' : 'balance'} />
		</button>
		<button class="icon-btn" onclick={() => (sameHeights = !sameHeights)} title={sameHeights ? 'Size regions by value' : 'Use same sizes'}>
			<Icon name={sameHeights ? 'expand' : 'compress'} />
		</button>
	{/snippet}
</AppBar>

{#if !data}
	<ErrorView message="Open a team's z-scores from a picklist to see this breakdown." />
{:else}
	<div class="page-body body">
		<div class="stack-bars">
			{#each list as entry, i (entry.type)}
				{@const alternate = entry.result < 0 ? i % 2 === 1 : i % 2 === 0}
				<div
					class="bar"
					class:alternate
					style:flex-grow={sameHeights ? 1 : Math.abs(entry.result) / (total || 1)}
				>
					<span class="title-medium">{picklistWeightNames.get(entry.type) ?? entry.type}</span>
					<span class="title-medium">{entry.result.toFixed(2)}</span>
				</div>
			{/each}
		</div>
	</div>
{/if}

<style>
	.body {
		flex: 1;
		display: flex;
	}
	.stack-bars {
		flex: 1;
		min-height: 60vh;
		display: flex;
		flex-direction: column;
		border-radius: 10px;
		overflow: hidden;
		background: var(--primary-container);
	}
	.bar {
		flex-basis: 0;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 10px;
		overflow: hidden;
		white-space: nowrap;
		background: var(--primary-container);
		color: var(--on-primary-container);
		transition: flex-grow 300ms cubic-bezier(0.2, 0, 0, 1);
	}
	.bar.alternate {
		background: var(--primary);
		color: var(--on-primary);
	}
</style>
