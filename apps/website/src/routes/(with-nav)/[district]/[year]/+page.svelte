<script lang="ts">
	import { Button, DensityProvider } from 'magnolia-ui-svelte';
	import { avatarGradient, lazyAvatar } from '$lib/tournaments/branding';
	import { eventWallpaper } from '$lib/tournaments/wallpaper';
	import type { PageData } from './$types';

	export let data: PageData;

	let view = 'events';
	let failedAvatars = new Set<string>();

	$: district = data.district;
	$: events = district.tournaments;
	$: eventGroups = groupEvents(events);

	function groupEvents(tournaments: PageData['district']['tournaments']) {
		const groups = new Map<string, { label: string; order: number; events: typeof tournaments }>();

		for (const event of tournaments) {
			const championship = event.eventType === 2 || event.eventType === 5;
			const label = championship
				? 'Championship'
				: event.week !== null
					? `Week ${event.week + 1}`
					: 'Other events';
			const order = championship ? 100 : (event.week ?? 101);
			let group = groups.get(label);

			if (!group) {
				group = { label, order, events: [] };
				groups.set(label, group);
			}

			group.events.push(event);
		}

		return [...groups.values()].sort((a, b) => a.order - b.order);
	}

	$: teams = district.teamSeasons;

	$: photoCredits = [
		...new Map(
			district.tournaments.map((event) => {
				const photo = eventWallpaper(district.abbreviation, event.location);

				return [photo.image, photo] as const;
			})
		).values()
	];

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
	<title>{district.name} {district.seasonYear} | Lovat</title>
	<meta
		name="description"
		content={`${district.name} events and teams for ${district.seasonYear}.`}
	/>
</svelte:head>

<main>
	<header>
		<nav class="breadcrumbs" aria-label="District hierarchy">
			<span>{district.seasonYear}</span><span aria-hidden="true">&gt;</span><span
				aria-current="page">{district.name}</span
			>
		</nav>
		<h1>{district.name}</h1>
	</header>

	<div class="section-nav" aria-label="District views">
		<DensityProvider density="compact">
			<Button
				variant={view === 'events' ? 'primary' : 'text-only-secondary'}
				on:click={() => {
					view = 'events';
				}}>Events</Button
			>
			<Button
				variant={view === 'teams' ? 'primary' : 'text-only-secondary'}
				on:click={() => {
					view = 'teams';
				}}>Teams</Button
			>
		</DensityProvider>
	</div>

	<section aria-labelledby="list-heading">
		<div class="section-heading">
			<h2 id="list-heading">{view === 'events' ? 'Events' : 'Teams'}</h2>
			<span
				>{view === 'events' ? events.length : teams.length}
				{view === 'events' ? 'events' : 'teams'}</span
			>
		</div>

		<div class="list">
			{#if view === 'events'}
				{#each eventGroups as group (group.label)}
					<div class="event-group">
						<h3>{group.label}</h3>
						{#each group.events as event (event.key)}
							{@const photo = eventWallpaper(district.abbreviation, event.location)}
							<a class="event-row" class:has-wallpaper={!!photo} href={`/tournaments/${event.key}`}>
								{#if photo}<img
										class="town-wallpaper"
										src={photo.image}
										style:object-position={photo.position}
										alt=""
										loading="lazy"
									/>{/if}
								<div><strong>{event.name}</strong><span>{event.location ?? ''}</span></div>
								<span class="dates">
									<span>{date(event.startDate)}</span>
									{#if event.endDate && event.endDate !== event.startDate}
										<span class="date-separator">–</span>
										<span>{date(event.endDate)}</span>
									{/if}
								</span>
							</a>
						{/each}
					</div>
				{:else}<p>No events found.</p>{/each}
			{:else}
				{#each teams as team (`${district.key}:${team.teamNumber}`)}
					<div class="team-row" use:avatarGradient>
						<div class="team-logo">
							<img
								use:lazyAvatar
								data-src={`/team-avatars/${district.seasonYear}/${team.teamNumber}`}
								alt=""
								hidden={failedAvatars.has(`${district.key}:${team.teamNumber}`)}
								on:error={() => {
									failedAvatars = new Set([...failedAvatars, `${district.key}:${team.teamNumber}`]);
								}}
							/><span class="logo-fallback">{team.teamNumber}</span>
						</div>
						<div class="team-identity">
							<strong>{team.teamNumber}</strong><span>{team.name}</span>
						</div>
					</div>
				{:else}<p>No teams found.</p>{/each}
			{/if}
		</div>
		{#if view === 'events' && photoCredits.length}
			<details class="photo-credits">
				<summary>Photo credits</summary>
				{#each photoCredits as photo}<p>
						<a href={photo.source}>{photo.label}</a> · {photo.author} · {#if photo.licenseUrl}<a
								href={photo.licenseUrl}>{photo.license}</a
							>{:else}{photo.license}{/if}
					</p>{/each}
			</details>
		{/if}
	</section>
</main>

<style>
	main {
		max-width: 1160px;
		margin: 0 auto;
		padding: 44px 26px 64px;
		color: var(--on-background);
	}
	.breadcrumbs {
		display: flex;
		gap: 8px;
		color: var(--victory-purple);
		font-size: 14px;
	}
	h1 {
		font-size: clamp(28px, 3.8vw, 42px);
		font-weight: 500;
		margin: 18px 0 28px;
	}
	h2 {
		font-size: 24px;
		font-weight: 500;
		margin: 0;
	}
	.section-nav {
		display: flex;
		gap: 8px;
		border-bottom: 1px solid var(--light-gray);
		padding-bottom: 16px;
	}
	section {
		margin-top: 28px;
	}
	.section-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 20px;
	}
	.section-heading > span {
		color: var(--body);
		font-size: 12px;
	}
	.list {
		display: grid;
		gap: 10px;
	}
	.event-row,
	.team-row {
		padding: 16px;
		border: 1px solid var(--light-gray);
		border-radius: 7px;
		background: var(--secondary-container);
		color: var(--on-background);
		display: flex;
		align-items: center;
		gap: 16px;
		text-decoration: none;
	}
	.event-row {
		position: relative;
		isolation: isolate;
		overflow: hidden;
		min-height: 108px;
		justify-content: space-between;
	}
	.event-row > div,
	.team-row > div {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}
	strong {
		font-weight: 500;
	}
	.event-row > div > span,
	.dates {
		color: var(--body);
		font-size: 12px;
	}
	.dates {
		display: flex;
		align-items: center;
		gap: 6px;
		white-space: nowrap;
		flex-shrink: 0;
	}
	.team-row {
		--team-color: 130, 130, 130;
		padding: 7px;
		gap: 14px;
		background:
			linear-gradient(100deg, rgba(var(--team-color), 0.25), transparent 68%),
			var(--secondary-container);
	}
	.team-logo {
		width: 48px;
		height: 48px;
		flex-shrink: 0;
		background: rgba(var(--team-color), 0.18);
		border-radius: 5px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.team-logo img {
		width: 32px;
		height: 32px;
		object-fit: contain;
	}
	.team-identity strong {
		font-size: 16px;
	}
	.team-identity span {
		font-size: 12px;
		color: var(--body);
	}
	.town-wallpaper {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		z-index: -2;
	}
	.event-row.has-wallpaper::before {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(90deg, rgba(15, 15, 15, 0.85), rgba(15, 15, 15, 0.5));
		z-index: -1;
	}
	.event-row.has-wallpaper strong {
		color: #fff;
	}
	.event-row.has-wallpaper > div > span,
	.event-row.has-wallpaper .dates {
		color: #ddd;
	}
	.event-group {
		display: grid;
		gap: 10px;
	}
	.event-group + .event-group {
		margin-top: 18px;
	}
	.event-group h3 {
		margin: 0 0 4px;
		font-size: 18px;
		font-weight: 500;
	}
	.photo-credits {
		margin-top: 20px;
		font-size: 11px;
		color: var(--body);
	}
	.photo-credits summary {
		cursor: pointer;
	}
	.logo-fallback {
		display: none;
		font-size: 12px;
	}
	.team-logo img[hidden] {
		display: none;
	}
	.team-logo img[hidden] + .logo-fallback {
		display: inline;
	}
	.event-row:hover {
		border-color: var(--victory-purple);
	}
	.event-row:focus-visible {
		outline: 2px solid var(--victory-purple);
		outline-offset: 3px;
	}
	@media (max-width: 600px) {
		main {
			padding: 26px 20px 44px;
		}
		.event-row {
			position: relative;
			isolation: isolate;
			overflow: hidden;
			min-height: 108px;
			align-items: flex-start;
			flex-direction: column;
			gap: 10px;
		}
	}
</style>
