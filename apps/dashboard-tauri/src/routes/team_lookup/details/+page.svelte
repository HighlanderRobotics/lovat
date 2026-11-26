<script lang="ts">
	import { page } from '$app/state';
	import { metricDetailsQuery } from '#lib/api/endpoints.ts';
	import { useQuery } from '#lib/api/query.svelte.ts';
	import AppBar from '#lib/components/AppBar.svelte';
	import ErrorView from '#lib/components/ErrorView.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import LinearProgress from '#lib/components/LinearProgress.svelte';
	import Spinner from '#lib/components/Spinner.svelte';
	import Sparkline from '#lib/components/Sparkline.svelte';
	import Tabs from '#lib/components/Tabs.svelte';
	import TeamAutoPaths from '#lib/components/TeamAutoPaths.svelte';
	import type { AutoPath } from '#lib/models/autoPath.ts';
	import { abbreviatedNameWithUnits, formatMetric, metricCategories } from '#lib/metrics.ts';

	const team = Number(page.url.searchParams.get('team'));
	const category = metricCategories.find((c) => c.localizedName === page.url.searchParams.get('category')) ?? metricCategories[0];
	const metrics = category.metrics.filter((m) => !m.hideDetails);
	const initial = metrics.findIndex((m) => m.path === page.url.searchParams.get('metric'));
	let tab = $state(initial === -1 ? 0 : initial);
	const metric = $derived(metrics[tab]);
	const query = useQuery(() => metricDetailsQuery(team, metric.path));
	let selectedPath = $state<AutoPath | null>(null);
</script>

<AppBar title="{team} - {category.localizedName}" back backFallback="/team_lookup?team={team}" loading={query.isFetching && query.hasData}>
	{#snippet bottom()}<Tabs tabs={metrics.map((m) => m.abbreviatedLocalizedName)} bind:selected={tab} />{/snippet}
</AppBar>

{#if query.error && !query.hasData}
	<ErrorView message={query.error} onRetry={query.refetch} />
{:else if !query.data}
	<div class="center" style="flex: 1"><Spinner /></div>
{:else}
	{@const d = query.data}
	<div class="page-body stack">
		<div class="boxes">
			{#if d.hasResult}
				<div class="box colored"><span class="headline-small">{formatMetric(metric, d.result)}</span><span class="label-medium">This team</span></div>
			{/if}
			{#if d.hasAll}
				<div class="box emphasis"><span class="headline-small">{formatMetric(metric, d.all)}</span><span class="label-medium">All teams</span></div>
			{/if}
			{#if d.hasDifference}
				<div class="box colored">
					<span class="headline-small diff">
						{#if d.difference == null}--{:else}
							<Icon name={d.difference < 0 ? 'arrow_drop_down' : 'arrow_drop_up'} />{formatMetric(metric, Math.abs(d.difference))}
						{/if}
					</span>
					<span class="label-medium">Difference</span>
				</div>
			{/if}
		</div>
		{#if d.array.length}
			<Sparkline
				axisLabel={abbreviatedNameWithUnits(metric)}
				max={metric.max}
				points={d.array.map((p) => ({
					value: p.dataPoint,
					label: `${p.match.getShortLocalizedDescription()} at ${p.tournamentName}`
				}))}
			/>
		{/if}
		{#if d.paths.length}
			<TeamAutoPaths autoPaths={d.paths} bind:selected={selectedPath} />
		{/if}
	</div>
{/if}

<LinearProgress active={false} />

<style>
	.boxes {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
		gap: 10px;
	}
	.box {
		border-radius: 6px;
		padding: 10px;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
	}
	.diff {
		display: inline-flex;
		align-items: center;
	}
	.colored {
		background: var(--primary-container);
		color: var(--on-primary-container);
	}
	.emphasis {
		background: var(--primary);
		color: var(--on-primary);
	}
</style>
