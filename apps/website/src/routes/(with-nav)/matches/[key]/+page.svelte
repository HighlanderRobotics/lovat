<script lang="ts">
	import { Button, DensityProvider } from 'magnolia-ui-svelte';
	import MatchCard from '$lib/tournaments/MatchCard.svelte';
	import { matchLabel } from '$lib/tournaments/matchLabel';
	import type { PageData } from './$types';

	export let data: PageData;

	$: tournament = data.tournament;
	$: label = matchLabel(data.match, tournament.playoffType);
	$: teamNames = new Map(tournament.teams.map((team) => [team.number, team.name]));
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

	<nav class="match-navigation" aria-label="Adjacent matches">
		<DensityProvider density="compact">
			{#if data.previous}<Button
					element="a"
					variant="secondary"
					href={`/matches/${data.previous.key}`}
					>← {matchLabel(data.previous, tournament.playoffType)}</Button
				>{/if}
			{#if data.next}<Button element="a" variant="secondary" href={`/matches/${data.next.key}`}
					>{matchLabel(data.next, tournament.playoffType)} →</Button
				>{/if}
		</DensityProvider>
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
	@media (max-width: 600px) {
		main {
			padding: 26px 20px 44px;
		}
	}
</style>
