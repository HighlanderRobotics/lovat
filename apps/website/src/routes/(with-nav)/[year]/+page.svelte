<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;

	$: season = data.season;

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

<main>
	<header>
		<h1>{season.year} Season</h1>
		{#if season.gameName}<p>{season.gameName}</p>{/if}
	</header>

	<section aria-labelledby="districts-heading">
		<h2 id="districts-heading">Districts</h2>
		<div class="districts">
			{#each season.districtSeasons as district (district.key)}
				<a href={`/${district.abbreviation}/${season.year}`}>{district.name}</a>
			{:else}<p>No districts imported yet.</p>{/each}
		</div>
	</section>

	<section aria-labelledby="events-heading">
		<h2 id="events-heading">Events</h2>
		<div class="events">
			{#each season.tournaments as event (event.key)}
				<a class="event" href={`/tournaments/${event.key}`}>
					<div><strong>{event.name}</strong><span>{event.location ?? ''}</span></div>
					<span class="dates">
						<span>{date(event.startDate)}</span>
						{#if event.endDate && event.endDate !== event.startDate}
							<span>–</span><span>{date(event.endDate)}</span>
						{/if}
					</span>
				</a>
			{:else}<p>No events imported yet.</p>{/each}
		</div>
	</section>
</main>

<style>
	main {
		max-width: 1160px;
		margin: 0 auto;
		padding: 44px 26px 64px;
		color: var(--on-background);
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
		color: var(--body);
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
</style>
