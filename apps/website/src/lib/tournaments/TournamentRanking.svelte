<script lang="ts">
	import { onMount } from 'svelte';
	import { exponentialFit, predictExponential, topCohorts } from './dropoff';

	export let tournamentKey: string;
	export let year: number;

	type Team = { number: number; name: string; matches: number; points: number };

	let teams: Team[] = [];
	let loading = true;
	let failed = false;
	let selected: (Team & { rank: number }) | null = null;
	let controller: AbortController;

	async function load() {
		controller?.abort();
		controller = new AbortController();
		loading = true;
		failed = false;

		try {
			const response = await fetch(`/api/public/tournaments/${tournamentKey}/ranking`, {
				signal: controller.signal
			});

			if (!response.ok) throw new Error('Unavailable');

			teams = (await response.json()).teams;
		} catch {
			if (!controller.signal.aborted) failed = true;
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void load();
		return () => controller?.abort();
	});

	$: sorted = [...teams].sort((a, b) => b.points - a.points || a.number - b.number);
	$: ranked = sorted.map((team, index) => ({
		...team,
		rank: index + 1
	}));
	$: fit = exponentialFit(ranked);
	$: cohorts = topCohorts(ranked);
	const cohortColors = ['#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed'];
	$: maximum = Math.max(10, fit?.amplitude ?? 0, ...teams.map((team) => team.points)) * 1.1;
	$: minimum = Math.min(0, ...teams.map((team) => team.points));
	$: average = teams.length ? teams.reduce((sum, team) => sum + team.points, 0) / teams.length : 0;
	$: chartWidth = Math.max(900, teams.length * 24 + 112);
	$: ticks = Array.from({ length: 5 }, (_, index) => minimum + ((maximum - minimum) * index) / 4);
	$: rankTicks = [
		...new Set([1, ...[0.25, 0.5, 0.75, 1].map((f) => Math.max(1, Math.round(teams.length * f)))])
	];
	$: x = (rank: number) =>
		teams.length > 1 ? 72 + ((rank - 1) / (teams.length - 1)) * (chartWidth - 112) : chartWidth / 2;
	$: y = (points: number) => 292 - ((points - minimum) / (maximum - minimum)) * 244;
	$: halfSlot = teams.length > 1 ? (x(2) - x(1)) / 2 : 400;
	$: fitPath = fit
		? Array.from({ length: 121 }, (_, index) => {
				const rank = fit!.origin + ((fit!.end - fit!.origin) * index) / 120;
				return `${index ? 'L' : 'M'}${x(rank)} ${y(predictExponential(fit!, rank))}`;
			}).join(' ')
		: '';
</script>

<section aria-labelledby="points-ranking-heading">
	<h2 id="points-ranking-heading">Total Points Dropoff</h2>

	{#if loading}
		<p>Loading rankings…</p>
	{:else if failed}
		<p>Rankings unavailable. <button on:click={load}>Retry</button></p>
	{:else if !teams.length}
		<p>No scouting points available for this tournament.</p>
	{:else}
		{#if fit}
			<div class="fit-caption">
				<span class="fit-swatch" aria-hidden="true"></span>
				<span title="Least-squares exponential fit in points, including zero scores">
					Exponential fit · y = {(fit.amplitude * Math.exp(-fit.rate * fit.origin)).toFixed(1)}e<sup
						>{fit.rate.toFixed(3)}x</sup
					>
					{#if fit.rSquared !== null}
						· R² {fit.rSquared.toFixed(3)}{/if}
				</span>
			</div>
		{/if}
		<div class="chart-scroll">
			<svg
				viewBox={`0 0 ${chartWidth} 360`}
				style:min-width={`${chartWidth}px`}
				role="img"
				aria-label="Total Points Dropoff"
			>
				{#each cohorts as cohort}
					<rect
						x={Math.max(72, x(cohort.start) - halfSlot)}
						y="48"
						width={Math.min(chartWidth - 40, x(cohort.end) + halfSlot) -
							Math.max(72, x(cohort.start) - halfSlot)}
						height="244"
						fill={cohortColors[cohort.index]}
						opacity="0.07"
					/>
					<text
						x={cohort.end - cohort.start < 3
							? x(cohort.end)
							: (x(cohort.start) + x(cohort.end)) / 2}
						y="18"
						text-anchor={cohort.end - cohort.start < 3 ? 'end' : 'middle'}
						style:fill={cohortColors[cohort.index]}
						class="cohort-label"
						>{cohort.start}{cohort.end !== cohort.start ? `–${cohort.end}` : ''} · Avg {cohort.average.toFixed(
							1
						)}</text
					>
					<line
						x1={Math.max(72, x(cohort.start) - halfSlot)}
						x2={Math.min(chartWidth - 40, x(cohort.end) + halfSlot)}
						y1={y(cohort.average)}
						y2={y(cohort.average)}
						stroke={cohortColors[cohort.index]}
						stroke-width="2"
						><title
							>Ranks {cohort.start}–{cohort.end}: average {cohort.average.toFixed(1)} points</title
						></line
					>
				{/each}
				{#each ticks as value}
					<line x1="72" x2={chartWidth - 40} y1={y(value)} y2={y(value)} class="grid" />
					<text x="60" y={y(value) + 4} text-anchor="end">{value.toFixed(0)}</text>
				{/each}

				{#each rankTicks as rank}
					<text x={x(rank)} y="315" text-anchor="middle">{rank}</text>
				{/each}

				<text x={chartWidth / 2} y="346" text-anchor="middle" class="axis-title"
					>Total points rank</text
				>
				<text transform="translate(18 160) rotate(-90)" text-anchor="middle" class="axis-title"
					>Total points</text
				>

				<line x1="72" x2={chartWidth - 40} y1={y(average)} y2={y(average)} class="average-line" />
				<text x="80" y={y(average) - 8} class="average-label">Average {average.toFixed(1)}</text>
				{#if fit}<path d={fitPath} class="regression-line" />{/if}

				{#each ranked as team, index}
					<a
						href={`/teams/${team.number}/${year}`}
						aria-label={`${team.number} ${team.name}, rank ${team.rank}, ${team.points.toFixed(1)} points`}
						on:mouseenter={() => (selected = team)}
						on:focus={() => (selected = team)}
					>
						<circle
							cx={x(team.rank)}
							cy={y(team.points)}
							r={selected?.number === team.number ? 6 : 4}
							style:fill={index < 32 ? cohortColors[Math.floor(index / 8)] : 'var(--body)'}
						>
							<title
								>{team.number} · {team.name}: {team.points.toFixed(1)} points · Rank {team.rank}</title
							>
						</circle>
						<text
							transform={`translate(${x(index + 1) + 4} ${y(team.points) - 12}) rotate(-55)`}
							class="team-label">{team.number}</text
						>
					</a>
				{/each}
			</svg>
		</div>
	{/if}
</section>

<style>
	section {
		margin-top: 28px;
		padding: 24px;
		background: var(--secondary-container);
		border-radius: 10px;
	}

	h2 {
		font-size: 24px;
		font-weight: 500;
	}

	p {
		color: var(--body);
		font-size: 13px;
	}

	.chart-scroll {
		overflow-x: auto;
		margin-top: 24px;
	}
	.fit-caption {
		display: flex;
		align-items: center;
		gap: 8px;
		color: var(--body);
		font-size: 12px;
		margin-top: 12px;
	}
	.fit-swatch {
		width: 22px;
		height: 2px;
		background: #5eead4;
	}
	.regression-line {
		fill: none;
		stroke: #5eead4;
		stroke-width: 2;
		pointer-events: none;
	}
	.cohort-label {
		font-weight: 500;
	}

	svg {
		display: block;
		width: 100%;
	}

	text {
		fill: var(--body);
		font-size: 12px;
	}

	.axis-title {
		font-size: 13px;
	}

	.grid {
		stroke: var(--light-gray);
		stroke-width: 1;
	}
	.average-line {
		stroke: var(--body);
		stroke-width: 1.5;
		stroke-dasharray: 6 5;
	}
	.average-label,
	.team-label {
		paint-order: stroke;
		stroke: var(--secondary-container);
		stroke-width: 3px;
		stroke-linejoin: round;
	}
	.team-label {
		font-size: 11px;
	}

	circle {
		fill: var(--victory-purple);
	}

	a:focus circle {
		stroke: var(--on-background);
		stroke-width: 2;
	}

	a {
		color: var(--victory-purple);
		text-decoration: none;
	}

	button {
		color: var(--on-background);
		background: transparent;
		border: 1px solid var(--light-gray);
		border-radius: 7px;
		padding: 8px;
	}
</style>
