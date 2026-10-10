<script lang="ts">
	import { Button } from 'magnolia-ui-svelte';

	import type { PageData } from './$types';

	export let data: PageData;

	type Match = PageData['tournament']['matches'][number];
	let selectedAlliance: number | null = null;

	$: tournament = data.tournament;
	$: eventAlliances = tournament.allianceSelections ?? [];
	$: teamBranding = Object.fromEntries(
		tournament.teams
			.filter(({ team }) => team.avatar)
			.map(({ team }) => [team.number, { logo: team.avatar! }])
	);
	$: names = new Map(tournament.teams.map(({ team }) => [team.number, team.name]));
	$: eliminationMatches = new Map(
		tournament.matches
			.filter((match) => match.competitionLevel === 'SEMIFINAL')
			.map((match) => [match.setNumber, match])
	);
	$: finals = tournament.matches.filter((match) => match.competitionLevel === 'FINAL');
	$: finalists = finals[0]
		? ['RED', 'BLUE'].map((color) => ({
				color,
				alliance: allianceFor(finals[0], color),
				wins: finals.filter(
					(match) =>
						match.winningAlliance &&
						allianceFor(match, match.winningAlliance) === allianceFor(finals[0], color)
				).length
			}))
		: [];

	const nodes = [
		{ match: 1, x: 20, y: 70 },
		{ match: 2, x: 20, y: 210 },
		{ match: 3, x: 20, y: 350 },
		{ match: 4, x: 20, y: 490 },
		{ match: 7, x: 250, y: 140 },
		{ match: 8, x: 250, y: 420 },
		{ match: 11, x: 710, y: 280 },
		{ match: 5, x: 250, y: 730 },
		{ match: 6, x: 250, y: 1010 },
		{ match: 10, x: 480, y: 730 },
		{ match: 9, x: 480, y: 1010 },
		{ match: 12, x: 710, y: 870 },
		{ match: 13, x: 940, y: 870 }
	];

	const edges = [
		{ from: 1, to: 7 },
		{ from: 2, to: 7 },
		{ from: 3, to: 8 },
		{ from: 4, to: 8 },
		{ from: 7, to: 11 },
		{ from: 8, to: 11 },
		{ from: 1, to: 5, drop: true },
		{ from: 2, to: 5, drop: true },
		{ from: 3, to: 6, drop: true },
		{ from: 4, to: 6, drop: true },
		{ from: 7, to: 9, drop: true },
		{ from: 8, to: 10, drop: true },
		{ from: 5, to: 10 },
		{ from: 6, to: 9 },
		{ from: 9, to: 12 },
		{ from: 10, to: 12 },
		{ from: 11, to: 13, drop: true },
		{ from: 12, to: 13 }
	];

	function allianceFor(match: Match, color: string) {
		const teams = match.teamSlots
			.filter((slot) => slot.alliance === color)
			.map((slot) => slot.teamNumber);

		const index = eventAlliances.findIndex(
			(alliance) =>
				alliance.teams.some((team) => teams.includes(team)) ||
				(alliance.backup != null && teams.includes(alliance.backup.in))
		);

		return index === -1 ? null : index + 1;
	}

	function containsAlliance(match: Match) {
		return (
			selectedAlliance === null ||
			['RED', 'BLUE'].some((color) => allianceFor(match, color) === selectedAlliance)
		);
	}

	function connector(from: number, to: number) {
		const start = nodes.find((node) => node.match === from)!;
		const end = nodes.find((node) => node.match === to)!;
		const x = start.x + 190;
		const y = start.y + 60;
		const middle = x + (end.x - x) / 2;

		return `M ${x} ${y} H ${middle} V ${end.y + 60} H ${end.x}`;
	}
</script>

<section aria-labelledby="alliances-heading">
	<div class="section-heading">
		<h2 id="alliances-heading">Alliances</h2>
		{#if selectedAlliance !== null}<Button
				variant="text-only-secondary"
				on:click={() => (selectedAlliance = null)}>Show all</Button
			>{/if}
	</div>
	<div class="alliance-list">
		{#each eventAlliances as alliance, index}
			<button
				class="alliance-card"
				class:selected={selectedAlliance === index + 1}
				aria-pressed={selectedAlliance === index + 1}
				on:click={() => (selectedAlliance = selectedAlliance === index + 1 ? null : index + 1)}
			>
				<h3>Alliance {index + 1}</h3>
				<div class="lineup">
					{#each [...alliance.teams, ...(alliance.backup ? [alliance.backup.in] : [])] as number, pick}
						<div class="team">
							{#if teamBranding[number]}<img
									src={teamBranding[number].logo}
									alt=""
									loading="lazy"
								/>{/if}
							<div>
								<strong>{number}</strong><span>{names.get(number)}</span><small
									>{pick === 0
										? 'Captain'
										: pick >= alliance.teams.length
											? 'Backup'
											: `Pick ${pick}`}</small
								>
							</div>
						</div>
					{/each}
				</div>
			</button>
		{:else}
			<p>No alliances selected yet.</p>
		{/each}
	</div>
</section>

{#if tournament.playoffType === 10 && eventAlliances.length === 8}
	<section aria-labelledby="bracket-heading">
		<h2 id="bracket-heading">Double-elimination bracket</h2>
		<!-- Keyboard focus lets users scroll the wide bracket with arrow keys. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			class="bracket-scroll"
			tabindex="0"
			role="region"
			aria-label="Scrollable elimination bracket"
		>
			<div class="bracket">
				<svg width="1380" height="1160" aria-hidden="true">
					{#each edges as edge}<path
							d={connector(edge.from, edge.to)}
							class:drop={edge.drop}
						/>{/each}
					<path d="M 900 340 H 1140 V 495 H 1170" />
					<path d="M 1130 930 H 1145 V 585 H 1170" />
				</svg>
				<h3 class="bracket-label" style="left:20px;top:10px">Upper bracket</h3>
				<h3 class="bracket-label" style="left:250px;top:670px">Lower bracket</h3>
				{#each nodes as node}
					{@const match = eliminationMatches.get(node.match)}
					{#if match}
						<a
							class="bracket-match"
							class:muted={!containsAlliance(match)}
							style={`left:${node.x}px;top:${node.y}px`}
							href={`https://www.thebluealliance.com/match/${match.key}`}
							aria-label={`${[5, 6, 9, 10, 12, 13].includes(node.match) ? 'Lower' : 'Upper'} bracket match ${node.match}`}
						>
							<h4>Match {node.match}</h4>
							{#each ['RED', 'BLUE'] as color}
								<div
									class="result"
									class:red={color === 'RED'}
									class:blue={color === 'BLUE'}
									class:winning={match.winningAlliance === color}
								>
									<span>Alliance {allianceFor(match, color) ?? 'TBD'}</span><strong
										>{match.alliances.find((alliance) => alliance.color === color)?.score ??
											'—'}</strong
									>
								</div>
							{/each}
						</a>
					{/if}
				{/each}
				<div
					class="bracket-match finals"
					class:muted={selectedAlliance !== null &&
						!finalists.some((finalist) => finalist.alliance === selectedAlliance)}
					style="left:1170px;top:455px"
				>
					<h4>Finals</h4>
					{#each finalists as finalist}<div
							class="result"
							class:red={finalist.color === 'RED'}
							class:blue={finalist.color === 'BLUE'}
							class:winning={finalist.wins >= 2}
						>
							<span>Alliance {finalist.alliance}</span><strong>{finalist.wins}</strong>
						</div>{/each}
					{#each finals as match}
						<a class="final-game" href={`https://www.thebluealliance.com/match/${match.key}`}>
							<span>{match.matchNumber === 3 ? 'Tiebreaker' : `Match ${match.matchNumber}`}</span>
							<strong class="final-scores">
								<span class="red" class:winning={match.winningAlliance === 'RED'}
									>{match.alliances.find((alliance) => alliance.color === 'RED')?.score ??
										'—'}</span
								>
								<span>–</span>
								<span class="blue" class:winning={match.winningAlliance === 'BLUE'}
									>{match.alliances.find((alliance) => alliance.color === 'BLUE')?.score ??
										'—'}</span
								>
							</strong>
						</a>
					{/each}
				</div>
			</div>
		</div>
	</section>
{/if}

<style>
	h2 {
		font-size: 24px;
		font-weight: 500;
	}
	section {
		margin-top: 28px;
	}
	.section-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.alliance-list {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.alliance-card {
		padding: 16px;
		border: 1px solid var(--light-gray);
		border-radius: 7px;
		background: var(--secondary-container);
		color: var(--on-background);
		text-align: left;
		cursor: pointer;
	}
	.alliance-card.selected {
		border-color: var(--victory-purple);
		outline: 1px solid var(--victory-purple);
	}
	h3 {
		font-weight: 500;
		font-size: 18px;
		margin: 0 0 16px;
	}
	.lineup {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
	}
	.team {
		display: flex;
		gap: 8px;
		align-items: flex-start;
		min-width: 0;
	}
	.team img {
		width: 28px;
		height: 28px;
		object-fit: contain;
	}
	.team > div {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}
	.team strong {
		font-size: 18px;
		font-weight: 500;
	}
	.team span {
		font-size: 11px;
		color: var(--body);
		overflow-wrap: anywhere;
	}
	.team small {
		color: var(--body);
		font-size: 10px;
	}
	.bracket-scroll {
		overflow-x: auto;
		border: 1px solid var(--light-gray);
		border-radius: 7px;
		background: var(--background);
	}
	.bracket {
		position: relative;
		width: 1380px;
		height: 1160px;
	}
	.bracket svg {
		position: absolute;
		inset: 0;
	}
	.bracket path {
		fill: none;
		stroke: var(--victory-purple);
		stroke-width: 2;
	}
	.bracket path.drop {
		stroke: var(--light-gray);
		stroke-dasharray: 5 5;
	}
	.bracket-label {
		position: absolute;
		color: var(--body);
		margin: 0;
	}
	.bracket-match {
		position: absolute;
		width: 190px;
		min-height: 120px;
		box-sizing: border-box;
		padding: 10px;
		border: 1px solid var(--light-gray);
		border-radius: 7px;
		background: var(--secondary-container);
		color: var(--on-background);
		text-decoration: none;
	}
	.bracket-match.finals {
		min-height: 0;
	}
	.bracket-match.muted {
		opacity: 0.3;
	}
	.bracket-match h4 {
		font-size: 12px;
		color: var(--body);
		margin: 0 0 10px;
		font-weight: 500;
	}
	.result {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		margin-top: 8px;
	}
	.result.winning strong,
	.final-scores .winning {
		text-decoration: underline;
		text-underline-offset: 4px;
	}
	.red,
	.result.red span,
	.result.red strong {
		color: #d0a2a2;
	}
	.blue,
	.result.blue span,
	.result.blue strong {
		color: #a2a7d0;
	}
	.final-scores {
		display: flex;
		gap: 4px;
	}
	.final-game {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		font-size: 11px;
		color: var(--body);
		text-decoration: none;
		margin-top: 12px;
	}
	a:focus-visible,
	button:focus-visible,
	.bracket-scroll:focus-visible {
		outline: 2px solid var(--victory-purple);
		outline-offset: 3px;
	}
	@media (min-width: 1100px) {
		.bracket {
			zoom: 0.78;
		}
	}
	@media (max-width: 720px) {
		.alliance-list {
			grid-template-columns: 1fr;
		}
		.team {
			flex-direction: column;
		}
	}
</style>
