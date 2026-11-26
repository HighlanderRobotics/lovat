<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PicklistAnalysisTeam } from '#lib/api/endpoints.ts';
	import type { QueryState } from '#lib/api/query.svelte.ts';
	import { getPicklistFlags } from '#lib/flags.ts';
	import { breakdownHandoff } from '#lib/picklistHandoff.ts';
	import ErrorView from '../ErrorView.svelte';
	import Icon from '../Icon.svelte';
	import LinearProgress from '../LinearProgress.svelte';
	import FlagRow from './FlagRow.svelte';

	let { query, title }: { query: QueryState<PicklistAnalysisTeam[]>; title: string } = $props();
	const flags = getPicklistFlags();

	function openBreakdown(team: PicklistAnalysisTeam) {
		breakdownHandoff.set({ team: team.teamNumber, title, weighted: team.zScoresWeighted, unweighted: team.zScoresUnweighted });
		void goto(`/picklist/breakdown?team=${team.teamNumber}`);
	}
</script>

<LinearProgress active={query.isFetching && query.hasData} />
{#if query.error && !query.hasData}
	<ErrorView message={query.error} onRetry={query.refetch} />
{:else if !query.data}
	<div class="page-body stack">
		{#each [0, 1, 2, 3, 4, 5] as i (i)}<div class="skeleton" style="height: 48px"></div>{/each}
	</div>
{:else}
	<ol class="ranking">
		{#each query.data as team (team.teamNumber)}
			<li class="team">
				<span class="body-large grow">{team.teamNumber}</span>
				<FlagRow {flags} data={Object.fromEntries(team.flags.map((f) => [f.type, f.result]))} team={team.teamNumber} />
				<button class="icon-btn" title="View {team.teamNumber}'s z-scores" aria-label="View {team.teamNumber}'s z-scores" onclick={() => openBreakdown(team)}>
					<Icon name="balance" />
				</button>
				<a class="icon-btn" href="/team_lookup?team={team.teamNumber}" title="Open team lookup for {team.teamNumber}" aria-label="Open team lookup for {team.teamNumber}">
					<Icon name="arrow_right" />
				</a>
			</li>
		{/each}
	</ol>
{/if}

<style>
	.ranking {
		list-style: none;
		margin: 0 auto;
		padding: 0;
		max-width: 900px;
		width: 100%;
	}
	.team {
		display: flex;
		align-items: center;
		gap: 4px;
		min-height: 56px;
		padding: 4px 4px 4px 16px;
	}
</style>
