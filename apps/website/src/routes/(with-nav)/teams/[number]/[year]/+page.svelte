<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button, DensityProvider } from 'magnolia-ui-svelte';
	import { avatarGradient } from '$lib/tournaments/branding';
	import { eventWallpaper } from '$lib/tournaments/wallpaper';
	import type { PageData } from './$types';

	export let data: PageData;

	let failedAvatar = false;
	let selectedYear: number;

	$: team = data.team;
	$: if (team) failedAvatar = false;
	$: selectedYear = team.seasonYear;
	$: location = [team.city, team.stateProvince, team.country].filter(Boolean).join(', ');
	$: photoCredits = [
		...new Map(
			team.tournaments.map((event) => {
				const photo = eventWallpaper(event.district?.abbreviation, event.location, event.key);

				return [photo.image, photo] as const;
			})
		).values()
	];

	function date(value: string | null) {
		return value
			? new Intl.DateTimeFormat('en-US', {
					timeZone: 'UTC',
					month: 'short',
					day: 'numeric'
				}).format(new Date(value))
			: 'Date TBD';
	}
</script>

<svelte:head>
	<title>{team.teamNumber} {team.name} · {team.seasonYear} | Lovat</title>
	<meta
		name="description"
		content={`Team ${team.teamNumber} ${team.name}: ${team.seasonYear} events and awards.`}
	/>
</svelte:head>

<main>
	{#key `${team.teamNumber}:${team.seasonYear}`}
		<header use:avatarGradient={'.team-logo img'}>
			<div class="header-top">
				<nav class="breadcrumbs" aria-label="Team hierarchy">
					<a href={`/${team.seasonYear}`}>{team.seasonYear}</a>
					{#if team.district}<span aria-hidden="true">&gt;</span><a
							href={`/${team.district.abbreviation}/${team.seasonYear}`}>{team.district.name}</a
						>{/if}
					<span aria-hidden="true">&gt;</span><span aria-current="page">{team.teamNumber}</span>
				</nav>
				<nav class="team-links" aria-label="Team resources">
					<DensityProvider density="compact">
						<Button
							variant="secondary"
							element="a"
							href={`https://www.thebluealliance.com/team/${team.teamNumber}/${team.seasonYear}`}
							><img src="/assets/event-resources/tba.svg" alt="TBA" /></Button
						>
						<Button
							variant="secondary"
							element="a"
							href={`https://frc-events.firstinspires.org/${team.seasonYear}/team/${team.teamNumber}`}
							><img src="/assets/event-resources/first.png" alt="FIRST" /></Button
						>
						<Button
							variant="secondary"
							element="a"
							href={`https://www.statbotics.io/team/${team.teamNumber}/${team.seasonYear}`}
							><img src="/assets/event-resources/statbotics.ico" alt="Statbotics" /></Button
						>
						<Button
							variant="secondary"
							element="a"
							href={`https://www.match13.com/team/${team.teamNumber}?year=${team.seasonYear}`}
							><img src="/assets/event-resources/match13.png" alt="Match13" /></Button
						>
					</DensityProvider>
				</nav>
			</div>
			<div class="identity">
				<div class="team-logo">
					{#if team.avatar}<img
							src={team.avatar}
							alt=""
							hidden={failedAvatar}
							on:error={() => (failedAvatar = true)}
						/>{/if}
					{#if !team.avatar || failedAvatar}<span>{team.teamNumber}</span>{/if}
				</div>
				<div>
					<span class="number">{team.teamNumber}</span>
					<h1>{team.name}</h1>
					<p>{location}</p>
				</div>
			</div>
		</header>
	{/key}

	<section aria-labelledby="events-heading">
		<div class="section-heading">
			<h2 id="events-heading">Events</h2>
			<select
				aria-label="Season"
				bind:value={selectedYear}
				on:change={() => goto(`/teams/${team.teamNumber}/${selectedYear}`)}
			>
				{#each team.seasonYears as year}<option value={year}>{year}</option>{/each}
			</select>
		</div>
		<div class="events">
			{#each team.tournaments as event (event.key)}
				{@const photo = eventWallpaper(event.district?.abbreviation, event.location, event.key)}
				<a
					class="event"
					class:portrait={photo.fit === 'contain'}
					href={`/tournaments/${event.key}`}
				>
					<img
						class="wallpaper"
						src={photo.image}
						style:object-position={photo.position}
						style:object-fit={photo.fit ?? 'cover'}
						alt=""
						loading="lazy"
					/>
					<div>
						<strong>{event.name}</strong><span
							>{[event.location, event.week !== null ? `Week ${event.week + 1}` : null]
								.filter(Boolean)
								.join(' · ')}</span
						>
						{#if event.awards.length}<div class="awards">
								{#each event.awards as award}<span>{award}</span>{/each}
							</div>{/if}
					</div>
					<span class="dates"
						><span>{date(event.startDate)}</span
						>{#if event.endDate && event.endDate !== event.startDate}<span>–</span><span
								>{date(event.endDate)}</span
							>{/if}</span
					>
				</a>
			{:else}<p>No events imported for this season.</p>{/each}
		</div>
	</section>
	{#if photoCredits.length}<details class="photo-credits">
			<summary>Photo credits</summary>{#each photoCredits as photo}<p>
					<a href={photo.source}>{photo.label}</a> · {photo.author} · {#if photo.licenseUrl}<a
							href={photo.licenseUrl}>{photo.license}</a
						>{:else}{photo.license}{/if}
				</p>{/each}
		</details>{/if}
</main>

<style>
	main {
		max-width: 1160px;
		margin: 0 auto;
		padding: 44px 26px 64px;
		color: var(--on-background);
	}
	header {
		--team-color: 130, 130, 130;
		border: 1px solid var(--light-gray);
		border-radius: 8px;
		padding: 28px;
		background:
			linear-gradient(110deg, rgba(var(--team-color), 0.3), transparent 85%),
			var(--secondary-container);
	}
	.header-top,
	.section-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
	}
	.breadcrumbs {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		font-size: 14px;
	}
	a {
		color: inherit;
		text-decoration: none;
	}
	.breadcrumbs a {
		color: var(--victory-purple);
	}
	.team-links {
		display: flex;
		gap: 8px;
		flex-shrink: 0;
		margin-left: auto;
	}
	.team-links img {
		width: 28px;
		height: 28px;
		object-fit: contain;
	}
	.identity {
		display: flex;
		align-items: center;
		gap: 24px;
		margin-top: 32px;
	}
	.team-logo {
		width: 100px;
		height: 100px;
		flex-shrink: 0;
		background: rgba(var(--team-color), 0.18);
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.team-logo img {
		width: 80px;
		height: 80px;
		object-fit: contain;
	}
	.team-logo img[hidden] {
		display: none;
	}
	.number {
		font-size: 24px;
		font-weight: 500;
	}
	h1 {
		font-size: clamp(24px, 3.8vw, 38px);
		font-weight: 500;
		margin: 5px 0 8px;
	}
	p {
		color: var(--body);
		margin: 0;
	}
	section {
		margin-top: 28px;
	}
	h2 {
		font-size: 24px;
		font-weight: 500;
		margin: 0;
	}
	.section-heading {
		margin-bottom: 20px;
	}
	select {
		background: var(--secondary-container);
		color: var(--on-background);
		border: 1px solid var(--light-gray);
		border-radius: 7px;
		padding: 8px 12px;
		font: inherit;
	}
	.events {
		display: grid;
		gap: 10px;
	}
	.event {
		position: relative;
		isolation: isolate;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 20px;
		border: 1px solid var(--light-gray);
		border-radius: 7px;
		min-height: 108px;
		color: #fff;
	}
	.wallpaper {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		z-index: -2;
	}
	.event::before {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(90deg, rgba(15, 15, 15, 0.85), rgba(15, 15, 15, 0.5));
		z-index: -1;
	}
	.event > div {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	strong {
		font-weight: 500;
	}
	.event span {
		font-size: 12px;
		color: #ddd;
	}
	.dates {
		display: flex;
		gap: 6px;
		white-space: nowrap;
		flex-shrink: 0;
	}
	.awards {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		margin-top: 6px;
	}
	.awards span {
		color: #ffe082;
		background: rgba(255, 213, 79, 0.13);
		border-radius: 4px;
		padding: 5px 8px;
	}
	.event:hover {
		border-color: var(--victory-purple);
	}
	a:focus-visible,
	select:focus-visible {
		outline: 2px solid var(--victory-purple);
		outline-offset: 3px;
	}
	.photo-credits {
		margin-top: 20px;
		font-size: 11px;
		color: var(--body);
	}
	.photo-credits summary {
		cursor: pointer;
	}
	.photo-credits p {
		margin-top: 8px;
	}
	@media (max-width: 600px) {
		main {
			padding: 26px 20px 44px;
		}
		header {
			padding: 24px;
		}
		.header-top {
			flex-wrap: wrap;
			gap: 16px;
		}
		.identity {
			gap: 16px;
		}
		.team-logo {
			width: 72px;
			height: 72px;
		}
		.team-logo img {
			width: 56px;
			height: 56px;
		}
		.event {
			align-items: flex-start;
			flex-direction: column;
			gap: 10px;
		}
	}

	.event.portrait {
		background: #181818;
		min-height: 144px;
		padding-right: 150px;
		flex-direction: column;
		align-items: flex-start;
		justify-content: center;
		gap: 12px;
	}

	.event.portrait img {
		left: auto;
		width: 140px;
	}

	.event.portrait::before {
		background: linear-gradient(90deg, #181818 50%, transparent 100%);
	}
</style>
