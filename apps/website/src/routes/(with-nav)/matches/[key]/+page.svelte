<script lang="ts">
	import { Button, DensityProvider } from 'magnolia-ui-svelte';
	import ScoreBreakdown from '$lib/tournaments/ScoreBreakdown.svelte';
	import MatchScouting from '$lib/tournaments/MatchScouting.svelte';
	import MatchCard from '$lib/tournaments/MatchCard.svelte';
	import { matchLabel } from '$lib/tournaments/matchLabel';
	import type { PageData } from './$types';

	export let data: PageData;

	$: tournament = data.tournament;
	$: label = matchLabel(data.match, tournament.playoffType);
	$: teamNames = new Map(tournament.teams.map((team) => [team.number, team.name]));
	$: firstUrl = `https://frc-events.firstinspires.org/${tournament.seasonYear}/${tournament.key.slice(4).toUpperCase()}/${
		data.match.competitionLevel === 'QUALIFICATION'
			? `qualifications/${data.match.matchNumber}`
			: tournament.playoffType === 10 && data.match.competitionLevel === 'SEMIFINAL'
				? `playoffs/${data.match.setNumber}`
				: tournament.playoffType === 10 && data.match.competitionLevel === 'FINAL'
					? `playoffs/${13 + data.match.matchNumber}`
					: 'playoffs'
	}`;
	$: matchDate = date(
		data.match.actualTime ?? data.match.predictedTime ?? data.match.scheduledTime,
		tournament.timezone
	);

	function date(value: string | null, timezone: string | null) {
		if (!value) return null;

		let zone = timezone ?? 'UTC';

		try {
			new Intl.DateTimeFormat('en-US', { timeZone: zone }).format();
		} catch {
			zone = 'UTC';
		}

		return new Intl.DateTimeFormat('en-US', {
			timeZone: zone,
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		}).format(new Date(value));
	}
</script>

<svelte:head>
	<title>{label} · {tournament.name} | Lovat</title>
	<meta name="description" content={`${label} results, teams and times at ${tournament.name}.`} />
</svelte:head>

<main>
	<header>
		<div class="header-top">
			<nav class="breadcrumbs" aria-label="Match hierarchy">
				<a href={`/${tournament.seasonYear}`}>{tournament.seasonYear}</a>
				{#if tournament.district}<span aria-hidden="true">&gt;</span><a
						href={`/${tournament.district.key.slice(4)}/${tournament.seasonYear}`}
						>{tournament.district.name}</a
					>{/if}
				<span aria-hidden="true">&gt;</span><a href={`/tournaments/${tournament.key}`}
					>{tournament.name}</a
				>
				<span aria-hidden="true">&gt;</span><span aria-current="page">{label}</span>
			</nav>
			<nav class="match-resources" aria-label="Match resources">
				<DensityProvider density="compact">
					<Button
						element="a"
						variant="secondary"
						href={`https://www.thebluealliance.com/match/${data.match.key}`}
						><img src="/assets/event-resources/tba.svg" alt="TBA" /></Button
					>
					<Button element="a" variant="secondary" href={firstUrl}
						><img src="/assets/event-resources/first.png" alt="FIRST" /></Button
					>
					<Button
						element="a"
						variant="secondary"
						href={`https://www.statbotics.io/match/${data.match.key}`}
						><img src="/assets/event-resources/statbotics.ico" alt="Statbotics" /></Button
					>
					<Button
						element="a"
						variant="secondary"
						href={`https://www.match13.com/match/${data.match.key}`}
						><img src="/assets/event-resources/match13.png" alt="Match13" /></Button
					>
				</DensityProvider>
			</nav>
		</div>
		<h1>{label}</h1>
		{#if matchDate}<p>{matchDate}</p>{/if}
	</header>

	<MatchCard
		match={data.match}
		playoffType={tournament.playoffType}
		timezone={tournament.timezone}
		year={tournament.seasonYear}
		{teamNames}
		linkToMatch={false}
	/>

	{#if data.videos.length}
		<nav class="match-videos" aria-label="Match videos">
			<DensityProvider density="compact">
				{#each data.videos as video, index (video)}
					<a href={`https://www.youtube.com/watch?v=${video}`} target="_blank" rel="noreferrer">
						<svg viewBox="0 0 24 24" aria-hidden="true"
							><path fill="currentColor" d="M8 5v14l11-7z" /></svg
						>
						{data.videos.length === 1 ? 'Watch on YouTube' : `Watch on YouTube ${index + 1}`}
					</a>
				{/each}
			</DensityProvider>
		</nav>
	{/if}

	{#key data.match.key}
		<MatchScouting matchKey={data.match.key} year={tournament.seasonYear} />
	{/key}

	<ScoreBreakdown alliances={data.breakdowns} />

	<nav class="match-navigation" aria-label="Adjacent matches">
		<div class="previous-match">
			<DensityProvider density="compact">
				{#if data.previous}<Button
						element="a"
						variant="secondary"
						href={`/matches/${data.previous.key}`}
						>← {matchLabel(data.previous, tournament.playoffType)}</Button
					>{/if}
			</DensityProvider>
		</div>
		<div class="next-match">
			<DensityProvider density="compact">
				{#if data.next}<Button element="a" variant="secondary" href={`/matches/${data.next.key}`}
						>{matchLabel(data.next, tournament.playoffType)} →</Button
					>{/if}
			</DensityProvider>
		</div>
	</nav>
</main>

<style>
	main {
		max-width: 1160px;
		margin: 0 auto;
		padding: 44px 26px 64px;
		color: var(--on-background);
	}
	header {
		margin-bottom: 28px;
	}
	.header-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 16px;
	}
	.match-resources {
		display: flex;
		gap: 6px;
		margin-left: auto;
	}
	.match-resources img {
		width: 24px;
		height: 24px;
		object-fit: contain;
	}
	.breadcrumbs {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		font-size: 14px;
	}
	.breadcrumbs a {
		color: var(--victory-purple);
		text-decoration: none;
	}
	.breadcrumbs a:focus-visible {
		outline: 2px solid var(--victory-purple);
		outline-offset: 3px;
	}
	h1 {
		margin: 24px 0 12px;
		font-size: clamp(28px, 3.8vw, 42px);
		font-weight: 500;
	}
	p {
		margin: 0;
		color: var(--body);
	}
	.match-navigation {
		display: flex;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 12px;
		margin-top: 20px;
	}
	.match-videos {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 16px;
	}
	.match-videos svg {
		width: 20px;
		height: 20px;
		margin-right: 6px;
	}
	.match-videos a {
		display: inline-flex;
		align-items: center;
		padding: 10px 16px;
		border: 1px solid var(--victory-purple);
		border-radius: 4px;
		color: var(--victory-purple);
		text-decoration: none;
	}
	.match-videos a:hover {
		background: var(--secondary-container);
	}
	.match-videos a:focus-visible {
		outline: 2px solid var(--victory-purple);
		outline-offset: 3px;
	}
	.previous-match,
	.next-match {
		min-width: 0;
	}
	.next-match {
		margin-left: auto;
		text-align: right;
	}

	@media (max-width: 600px) {
		main {
			padding: 26px 20px 44px;
		}
	}
</style>
