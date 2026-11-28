<script lang="ts">
	import { untrack } from 'svelte';
	import { compareByRank, getTeamRankings, getTeamsAtTournament, type TeamRanking } from '#lib/api/endpoints.ts';
	import AppBar from '#lib/components/AppBar.svelte';
	import ErrorView from '#lib/components/ErrorView.svelte';
	import Spinner from '#lib/components/Spinner.svelte';
	import TeamCard from '#lib/components/TeamCard.svelte';
	import { currentTournament } from '#lib/tournament.svelte.ts';

	let teams = $state<TeamRanking[] | null>(null);
	let failed = $state(false);

	async function load() {
		teams = null;
		failed = false;
		const t = currentTournament.value;
		if (!t) {
			teams = [];
			return;
		}
		try {
			const ranked = await getTeamRankings(t.key);
			if (ranked.length === 0) {
				const roster = await getTeamsAtTournament(t.key);
				ranked.push(...roster.map((r) => ({ number: r.number, rank: null, matchesPlayed: null, rankingPoints: null })));
			}
			teams = ranked.sort((a, b) => compareByRank(a, b) || a.number - b.number);
		} catch {
			failed = true;
		}
	}

	$effect(() => {
		void currentTournament.value?.key;
		untrack(load);
	});
</script>

<AppBar title="Team rankings" back />

{#if failed}
	<ErrorView message="Could not load teams at this tournament." onRetry={load} />
{:else if teams === null}
	<div class="center" style="flex: 1"><Spinner /></div>
{:else if !currentTournament.value}
	<div class="center" style="flex: 1">Select a tournament to see its teams.</div>
{:else if teams.length === 0}
	<div class="center" style="flex: 1">No teams are available for this tournament yet.</div>
{:else}
	<div class="page-body list" aria-label="Teams at {currentTournament.value.name}">
		{#each teams as team (team.number)}<TeamCard ranking={team} />{/each}
	</div>
{/if}

<style>
	.list {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 16px 26px 26px;
	}
</style>
