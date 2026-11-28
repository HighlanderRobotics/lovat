<script lang="ts">
	import { breakdownMetricsQuery } from '#lib/api/endpoints.ts';
	import { useQuery } from '#lib/api/query.svelte.ts';
	import { breakdowns } from '#lib/metrics.ts';
	import Empty from '../Empty.svelte';
	import ErrorView from '../ErrorView.svelte';
	import Icon from '../Icon.svelte';
	import LinearProgress from '../LinearProgress.svelte';

	let { team }: { team: number } = $props();
	const query = useQuery(() => breakdownMetricsQuery(team));

	/** Darker segments first, matching the Flutter colour ramp. */
	function shade(index: number, count: number) {
		const factor = (index / count) * 0.7 + 0.3;
		return `color-mix(in srgb, var(--primary-container) ${factor * 100}%, var(--primary))`;
	}
</script>

<LinearProgress active={query.isFetching && query.hasData} />
{#if query.data}
	{@const data = query.data}
	<div class="page-body stack">
		{#each breakdowns as breakdown (breakdown.path)}
			{@const values = data[breakdown.path] ?? {}}
			{@const segments = breakdown.segments.filter((s) => (values[s.path] ?? 0) !== 0)}
			<a class="card breakdown" href="/team_lookup/breakdown?team={team}&breakdown={breakdown.path}">
				<div class="row">
					<span class="title-medium grow">{breakdown.localizedName}</span>
					<Icon name="navigate_next" />
				</div>
				{#if segments.length === 0}
					<div class="none">None recorded</div>
				{:else}
					<div class="bar">
						{#each segments as segment (segment.path)}
							{@const value = values[segment.path]}
							{@const percent = Math.round(value * 100)}
							<div
								class="segment"
								style:flex-grow={Math.round(value * 1000)}
								style:background={shade(breakdown.segments.indexOf(segment), breakdown.segments.length)}
								title="{segment.localizedNameSingular} - {percent}%"
							>
								<span class="title-medium">{percent}%</span>
								<span class="label-medium">{segment.localizedNameSingular}</span>
							</div>
						{/each}
					</div>
				{/if}
			</a>
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
		{#each breakdowns as b (b.path)}<div class="skeleton" style="height: 118px"></div>{/each}
	</div>
{/if}

<style>
	.breakdown {
		display: flex;
		flex-direction: column;
		gap: 7px;
		color: var(--on-surface-variant);
		text-decoration: none;
	}
	.none {
		height: 64px;
		border-radius: 6px;
		background: var(--surface);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.bar {
		display: flex;
		border-radius: 6px;
		overflow: hidden;
	}
	.segment {
		flex-basis: 0;
		min-width: 0;
		padding: 10px;
		display: flex;
		flex-direction: column;
		color: var(--on-surface);
		overflow: hidden;
		white-space: nowrap;
	}
	.segment span {
		overflow: hidden;
		text-overflow: clip;
	}
</style>
