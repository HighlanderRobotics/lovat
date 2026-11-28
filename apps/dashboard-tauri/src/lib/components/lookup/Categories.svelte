<script lang="ts">
	import { categoryMetricsQuery } from '#lib/api/endpoints.ts';
	import { useQuery } from '#lib/api/query.svelte.ts';
	import { formatMetric, metricCategories } from '#lib/metrics.ts';
	import Empty from '../Empty.svelte';
	import ErrorView from '../ErrorView.svelte';
	import Icon from '../Icon.svelte';
	import LinearProgress from '../LinearProgress.svelte';

	let { team }: { team: number } = $props();
	const query = useQuery(() => categoryMetricsQuery(team));

	function display(metric: (typeof metricCategories)[number]['metrics'][number]) {
		try {
			return formatMetric(metric, query.data?.[metric.path]);
		} catch {
			return '--';
		}
	}
</script>

<LinearProgress active={query.isFetching && query.hasData} />
{#if query.data}
	<div class="page-body stack categories">
		{#each metricCategories as category (category.localizedName)}
			{@const hasDetails = category.metrics.some((m) => !m.hideDetails)}
			<svelte:element
				this={hasDetails ? 'a' : 'div'}
				class="category"
				href={hasDetails ? `/team_lookup/details?team=${team}&category=${encodeURIComponent(category.localizedName)}` : undefined}
			>
				<div class="grow">
					<div class="title-medium">{category.localizedName}</div>
					<div class="tiles">
						{#each category.metrics.filter((m) => !m.hideOverview) as metric (metric.path)}
							<a
								class="tile"
								href="/team_lookup/details?team={team}&category={encodeURIComponent(category.localizedName)}&metric={metric.path}"
							>
								<span class="headline-small">{display(metric)}</span>
								<span class="label-medium">{metric.abbreviatedLocalizedName}</span>
							</a>
						{/each}
					</div>
				</div>
				{#if hasDetails}<Icon name="navigate_next" />{/if}
			</svelte:element>
		{/each}
	</div>
{:else if query.error}
	{#if query.error.includes('NO_DATA_FOR_TEAM')}
		<Empty image="/images/no_scouters.png" title="No data found" body="Try using data from more teams or tournaments." />
	{:else if query.error.includes('TEAM_DOES_NOT_EXIST')}
		<Empty image="/images/awaiting_verification.png" title="Team does not exist" />
	{:else}
		<ErrorView message={query.error} onRetry={query.refetch} />
	{/if}
{:else}
	<div class="page-body stack">
		{#each metricCategories as c (c.localizedName)}<div class="skeleton" style="height: 117px"></div>{/each}
	</div>
{/if}

<style>
	.categories {
		gap: 15px;
	}
	.category {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px;
		border-radius: 10px;
		background: var(--primary-container);
		color: var(--on-primary-container);
		text-decoration: none;
	}
	.tiles {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 5px;
	}
	.tile {
		min-width: 70px;
		padding: 8px 10px;
		border-radius: 5px;
		background: var(--primary);
		color: var(--on-primary);
		display: flex;
		flex-direction: column;
		align-items: center;
		text-decoration: none;
	}
</style>
