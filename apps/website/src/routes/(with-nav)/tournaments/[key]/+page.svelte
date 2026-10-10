<script lang="ts">
	import { tick } from 'svelte';
	import { Button, DensityProvider, Select, TextField } from 'magnolia-ui-svelte';
	import TournamentAlliances from './TournamentAlliances.svelte';
	import AwardMarker from '$lib/AwardMarker.svelte';
	import { eventWallpaper } from '$lib/tournaments/wallpaper';
	import { avatarGradient } from '$lib/tournaments/branding';
	import type { PageData } from './$types';

	export let data: PageData;

	$: wallpaper = eventWallpaper(tournament.district?.key.slice(4), tournament.location);

	type Match = PageData['tournament']['matches'][number];

	let view = 'schedule';
	let day = 'all';
	let phase = 'all';
	let completion = 'all';
	let teamFilter = '';

	$: tournament = data.tournament;
	$: teamBranding = Object.fromEntries(
		tournament.teams
			.filter(({ team }) => team.avatar)
			.map(({ team }) => [team.number, { logo: team.avatar!, color: '130, 130, 130' }])
	);
	$: eventWinners = awardTeams(1);
	$: impactWinners = awardTeams(0);
	$: year = tournament.seasonYear ?? Number(tournament.key.slice(0, 4));
	$: timezone = validTimezone(tournament.timezone);
	$: teamNames = new Map(tournament.teams.map(({ team }) => [team.number, team.name]));
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

	function awardTeams(type: number) {
		return new Set(
			(tournament.awards ?? [])
				.filter((award) => award.type === type)
				.flatMap((award) => award.recipients.map((recipient) => recipient.teamNumber))
		);
	}

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

		// Only apply double-elimination labels to that format.
		if (match.competitionLevel === 'SEMIFINAL' && tournament.playoffType === 10) {
			const bracketNames: Record<number, string> = {
				1: 'Upper Bracket Round 1',
				2: 'Upper Bracket Round 1',
				3: 'Upper Bracket Round 1',
				4: 'Upper Bracket Round 1',
				5: 'Lower Bracket Round 1',
				6: 'Lower Bracket Round 1',
				7: 'Upper Bracket Round 2',
				8: 'Upper Bracket Round 2',
				9: 'Lower Bracket Round 2',
				10: 'Lower Bracket Round 2',
				11: 'Upper Bracket Final',
				12: 'Lower Bracket Semifinal',
				13: 'Lower Bracket Final'
			};

			return `${bracketNames[match.setNumber]} · Match ${match.setNumber}`;
		}

		const stage =
			match.competitionLevel === 'SEMIFINAL'
				? 'Semifinal'
				: match.competitionLevel === 'QUARTERFINAL'
					? 'Quarterfinal'
					: 'Eighthfinal';

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
		PLAYOFF_TRANSITION: 'Eliminations Begin',
		DELAY: 'Delay',
		BREAK: 'Break'
	};
</script>

<svelte:head>
	<title>{tournament.name} | Lovat</title>
	<meta
		name="description"
		content={`Explore ${tournament.name} schedules, match results, teams, and alliances in Lovat.`}
	/>
</svelte:head>

<main>
	<header class="event-header" class:has-wallpaper={!!wallpaper}>
		{#if wallpaper}<img
				class="town-wallpaper"
				src={wallpaper.image}
				style:object-position={wallpaper.position}
				alt=""
			/>{/if}
		<div>
			<div class="header-top">
				<nav class="eyebrow breadcrumbs" aria-label="Event hierarchy">
					<span>{year}</span>
					{#if tournament.district}
						<span aria-hidden="true">&gt;</span>
						<a href={`/${tournament.district.key.slice(4)}/${year}`}>{tournament.district.name}</a>
					{/if}
					<span aria-hidden="true">&gt;</span><span aria-current="page">{tournament.name}</span>
				</nav>
				<nav class="event-links" aria-label="Event resources">
					<DensityProvider density="compact">
						<Button
							variant="secondary"
							element="a"
							href={`https://www.thebluealliance.com/event/${tournament.key}`}
							><img src="/assets/event-resources/tba.svg" alt="TBA" /></Button
						>
						<Button
							variant="secondary"
							element="a"
							href={`https://frc-events.firstinspires.org/${year}/${tournament.key.slice(4).toUpperCase()}`}
							><img src="/assets/event-resources/first.png" alt="FIRST" /></Button
						>
						<Button
							variant="secondary"
							element="a"
							href={`https://www.statbotics.io/event/${tournament.key}`}
							><img src="/assets/event-resources/statbotics.ico" alt="Statbotics" /></Button
						>
						<Button
							variant="secondary"
							element="a"
							href={`https://www.match13.com/event/${tournament.key}`}
							><img src="/assets/event-resources/match13.png" alt="Match13" /></Button
						>
					</DensityProvider>
				</nav>
			</div>
			<h1>{tournament.name}</h1>
			<p class="event-meta">
				{tournament.location ?? 'Location unavailable'}
				{#if tournament.week !== null}
					· Week {tournament.week + 1}{/if}
				{#if tournament.startDate && tournament.endDate}
					· {dayLabel(tournament.startDate.slice(0, 10))} – {dayLabel(
						tournament.endDate.slice(0, 10)
					)}
				{/if}
			</p>
		</div>
	</header>

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
			<Button
				variant={view === 'alliances' ? 'primary' : 'text-only-secondary'}
				on:click={() => (view = 'alliances')}>Alliances & bracket</Button
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

			<div class="schedule-controls">
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

				<div class="schedule-actions">
					<Button variant="text-only-secondary" on:click={jumpToEliminations}
						>Jump to eliminations</Button
					>
				</div>
			</div>

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
							<div class="scores" aria-label="Alliance scores">
								{#each ['BLUE', 'RED'] as color}
									<span
										class="score"
										class:blue-score={color === 'BLUE'}
										class:red-score={color === 'RED'}
										class:winner={match.winningAlliance === color}
										aria-label={`${color === 'BLUE' ? 'Blue' : 'Red'} alliance score`}
									>
										<span
											>{match.alliances.find((alliance) => alliance.color === color)?.score ??
												'—'}</span
										>
									</span>
									{#if color === 'BLUE'}<span class="score-divider" aria-hidden="true">–</span>{/if}
								{/each}
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
									<div class="participants">
										{#each match.teamSlots.filter((slot) => slot.alliance === color) as slot}
											<button
												class="team-number"
												class:highlighted={teamFilter.trim() === String(slot.teamNumber)}
												on:click={() => (teamFilter = String(slot.teamNumber))}
												aria-label={`Show matches for team ${slot.teamNumber}`}
												><strong>{slot.teamNumber}</strong>
												{#if teamNames.has(slot.teamNumber)}<span class="team-name"
														>{teamNames.get(slot.teamNumber)}</span
													>{/if}{#if slot.surrogate || slot.disqualified}<span
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
								{#if dateKey(gap.startTime) !== dateKey(gap.endTime)}
									{dayLabel(dateKey(gap.startTime))}
									{time(gap.startTime)} – {dayLabel(dateKey(gap.endTime))}
									{time(gap.endTime)}
								{:else}
									{time(gap.startTime)} – {time(gap.endTime)}
								{/if}
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
	{:else if view === 'alliances'}
		<TournamentAlliances {data} />
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
				{#each filteredTeams as { team } (team.number)}<button
						style={`--team-color: ${teamBranding[team.number]?.color ?? '130, 130, 130'}`}
						class="team-card"
						use:avatarGradient
						on:click={() => {
							teamFilter = String(team.number);
							view = 'schedule';
							day = 'all';
							phase = 'all';
							completion = 'all';
						}}
					>
						<div class="team-logo">
							{#if teamBranding[team.number]}<img
									src={teamBranding[team.number].logo}
									alt=""
									loading="lazy"
								/>{:else}<span>{team.number}</span>{/if}
						</div>
						<div class="team-identity"><strong>{team.number}</strong><span>{team.name}</span></div>
						<div class="team-awards">
							{#if eventWinners.has(team.number)}<AwardMarker award="winner" />{/if}
							{#if impactWinners.has(team.number)}<AwardMarker award="impact" />{/if}
						</div>
					</button>{:else}<p>No teams match your search.</p>{/each}
			</div>
		</section>
	{/if}
	{#if wallpaper}
		<details class="photo-credits">
			<summary>Photo credit</summary>
			<p>
				<a href={wallpaper.source}>{wallpaper.label}</a> · {wallpaper.author} ·
				{#if wallpaper.licenseUrl}<a href={wallpaper.licenseUrl}>{wallpaper.license}</a
					>{:else}{wallpaper.license}{/if}
			</p>
		</details>
	{/if}
</main>

<style>
	main {
		max-width: 1160px;
		margin: 0 auto;
		padding: 44px 26px 64px;
		color: var(--on-background);
	}
	.header-top,
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
		margin: 0;
		margin-left: auto;
		justify-content: flex-end;
		flex-shrink: 0;
	}
	.event-links img {
		width: 28px;
		height: 28px;
		object-fit: contain;
	}
	.event-header {
		margin-bottom: 28px;
	}
	.event-header.has-wallpaper {
		position: relative;
		isolation: isolate;
		overflow: hidden;
		padding: 28px;
		border-radius: 7px;
		min-height: 220px;
		color: #fff;
	}
	.town-wallpaper {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		z-index: -2;
	}
	.event-header.has-wallpaper::before {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(90deg, rgba(15, 15, 15, 0.85), rgba(15, 15, 15, 0.5));
		z-index: -1;
	}
	.has-wallpaper .breadcrumbs,
	.has-wallpaper .breadcrumbs a,
	.has-wallpaper .event-meta {
		color: #eee;
	}
	.photo-credits {
		margin-top: 28px;
		font-size: 11px;
		color: var(--body);
	}
	.photo-credits summary {
		cursor: pointer;
	}
	.header-top {
		align-items: flex-start;
		flex-wrap: wrap;
	}
	.schedule-controls {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		align-items: center;
		gap: 8px 16px;
		margin-bottom: 12px;
	}
	.schedule-actions {
		display: flex;
		justify-content: flex-end;
		margin-left: auto;
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
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
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
	.scores {
		display: flex;
		justify-content: center;
		gap: 12px;
		align-items: center;
		padding: 0;
	}
	.blue-score > span {
		color: #a2a7d0;
	}
	.red-score > span {
		color: #d0a2a2;
	}
	.score-divider {
		color: var(--body);
	}

	.score {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 20px;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}
	.score.winner > span {
		text-decoration: underline;
		text-underline-offset: 4px;
	}
	.participants {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}
	.team-number {
		min-width: 0;
		overflow-wrap: anywhere;
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
	.team-number:nth-child(2) {
		align-items: center;
		text-align: center;
	}
	.team-number:nth-child(3) {
		align-items: flex-end;
		text-align: right;
	}
	.team-number strong {
		font-size: 20px;
		font-weight: 400;
	}
	.team-name {
		margin-top: 3px;
	}
	.team-number span {
		font-size: 11px;
		color: #d0a2a2;
	}
	.blue .team-number span {
		color: #a2a7d0;
	}
	.team-number.highlighted strong {
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
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.team-card {
		border: 1px solid var(--light-gray);
		border-radius: 7px;
		background:
			linear-gradient(90deg, rgba(var(--team-color), 0.25), rgba(var(--team-color), 0)),
			var(--secondary-container);
		padding: 7px;
		color: var(--on-background);
		text-align: left;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.team-logo {
		width: 48px;
		height: 48px;
		flex-shrink: 0;
		background: rgba(var(--team-color), 0.5);
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.team-logo img {
		width: 32px;
		height: 32px;
		object-fit: contain;
	}
	.team-logo span {
		font-size: 12px;
	}
	.team-identity {
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
	}
	.team-identity strong {
		font-size: 16px;
		font-weight: 500;
	}
	.team-identity span {
		font-size: 12px;
		color: var(--body);
		overflow-wrap: anywhere;
	}
	.team-awards {
		display: flex;
		gap: 8px;
		margin-left: auto;
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
		.header-top {
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
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}
		.scores {
			grid-column: 1 / -1;
			grid-row: 2;
		}
		.match-title {
			max-width: 100%;
		}
		.timing {
			max-width: 100%;
			text-align: right;
		}
		.alliance {
			padding: 10px;
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
