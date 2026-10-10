<script lang="ts">
	import { tick } from 'svelte';
	import { Button, DensityProvider, Select, TextField } from 'magnolia-ui-svelte';
	import type { PageData } from './$types';

	export let data: PageData;

	type Match = PageData['tournament']['matches'][number];

	let view = 'schedule';
	let day = 'all';
	let phase = 'all';
	let completion = 'all';
	let teamFilter = '';

	$: tournament = data.tournament;
	$: timezone = validTimezone(tournament.timezone);
	$: days = [...new Set(tournament.matches.map((match) => dateKey(matchTime(match))))];
	$: gapsAfter = new Map(tournament.gaps.map((gap) => [gap.afterMatchKey, gap]));
	$: filteredMatches = tournament.matches.filter(
		(match) =>
			(day === 'all' || dateKey(matchTime(match)) === day) &&
			(phase === 'all' ||
				(phase === 'qualification') === (match.competitionLevel === 'QUALIFICATION')) &&
			(completion === 'all' || (completion === 'finished') === (match.status === 'COMPLETED')) &&
			(!teamFilter.trim() ||
				match.teamSlots.some((slot) => String(slot.teamNumber) === teamFilter.trim()))
	);
	$: filteredTeams = tournament.teams.filter(({ team }) =>
		`${team.number} ${team.name}`.toLowerCase().includes(teamFilter.trim().toLowerCase())
	);

	function validTimezone(value: string | null) {
		try {
			new Intl.DateTimeFormat('en-US', { timeZone: value ?? 'UTC' }).format();
			return value ?? 'UTC';
		} catch {
			return 'UTC';
		}
	}

	function matchTime(match: Match) {
		return match.actualTime ?? match.predictedTime ?? match.scheduledTime;
	}

	function dateKey(value: string | null) {
		if (!value) return 'unknown';

		return new Intl.DateTimeFormat('en-CA', {
			timeZone: timezone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit'
		}).format(new Date(value));
	}

	function time(value: string | null) {
		if (!value) return 'Time TBD';

		return new Intl.DateTimeFormat('en-US', {
			timeZone: timezone,
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		}).format(new Date(value));
	}

	function dayLabel(value: string) {
		if (value === 'unknown') return 'Time TBD';

		return new Intl.DateTimeFormat('en-US', {
			timeZone: 'UTC',
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		}).format(new Date(`${value}T12:00:00Z`));
	}

	function matchLabel(match: Match) {
		if (match.competitionLevel === 'QUALIFICATION') return `Qualification ${match.matchNumber}`;

		if (match.competitionLevel === 'FINAL') {
			return match.matchNumber === 3 ? 'Finals Tiebreaker' : `Finals Match ${match.matchNumber}`;
		}

		// This event uses the eight-alliance double-elimination bracket.
		if (match.competitionLevel === 'SEMIFINAL') {
			const round =
				match.setNumber <= 4
					? 1
					: match.setNumber <= 8
						? 2
						: match.setNumber <= 10
							? 3
							: match.setNumber <= 12
								? 4
								: 5;

			return `Elimination Match ${match.setNumber} · Round ${round}`;
		}

		const stage = match.competitionLevel === 'QUARTERFINAL' ? 'Quarterfinal' : 'Eighthfinal';

		return `${stage} ${match.setNumber} · Match ${match.matchNumber}`;
	}

	async function jumpToEliminations() {
		view = 'schedule';
		day = 'all';
		phase = 'all';
		completion = 'all';
		teamFilter = '';

		await tick();

		const firstElimination = document.getElementById('eliminations');

		firstElimination?.scrollIntoView({ block: 'start' });
		firstElimination?.focus({ preventScroll: true });
	}

	const gapLabels = {
		LUNCH: 'Break for lunch',
		OVERNIGHT: 'End of day / overnight',
		PLAYOFF_TRANSITION: 'Qualification → playoffs',
		DELAY: 'Delay',
		BREAK: 'Break'
	};
</script>

<svelte:head>
	<title>{tournament.name} | Lovat</title>
	<meta
		name="description"
		content="Explore the 2026 California Northern State Championship schedule, match results, teams, and tournament breaks in Lovat."
	/>
</svelte:head>

<main>
	<header class="event-header">
		<div>
			<nav class="eyebrow breadcrumbs" aria-label="Event hierarchy">
				<span>2026</span><span aria-hidden="true">&gt;</span><span>FIRST California</span><span
					aria-hidden="true">&gt;</span
				><span aria-current="page">Northern State Championship</span>
			</nav>
			<h1>{tournament.name}</h1>
			<p class="event-meta">
				{tournament.location ?? 'Location unavailable'}
				{#if tournament.startDate && tournament.endDate}
					· {dayLabel(tournament.startDate.slice(0, 10))} – {dayLabel(
						tournament.endDate.slice(0, 10)
					)}
				{/if}
			</p>
		</div>
	</header>

	<nav class="event-links" aria-label="Event resources">
		<DensityProvider density="compact">
			<Button
				variant="secondary"
				element="a"
				href="https://www.thebluealliance.com/event/2026cancmp"
				><img src="/assets/event-resources/tba.svg" alt="TBA" /></Button
			>
			<Button
				variant="secondary"
				element="a"
				href="https://frc-events.firstinspires.org/2026/CANCMP"
				><img src="/assets/event-resources/first.png" alt="FIRST" /></Button
			>
			<Button variant="secondary" element="a" href="https://www.statbotics.io/event/2026cancmp"
				><img src="/assets/event-resources/statbotics.ico" alt="Statbotics" /></Button
			>
			<Button variant="secondary" element="a" href="https://www.match13.com/event/2026cancmp"
				><img src="/assets/event-resources/match13.png" alt="Match13" /></Button
			>
		</DensityProvider>
	</nav>

	<div class="section-nav" aria-label="Tournament views">
		<DensityProvider density="compact">
			<Button
				variant={view === 'schedule' ? 'primary' : 'text-only-secondary'}
				on:click={() => {
					view = 'schedule';
					teamFilter = '';
				}}>Schedule & results</Button
			>
			<Button
				variant={view === 'teams' ? 'primary' : 'text-only-secondary'}
				on:click={() => {
					view = 'teams';
					teamFilter = '';
				}}>Teams</Button
			>
			<Button variant="text-only-secondary" on:click={jumpToEliminations}
				>Jump to eliminations</Button
			>
		</DensityProvider>
	</div>

	{#if view === 'schedule'}
		<section aria-labelledby="schedule-heading">
			<div class="section-heading">
				<div>
					<h2 id="schedule-heading">Match schedule</h2>
				</div>
				<span class="count" aria-live="polite">{filteredMatches.length} matches</span>
			</div>

			<div class="filters">
				<div class="team-filter">
					<label for="schedule-team">Filter by team</label><TextField
						id="schedule-team"
						bind:value={teamFilter}
						placeholder="Team number"
					/>
				</div>
				<div>
					<label for="match-phase">Match type</label><Select
						id="match-phase"
						bind:value={phase}
						items={[
							{ value: 'all', label: 'All matches' },
							{ value: 'qualification', label: 'Qualifications' },
							{ value: 'playoff', label: 'Playoffs' }
						]}
					/>
				</div>
				<div>
					<label for="match-completion">Status</label><Select
						id="match-completion"
						bind:value={completion}
						items={[
							{ value: 'all', label: 'All statuses' },
							{ value: 'upcoming', label: 'Unfinished' },
							{ value: 'finished', label: 'Finished' }
						]}
					/>
				</div>
			</div>

			<nav class="days" aria-label="Schedule days">
				<button
					class:active={day === 'all'}
					aria-pressed={day === 'all'}
					on:click={() => (day = 'all')}>All days</button
				>
				{#each days as date}<button
						class:active={day === date}
						aria-pressed={day === date}
						on:click={() => (day = date)}>{dayLabel(date)}</button
					>{/each}
			</nav>

			<div class="schedule">
				{#each filteredMatches as match, index (match.key)}
					{#if index === 0 || dateKey(matchTime(filteredMatches[index - 1])) !== dateKey(matchTime(match))}
						<h3 class="day-heading">{dayLabel(dateKey(matchTime(match)))}</h3>
					{/if}
					<article
						class="match-card"
						id={match.competitionLevel !== 'QUALIFICATION' &&
						!filteredMatches
							.slice(0, index)
							.some((previous) => previous.competitionLevel !== 'QUALIFICATION')
							? 'eliminations'
							: undefined}
						tabindex="-1"
						aria-label={matchLabel(match)}
					>
						<div class="match-header">
							<div class="match-title">
								<h4>{matchLabel(match)}</h4>
								<span class="badge">{match.status.replaceAll('_', ' ')}</span>
							</div>
							<div class="timing">
								<span>Scheduled time <strong>{time(match.scheduledTime)}</strong></span>
								{#if match.actualTime}<span
										>Actual time <strong>{time(match.actualTime)}</strong></span
									>{/if}
							</div>
						</div>
						<div class="alliances">
							{#each ['BLUE', 'RED'] as color}
								<div class="alliance" class:red={color === 'RED'} class:blue={color === 'BLUE'}>
									<div class="alliance-label">
										<span class="score" class:winner={match.winningAlliance === color}
											>{match.alliances.find((alliance) => alliance.color === color)?.score ??
												'—'}</span
										>
									</div>
									<div class="participants">
										{#each match.teamSlots.filter((slot) => slot.alliance === color) as slot}
											<button
												class="team-number"
												class:highlighted={teamFilter.trim() === String(slot.teamNumber)}
												on:click={() => (teamFilter = String(slot.teamNumber))}
												aria-label={`Show matches for team ${slot.teamNumber}`}
												><strong>{slot.teamNumber}</strong
												>{#if slot.surrogate || slot.disqualified}<span
														>{#if slot.surrogate}S{/if}{#if slot.surrogate && slot.disqualified}
															·
														{/if}{#if slot.disqualified}DQ{/if}</span
													>{/if}</button
											>
										{/each}
										{#if !match.teamSlots.some((slot) => slot.alliance === color)}<span
												>Teams TBD</span
											>{/if}
									</div>
								</div>
							{/each}
						</div>
					</article>
					{@const gap = gapsAfter.get(match.key)}
					{#if gap && !teamFilter && phase === 'all' && completion === 'all'}
						<div class="break-row">
							<div>
								<strong>{gapLabels[gap.type]}</strong>
							</div>
							<div>
								{time(gap.startTime)} – {#if dateKey(gap.startTime) !== dateKey(gap.endTime)}{dayLabel(
										dateKey(gap.endTime)
									)}
								{/if}{time(gap.endTime)}
							</div>
						</div>
					{/if}
				{:else}
					<div class="empty">
						<h3>No matches found</h3>
						<Button
							variant="secondary"
							on:click={() => {
								teamFilter = '';
								day = 'all';
								phase = 'all';
								completion = 'all';
							}}>Clear filters</Button
						>
					</div>
				{/each}
			</div>
		</section>
	{:else}
		<section aria-labelledby="teams-heading">
			<div class="section-heading">
				<div>
					<h2 id="teams-heading">Teams at this event</h2>
				</div>
				<span class="count">{filteredTeams.length} teams</span>
			</div>
			<div class="roster-filter">
				<label for="roster-search">Find a team</label><TextField
					id="roster-search"
					bind:value={teamFilter}
					placeholder="Team number or name"
				/>
			</div>
			<div class="roster">
				{#each filteredTeams as { team }}<button
						class="team-card"
						on:click={() => {
							teamFilter = String(team.number);
							view = 'schedule';
							day = 'all';
							phase = 'all';
							completion = 'all';
						}}><strong>{team.number}</strong><span>{team.name}</span></button
					>{:else}<p>No teams match your search.</p>{/each}
			</div>
		</section>
	{/if}
</main>

<style>
	main {
		max-width: 1160px;
		margin: 0 auto;
		padding: 44px 26px 64px;
		color: var(--on-background);
	}
	.event-header,
	.section-heading {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 24px;
	}
	.event-links {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin: 20px 0 24px;
	}
	.event-links img {
		width: 28px;
		height: 28px;
		object-fit: contain;
	}
	.event-header > div {
		max-width: 820px;
	}
	h1 {
		font-size: clamp(28px, 3.8vw, 42px);
		font-weight: 500;
		line-height: 1.2;
		margin: 10px 0 14px;
	}
	h2 {
		font-size: 24px;
		font-weight: 500;
		margin: 0 0 5px;
	}
	p {
		color: var(--body);
		margin: 0;
		line-height: 1.6;
	}
	.breadcrumbs {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.eyebrow {
		color: var(--victory-purple);
		font-size: 14px;
	}
	.section-nav {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		border-bottom: 1px solid var(--light-gray);
		padding-bottom: 16px;
		margin-bottom: 28px;
	}
	.count {
		color: var(--body);
		font-size: 14px;
	}
	.filters {
		display: grid;
		grid-template-columns: 1fr 220px 200px;
		gap: 16px;
		margin: 24px 0 16px;
	}
	label {
		display: block;
		color: var(--body);
		font-size: 13px;
		margin-bottom: 6px;
	}
	.team-filter :global(.input),
	.roster-filter :global(.input) {
		display: flex;
		width: 100%;
	}
	.days {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		margin-bottom: 12px;
	}
	.days button {
		padding: 8px 14px;
		border: 0;
		background: transparent;
		border-radius: 7px;
		color: var(--on-background);
		cursor: pointer;
		font-size: 14px;
	}
	.days button.active {
		background: var(--light-gray);
	}
	.schedule {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.day-heading {
		margin: 24px 0 6px;
		font-size: 18px;
		font-weight: 500;
	}
	.match-card {
		scroll-margin-top: 90px;
		overflow: hidden;
		border-radius: 7px;
		background: var(--secondary-container);
	}
	.match-header {
		padding: 12px 16px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
	}
	.match-title {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
	}
	h4 {
		margin: 0;
		font-size: 15px;
		font-weight: 500;
	}
	.badge {
		background: var(--light-gray);
		border-radius: 5px;
		padding: 5px 7px;
		font-size: 10px;
		letter-spacing: 0.4px;
	}
	.timing {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		font-variant-numeric: tabular-nums;
	}
	.timing strong {
		font-size: 14px;
		font-weight: 500;
	}
	.timing span {
		font-size: 11px;
		color: var(--body);
	}
	.alliances {
		display: grid;
		grid-template-columns: 1fr 1fr;
	}
	/* Alliance tokens shared with Dashboard's darkColorScheme. */
	.alliance {
		padding: 12px 16px;
		min-width: 0;
	}
	.red {
		background: #793f3f;
	}
	.blue {
		background: #364077;
	}
	.alliance-label {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		margin-bottom: 8px;
		font-size: 12px;
	}
	.score {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 20px;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}
	.score.winner {
		text-decoration: underline;
		text-underline-offset: 4px;
	}
	.participants {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 10px;
	}
	.team-number {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--on-background);
		cursor: pointer;
		text-align: left;
	}
	.team-number strong {
		font-size: 20px;
		font-weight: 400;
	}
	.team-number span {
		font-size: 11px;
		color: #d0a2a2;
	}
	.blue .team-number span {
		color: #a2a7d0;
	}
	.team-number.highlighted strong,
	.team-number:hover strong {
		text-decoration: underline;
		text-underline-offset: 4px;
	}
	.break-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
		padding: 16px;
		font-size: 13px;
		color: var(--body);
	}
	.break-row strong {
		display: block;
		font-weight: 500;
		color: var(--on-background);
	}
	.roster-filter {
		max-width: 380px;
		margin: 24px 0;
	}
	.roster {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 12px;
	}
	.team-card {
		border: 0;
		border-radius: 10px;
		background: var(--secondary-container);
		padding: 16px;
		color: var(--on-background);
		text-align: left;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.team-card strong {
		color: var(--victory-purple);
		font-size: 22px;
		font-weight: 500;
	}
	.team-card span {
		font-size: 13px;
		color: var(--body);
	}
	.team-card:hover {
		background: var(--light-gray);
	}
	button:focus-visible {
		outline: 2px solid var(--victory-purple);
		outline-offset: 4px;
	}
	.empty {
		padding: 40px 20px;
		text-align: center;
		background: var(--secondary-container);
		border-radius: 10px;
	}
	@media (max-width: 720px) {
		main {
			padding: 26px 20px 44px;
		}
		.event-header {
			align-items: flex-start;
			flex-direction: column;
			gap: 14px;
		}
		.filters {
			grid-template-columns: 1fr 1fr;
			gap: 12px;
		}
		.team-filter {
			grid-column: 1 / -1;
		}
		.alliances {
			grid-template-columns: 1fr;
		}
		.match-header {
			padding: 10px;
		}
		.match-title {
			max-width: 55%;
		}
		.timing {
			max-width: 45%;
			text-align: right;
		}
		.alliance {
			padding: 10px;
		}
		.roster {
			grid-template-columns: repeat(2, 1fr);
		}
		.break-row {
			align-items: flex-start;
			padding: 12px 10px;
		}
		.break-row > div:last-child {
			text-align: right;
		}
	}
</style>
