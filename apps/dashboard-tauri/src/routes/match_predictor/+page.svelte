<script lang="ts">
	import { page } from '$app/state';
	import { matchPredictionQuery, type AllianceAnalysis } from '#lib/api/endpoints.ts';
	import { useQuery } from '#lib/api/query.svelte.ts';
	import AppBar from '#lib/components/AppBar.svelte';
	import ClimbTable from '#lib/components/ClimbTable.svelte';
	import Empty from '#lib/components/Empty.svelte';
	import ErrorView from '#lib/components/ErrorView.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Tabs from '#lib/components/Tabs.svelte';
	import ValueTile from '#lib/components/ValueTile.svelte';
	import { numToStringRounded } from '#lib/metrics.ts';
	import { robotRoleIcons, robotRoleNames } from '#lib/models/types.ts';

	const parse = (key: string) => (page.url.searchParams.get(key) ?? '').split(',').map(Number);
	const red = parse('red');
	const blue = parse('blue');
	const query = useQuery(() => matchPredictionQuery(red, blue));
	let tab = $state(0);

	const notEnough = $derived(!query.hasData && !!query.error?.includes('Not enough data'));
</script>

{#snippet allianceColumn(index: number, data: AllianceAnalysis)}
	{@const bg = index === 0 ? 'var(--red-alliance)' : 'var(--blue-alliance)'}
	{@const on = index === 0 ? 'var(--on-red-alliance)' : 'var(--on-blue-alliance)'}
	<div class="stack" style="gap: 15px">
		{#if data.teams.length === 0}
			<p>Not enough data</p>
		{:else}
			<div class="teams">
				{#each data.teams as t (t.team)}
					<a class="team" href="/team_lookup?team={t.team}" style:background={bg}>
						<span class="row" style="gap: 5px; justify-content: center">
							{#if t.role !== null}<span title={robotRoleNames[t.role]}><Icon name={robotRoleIcons[t.role]} /></span>{/if}
							<span class="body-large">{t.team}</span>
						</span>
						<span style:color={on} style="margin-top: 10px">Avg score</span>
						<span class="title-medium">{numToStringRounded(t.averagePoints)}</span>
					</a>
				{/each}
			</div>
		{/if}
		<div class="teleop" style:background={bg}>
			<span>Teleop points</span><span>{data.totalPoints == null ? '--' : numToStringRounded(data.totalPoints)}</span>
		</div>
		<ClimbTable analysis={data} background={on} foreground={bg} />
		<div class="grid2">
			<ValueTile value={numToStringRounded(data.totalBallThroughput)} label="Total output" />
			<ValueTile value={numToStringRounded(data.totalFuelOutputted)} label="Hub shots" />
		</div>
	</div>
{/snippet}

<AppBar title="Match Predictor" back={page.url.searchParams.get('nav') !== '1'} loading={query.isFetching && query.hasData}>
	{#snippet bottom()}
		{#if query.data || !query.error}
			<div class="prediction-wrap">
				{#if query.data}
					{@const p = query.data}
					<div class="prediction">
						{#if p.redWinning == null || p.blueWinning == null}
							<span class="none">Not enough data</span>
						{:else}
							<span class="red" style:flex-grow={Math.round(p.redWinning * 100)}></span>
							<span class="blue" style:flex-grow={Math.round(p.blueWinning * 100)}></span>
							<span class="labels">
								<span><span class="label-large">Red alliance</span> {Math.round(p.redWinning * 100)}%</span>
								<span><span class="label-large">Blue alliance</span> {Math.round(p.blueWinning * 100)}%</span>
							</span>
						{/if}
					</div>
				{:else}
					<div class="prediction skeleton"></div>
				{/if}
			</div>
			<div class="tabs-narrow"><Tabs tabs={['Red', 'Blue']} bind:selected={tab} /></div>
		{/if}
	{/snippet}
</AppBar>

{#if notEnough}
	<Empty image="/images/no-notes-dark.png" title="Not enough data" body="There must be 2 or more matches recorded for each team to make a prediction." />
{:else if query.error && !query.hasData}
	<ErrorView message={query.error} onRetry={query.refetch} />
{:else if !query.data}
	<div class="page-body columns">
		{#each [0, 1] as i (i)}
			<div class="stack column" class:hidden-narrow={i !== tab} style="gap: 15px">
				<div class="skeleton" style="height: 94px"></div>
				<div class="skeleton" style="height: 40px"></div>
				<div class="skeleton" style="height: 160px"></div>
				<div class="skeleton" style="height: 72px"></div>
			</div>
		{/each}
	</div>
{:else}
	<div class="page-body columns">
		<div class="column" class:hidden-narrow={tab !== 0}>{@render allianceColumn(0, query.data.redAlliance)}</div>
		<div class="column" class:hidden-narrow={tab !== 1}>{@render allianceColumn(1, query.data.blueAlliance)}</div>
	</div>
{/if}

<style>
	.prediction-wrap {
		padding: 8px 16px 16px;
		max-width: 1200px;
		margin: 0 auto;
	}
	.prediction {
		position: relative;
		display: flex;
		height: 30px;
		border-radius: 7px;
		overflow: hidden;
		background: var(--surface-high);
	}
	.prediction .red {
		background: var(--red-alliance);
		flex-basis: 0;
	}
	.prediction .blue {
		background: var(--blue-alliance);
		flex-basis: 0;
	}
	.prediction .none {
		margin: auto;
		color: var(--on-surface-variant);
	}
	.labels {
		position: absolute;
		inset: 0;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0 8px;
		white-space: nowrap;
	}
	.columns {
		display: grid;
		grid-template-columns: 1fr;
		gap: 16px;
		max-width: 1200px;
	}
	@media (min-width: 900px) {
		.columns {
			grid-template-columns: 1fr 1fr;
		}
		.tabs-narrow {
			display: none;
		}
		.hidden-narrow {
			display: flex !important;
		}
	}
	.hidden-narrow {
		display: none !important;
	}
	@media (min-width: 900px) {
		.column {
			display: block;
		}
	}
	.teams {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 15px;
	}
	.team {
		border-radius: 10px;
		padding: 8px;
		display: flex;
		flex-direction: column;
		align-items: center;
		color: var(--on-surface);
		text-decoration: none;
	}
	.teleop {
		display: flex;
		justify-content: space-between;
		padding: 10px;
		border-radius: 10px;
	}
	.grid2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	p {
		margin: 0;
	}
</style>
