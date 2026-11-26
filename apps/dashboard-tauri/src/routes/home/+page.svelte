<script lang="ts">
	import { untrack } from 'svelte';
	import {
		allTeamInfo,
		compareByRank,
		getMatches,
		getTeamRankings,
		getTeamTournamentStatus,
		getTournaments,
		getUserProfile,
		scouterScheduleQuery,
		selectHomeMatch,
		type MatchScheduleMatch,
		type ScoutSchedule,
		type TeamRanking,
		type TeamTournamentStatus
	} from '#lib/api/endpoints.ts';
	import { LovatAPIException } from '#lib/api/client.ts';
	import AppBar from '#lib/components/AppBar.svelte';
	import ErrorView from '#lib/components/ErrorView.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import LinearProgress from '#lib/components/LinearProgress.svelte';
	import MatchCard from '#lib/components/MatchCard.svelte';
	import Spinner from '#lib/components/Spinner.svelte';
	import TeamCard from '#lib/components/TeamCard.svelte';
	import { currentTournament, tournamentLabel, type Tournament } from '#lib/tournament.svelte.ts';
	import { formatDateRange, tournamentsThisWeek } from '#lib/upcoming.ts';

	const TIMEOUT = 30_000;

	function withTimeout<T>(p: Promise<T>): Promise<T> {
		return Promise.race([
			p,
			new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT))
		]);
	}

	interface HomeData {
		team: number | null;
		status: TeamTournamentStatus | null;
		notices: string[];
		topTeams: TeamRanking[];
		schedule: ScoutSchedule | null;
		lastCompleted: MatchScheduleMatch | null;
		nextMatchOrdinal: number | null;
		match1: MatchScheduleMatch | null;
		match2: MatchScheduleMatch | null;
	}

	let data = $state<HomeData | null>(null);
	let error = $state<string | null>(null);
	let generation = 0;

	async function load() {
		const gen = ++generation;
		data = null;
		error = null;
		try {
			const tournament = currentTournament.value;
			if (!tournament) {
				throw new LovatAPIException('No tournament selected. Choose a tournament from the navigation menu.');
			}
			const profile = await withTimeout(getUserProfile());
			const teamNumber = profile.team?.number ?? null;
			const notices: string[] = [];
			const [matches, schedule, rankings, status] = await Promise.all([
				withTimeout(getMatches(tournament.key)).catch(() => {
					notices.push('The match schedule is unavailable for this tournament.');
					return [] as MatchScheduleMatch[];
				}),
				withTimeout(scouterScheduleQuery(tournament.key).fn()).catch(() => {
					notices.push('The scouter schedule is unavailable for this tournament.');
					return null;
				}),
				withTimeout(getTeamRankings(tournament.key))
					.then((teams) => teams.sort(compareByRank))
					.catch(() => {
						notices.push('Rankings could not be loaded for this tournament.');
						return [] as TeamRanking[];
					}),
				teamNumber === null
					? Promise.resolve(null)
					: withTimeout(getTeamTournamentStatus(tournament.key, teamNumber))
							.then((s) => {
								if (!s) notices.push('Your team is not entered in this tournament.');
								return s;
							})
							.catch(() => {
								notices.push("Your team's tournament status is unavailable.");
								return null;
							})
			]);
			if (gen !== generation) return;
			const teamMatches = matches.filter((m) => allTeamInfo(m).some((i) => i.teamNumber === teamNumber));
			const lastCompleted = [...matches].reverse().find((m) => m.isFinished) ?? null;
			// Shift ranges use one-based play order across qualifiers and eliminations.
			const nextIndex = matches.findIndex((m) => !m.isFinished);
			data = {
				team: teamNumber,
				status,
				notices,
				topTeams: rankings,
				schedule,
				lastCompleted,
				nextMatchOrdinal: nextIndex < 0 ? null : nextIndex + 1,
				match1: selectHomeMatch(matches),
				match2: selectHomeMatch(teamMatches, false)
			};
		} catch (e) {
			if (gen !== generation) return;
			error =
				e instanceof LovatAPIException
					? e.message
					: e instanceof Error && e.message === 'timeout'
						? 'Loading the home page timed out. Please try again.'
						: 'Could not load the home page. Please try again.';
		}
	}

	$effect(() => {
		void currentTournament.value?.key;
		untrack(load);
	});

	const topFour = $derived.by(() => {
		if (!data) return { teams: [] as TeamRanking[], ranked: false };
		const ranked = data.topTeams.filter((t) => (t.rank ?? 0) > 0).sort(compareByRank).slice(0, 4);
		if (ranked.length) return { teams: ranked, ranked: true };
		return { teams: [...data.topTeams].sort((a, b) => a.number - b.number).slice(0, 4), ranked: false };
	});

	const onDutyText = $derived.by(() => {
		if (!data?.lastCompleted) return 'No completed matches';
		const names = new Set(allTeamInfo(data.lastCompleted).flatMap((t) => t.scouters.map((s) => s.name)));
		return `${names.size} Scouters`;
	});

	const nextMatchText = $derived.by(() => {
		if (!data || data.nextMatchOrdinal === null) return 'No upcoming matches';
		if (!data.schedule) return 'Schedule unavailable';
		const ids = new Set<string>();
		for (const shift of data.schedule.shifts) {
			if (shift.start <= data.nextMatchOrdinal && data.nextMatchOrdinal <= shift.end) {
				shift.teams.flat().forEach((s) => ids.add(s.id));
			}
		}
		return `${ids.size} Scouters`;
	});

	let weekTournaments = $state<Tournament[] | null>(null);
	let weekError = $state(false);

	async function loadWeek() {
		weekTournaments = null;
		weekError = false;
		try {
			weekTournaments = tournamentsThisWeek((await withTimeout(getTournaments())).tournaments);
		} catch {
			weekError = true;
		}
	}

	$effect(() => {
		untrack(loadWeek);
	});
</script>

<AppBar title="Home" />

{#if error}
	<ErrorView message={error} onRetry={load} />
{:else if !data}
	<div class="center" style="flex: 1"><Spinner /></div>
{:else}
	<div class="page-body home">
		<h2 class="tournament">{currentTournament.value ? tournamentLabel(currentTournament.value) : 'No Selected Tournament'}</h2>

		{#each data.notices as notice (notice)}<p class="notice">{notice}</p>{/each}
		{#if data.notices.length}<button class="btn btn-text retry" onclick={load}>Retry unavailable data</button>{/if}

		<h3 class="section">{data.team === null ? 'Team status' : `${data.team}'s status`}</h3>
		<div class="status-row">
			<div class="status"><strong>{data.status?.rank ?? 'N/A'}</strong><span>Rank</span></div>
			<div class="status"><strong>{data.status?.rankingPoints ?? 'N/A'}</strong><span>Ranking points</span></div>
			<div class="status">
				<strong>{data.status?.matchesPlayed ?? 'N/A'} of {data.status?.matchesTotal ?? 'N/A'}</strong><span>Matches played</span>
			</div>
		</div>

		<a class="section link" href="/match_schedule">Matches <Icon name="chevron_right" size={18} /></a>
		{#if data.match1}
			<MatchCard match={data.match1} compact badge={data.match1.isFinished ? 'Completed' : 'Up next'} />
		{:else}
			<p>No matches available.</p>
		{/if}
		{#if data.match2 && !data.match2.isFinished}
			<MatchCard match={data.match2} compact badge={data.team ? `Up next for ${data.team}` : 'Up next'} />
		{:else}
			<div class="no-team-matches">No more upcoming matches for your team</div>
		{/if}

		<a class="section link" href="/tournament_teams">Teams <Icon name="chevron_right" size={18} /></a>
		{#if data.topTeams.length === 0}
			<p>Rankings are not available for this tournament yet.</p>
		{:else}
			{#if !topFour.ranked}<p>Rankings are not available for this tournament yet.</p>{/if}
			<div class="team-grid">
				{#each topFour.teams as team (team.number)}<TeamCard ranking={team} />{/each}
			</div>
		{/if}

		<a class="section link" href="/scouters">Scouters <Icon name="chevron_right" size={18} /></a>
		<div class="scouter-row">
			<div class="scouter-card"><strong>On Duty</strong><span>{onDutyText}</span></div>
			<div class="scouter-card"><strong>Next Match</strong><span>{nextMatchText}</span></div>
		</div>

		<h3 class="section">Upcoming Tournaments This Week</h3>
		{#if weekError}
			<p>Could not load tournaments this week.</p>
			<button class="btn btn-text retry" onclick={loadWeek}>Retry tournaments</button>
		{:else if weekTournaments === null}
			<LinearProgress />
		{:else if weekTournaments.length === 0}
			<p>No upcoming tournaments this week.</p>
		{:else}
			{#each weekTournaments as t (t.key)}
				<div class="week-card">
					<span class="week-name">{tournamentLabel(t)}</span>
					<span class="week-meta">
						{#if t.location?.trim()}<span>{t.location}</span>{/if}
						<span>{formatDateRange(t)}</span>
					</span>
				</div>
			{/each}
		{/if}
	</div>
{/if}

<style>
	.home {
		padding: 26px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.tournament {
		font-size: 24px;
		line-height: 32px;
		margin-bottom: 2px;
	}
	.notice {
		margin: 0;
	}
	.retry {
		align-self: flex-start;
	}
	.section {
		font-size: 20px;
		line-height: 1.6;
		font-weight: 500;
		margin-top: 10px;
		color: var(--on-surface);
		display: inline-flex;
		align-items: center;
		gap: 3px;
		text-decoration: none;
	}
	.status-row,
	.scouter-row {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 10px;
	}
	.scouter-row {
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.status {
		height: 60px;
		padding: 7px;
		border-radius: 7px;
		background: var(--surface-high);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
	}
	.status strong {
		font-size: 20px;
		font-weight: 500;
		color: #e0e0e0;
		white-space: nowrap;
	}
	.status span {
		font-size: 12px;
		color: #b8b8b8;
	}
	.no-team-matches {
		height: 122px;
		border-radius: 7px;
		background: var(--surface-high);
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 12px;
		font-weight: 600;
		color: white;
		margin-top: 6px;
	}
	.team-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.scouter-card {
		background: var(--surface-high);
		border-radius: 7px;
		padding: 8px 10px;
		display: flex;
		flex-direction: column;
	}
	.scouter-card strong {
		font-size: 16px;
		font-weight: 500;
	}
	.scouter-card span {
		font-size: 10px;
		color: #b8b8b8;
	}
	.week-card {
		min-height: 56px;
		padding: 8px 10px;
		border-radius: 8px;
		background: var(--surface-high);
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.week-name {
		flex: 3;
		font-weight: 500;
	}
	.week-meta {
		flex: 2;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		font-size: 11px;
		color: var(--on-surface-variant);
		text-align: right;
	}
	p {
		margin: 0;
	}
</style>
