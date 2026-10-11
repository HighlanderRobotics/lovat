<script lang="ts">
	import { districtWallpaper, eventWallpaper } from '$lib/tournaments/wallpaper';
	import { nestedEvents } from '$lib/tournaments/eventHierarchy';
	import type { PageData } from './$types';

	export let data: PageData;

	let search = '';

	$: season = data.season;
	$: matchingEvents = season.tournaments.filter((event) =>
		`${event.name} ${event.location ?? ''} ${event.key}`
			.toLowerCase()
			.includes(search.trim().toLowerCase())
	);
	$: matchingParents = new Set(matchingEvents.map((event) => event.parentTournamentKey));
	$: filteredEvents = season.tournaments.filter(
		(event) => matchingEvents.includes(event) || matchingParents.has(event.key)
	);
	$: eventGroups = groupEvents(filteredEvents);
	$: photoCredits = [
		...new Map(
			[
				...season.districtSeasons.map((district) => districtWallpaper(district.abbreviation)),
				...season.tournaments.map((event) => eventWallpaper(undefined, event.location, event.key))
			].map((photo) => [photo.image, photo] as const)
		).values()
	];

	function groupEvents(events: PageData['season']['tournaments']) {
		const groups = new Map<string, { label: string; order: number; events: typeof events }>();

		for (const event of events) {
			const championship = event.eventType === 3 || event.eventType === 4;
			const label = championship
				? 'Worlds'
				: event.eventType === 100
					? 'Preseason'
					: event.eventType === 99
						? 'Offseason'
						: event.week !== null
							? `Week ${event.week + 1}`
							: 'Other events';
			const order = championship
				? 100
				: event.eventType === 100
					? -100
					: event.eventType === 99
						? 102
						: (event.week ?? 101);
			let group = groups.get(label);

			if (!group) {
				group = { label, order, events: [] };
				groups.set(label, group);
			}

			group.events.push(event);
		}

		return [...groups.values()].sort((a, b) => a.order - b.order);
	}

	function date(value: string | null) {
		if (!value) return 'Date TBD';

		return new Intl.DateTimeFormat('en-US', {
			timeZone: 'UTC',
			month: 'short',
			day: 'numeric'
		}).format(new Date(value));
	}
</script>

<svelte:head>
	<title>{season.year} Season | Lovat</title>
	<meta name="description" content={`FRC districts and events for the ${season.year} season.`} />
</svelte:head>

<main class:season-wallpaper={season.year === 2026}>
	{#if season.year === 2026}
		<img class="season-background" src="/assets/2026-season-background.jpg" alt="" />
	{/if}
	<header>
		<h1>{season.year} Season</h1>
		{#if season.gameName}<p>{season.gameName}</p>{/if}
	</header>

	<section aria-labelledby="districts-heading">
		<h2 id="districts-heading">Districts</h2>
		<div class="districts">
			{#each season.districtSeasons as district (district.key)}
				{@const photo = districtWallpaper(district.abbreviation)}
				<a class="district" href={`/${district.abbreviation}/${season.year}`}>
					<img src={photo.image} style:object-position={photo.position} alt="" loading="lazy" />
					<strong>{district.name}</strong>
				</a>
			{:else}<p>No districts imported yet.</p>{/each}
		</div>
	</section>

	<section aria-labelledby="events-heading">
		<div class="events-heading">
			<h2 id="events-heading">Events</h2>
			<input
				type="search"
				aria-label="Search events"
				placeholder="Search events"
				bind:value={search}
			/>
		</div>
		<div class="events">
			{#each eventGroups as group (group.label)}
				<div class="event-group">
					<h3>{group.label}</h3>
					{#each nestedEvents(group.events) as { event, nested, name } (event.key)}
						{@const photo = eventWallpaper(undefined, event.location, event.key)}
						<a
							class="event"
							class:portrait={photo.fit === 'contain'}
							class:nested
							href={`/tournaments/${event.key}`}
						>
							<img
								src={photo.image}
								style:object-position={photo.position}
								style:object-fit={photo.fit ?? 'cover'}
								alt=""
								loading="lazy"
							/>
							<div>
								<strong>{name}</strong><span>{event.location ?? ''}</span>
							</div>
							<span class="dates">
								<span>{date(event.startDate)}</span>
								{#if event.endDate && event.endDate !== event.startDate}
									<span>–</span><span>{date(event.endDate)}</span>
								{/if}
							</span>
						</a>
					{/each}
				</div>
			{:else}<p>{search ? 'No events found.' : 'No events imported yet.'}</p>{/each}
		</div>
	</section>
	<details class="photo-credits">
		<summary>Media credits</summary>
		{#if season.year === 2026}<p>
				<a
					href="https://www.chiefdelphi.com/t/frc-photography-through-an-artistic-experimental-lens-frc5193-2026-photo-showcase-incl-fim-tc-and-esky-comps-fim-dcmp/519222"
					>Season background</a
				> · Alex, FRC 5193 Pantheon
			</p>{/if}
		{#each photoCredits as photo}<p>
				<a href={photo.source}>{photo.label}</a> · {photo.author} ·
				{#if photo.licenseUrl}<a href={photo.licenseUrl}>{photo.license}</a
					>{:else}{photo.license}{/if}
			</p>{/each}
	</details>
</main>

<style>
	main {
		max-width: 1160px;
		margin: 0 auto;
		padding: 44px 26px 64px;
		color: var(--on-background);
	}
	.season-wallpaper {
		position: relative;
		isolation: isolate;
	}

	.season-background {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100vh;
		object-fit: cover;
		object-position: center 70%;
		z-index: -2;
	}

	.season-wallpaper::before {
		content: '';
		position: fixed;
		inset: 0;
		background: rgba(15, 15, 18, 0.8);
		z-index: -1;
	}

	.season-wallpaper h1,
	.season-wallpaper h2,
	.season-wallpaper h3 {
		color: #fff;
	}

	.season-wallpaper > header p {
		color: #ddd;
	}

	h1 {
		font-size: clamp(28px, 3.8vw, 42px);
		font-weight: 500;
		margin: 0 0 14px;
	}
	h2 {
		font-size: 24px;
		font-weight: 500;
		margin: 0 0 20px;
	}
	section {
		margin-top: 28px;
	}
	p {
		color: var(--body);
	}
	.districts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 10px;
	}
	.events {
		display: grid;
		gap: 10px;
	}
	a {
		padding: 16px;
		border: 1px solid var(--light-gray);
		border-radius: 7px;
		background: var(--secondary-container);
		color: var(--on-background);
		text-decoration: none;
	}
	a:hover {
		border-color: var(--victory-purple);
	}
	a:focus-visible {
		outline: 2px solid var(--victory-purple);
		outline-offset: 3px;
	}
	.district,
	.event {
		position: relative;
		isolation: isolate;
		overflow: hidden;
		color: #fff;
		min-height: 100px;
	}
	.district {
		display: flex;
		align-items: end;
	}
	.district img,
	.event img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		z-index: -2;
	}
	.district::before,
	.event::before {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(90deg, rgba(15, 15, 15, 0.85), rgba(15, 15, 15, 0.5));
		z-index: -1;
	}
	.events-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 20px;
	}
	.events-heading h2 {
		margin: 0;
	}
	input {
		width: 210px;
		min-width: 0;
		padding: 8px 12px;
		border: 1px solid var(--light-gray);
		border-radius: 7px;
		background: var(--secondary-container);
		color: var(--on-background);
		font: inherit;
		font-size: 13px;
	}
	input:focus-visible {
		outline: 2px solid var(--victory-purple);
	}
	.event.nested {
		margin-left: 24px;
		border-left: 2px solid var(--light-gray);
		min-height: 88px;
	}
	.event-group {
		display: grid;
		gap: 10px;
	}
	.event-group + .event-group {
		margin-top: 18px;
	}
	h3 {
		margin: 0 0 4px;
		font-size: 18px;
		font-weight: 500;
	}
	.photo-credits {
		margin-top: 20px;
		font-size: 11px;
		color: var(--body);
	}
	.photo-credits a {
		padding: 0;
		border: 0;
		background: none;
	}
	.photo-credits summary {
		cursor: pointer;
	}
	.event {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
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
	}
	@media (max-width: 600px) {
		main {
			padding: 26px 20px 44px;
		}
		.event {
			align-items: flex-start;
			flex-direction: column;
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
