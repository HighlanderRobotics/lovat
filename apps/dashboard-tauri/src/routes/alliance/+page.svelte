<script lang="ts">
	import { page } from '$app/state';
	import { allianceAnalysisQuery } from '#lib/api/endpoints.ts';
	import { useQuery } from '#lib/api/query.svelte.ts';
	import AllianceAutoPaths from '#lib/components/AllianceAutoPaths.svelte';
	import AppBar from '#lib/components/AppBar.svelte';
	import ClimbTable from '#lib/components/ClimbTable.svelte';
	import ErrorView from '#lib/components/ErrorView.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Spinner from '#lib/components/Spinner.svelte';
	import ValueTile from '#lib/components/ValueTile.svelte';
	import { numToStringRounded } from '#lib/metrics.ts';
	import { robotRoleIcons, robotRoleNames } from '#lib/models/types.ts';

	const teams = (page.url.searchParams.get('teams') ?? '').split(',').map(Number).slice(0, 3);
	const query = useQuery(() => allianceAnalysisQuery(teams));
</script>

<AppBar title="Alliance" back backFallback="/my_alliance" loading={query.isFetching && query.hasData} />

{#if query.error && !query.hasData}
	<ErrorView message={query.error} onRetry={query.refetch} />
{:else if !query.data}
	<div class="center" style="flex: 1"><Spinner /></div>
{:else}
	{@const a = query.data}
	<div class="page-body stack">
		<div class="teams">
			{#each a.teams as t (t.team)}
				<span class="row" style="gap: 3px">
					<span title={t.role === null ? 'No data' : robotRoleNames[t.role]}>
						<Icon name={t.role === null ? 'question_mark' : robotRoleIcons[t.role]} />
					</span>
					<a class="title-large" href="/team_lookup?team={t.team}">{t.team}</a>
				</span>
			{/each}
		</div>
		<div class="teleop">
			<span class="label-large">Teleop points</span>
			<span class="title-medium">{a.totalPoints == null ? '--' : numToStringRounded(a.totalPoints)}</span>
		</div>
		<ClimbTable analysis={a} />
		<div class="grid2">
			<ValueTile value={numToStringRounded(a.totalBallThroughput)} label="Total output" />
			<ValueTile value={numToStringRounded(a.totalFuelOutputted)} label="Hub shots" />
		</div>
		<AllianceAutoPaths data={a} />
	</div>
{/if}

<style>
	.teams {
		display: flex;
		justify-content: space-between;
		margin-bottom: 10px;
	}
	.teams a {
		color: var(--on-surface);
		text-decoration: none;
	}
	.teleop {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 10px;
		border-radius: 10px;
		background: var(--primary);
		color: var(--on-primary);
	}
	.grid2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
</style>
