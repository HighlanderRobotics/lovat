<script lang="ts">
	import { onMount } from 'svelte';

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
	$: ranked = sorted.map((team) => ({
		...team,
		rank: sorted.findIndex((entry) => entry.points === team.points) + 1
	}));
	$: maximum = Math.max(10, ...teams.map((team) => team.points)) * 1.1;
	$: minimum = Math.min(0, ...teams.map((team) => team.points));
	$: average = teams.length ? teams.reduce((sum, team) => sum + team.points, 0) / teams.length : 0;
	$: chartWidth = Math.max(900, teams.length * 24 + 112);
	$: ticks = Array.from({ length: 5 }, (_, index) => minimum + ((maximum - minimum) * index) / 4);
	$: rankTicks = [
		...new Set([1, ...[0.25, 0.5, 0.75, 1].map((f) => Math.max(1, Math.round(teams.length * f)))])
	];
	$: x = (rank: number) =>
		teams.length > 1 ? 72 + ((rank - 1) / (teams.length - 1)) * (chartWidth - 112) : chartWidth / 2;
	$: y = (points: number) => 292 - ((points - minimum) / (maximum - minimum)) * 264;
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
		<div class="chart-scroll">
			<svg
				viewBox={`0 0 ${chartWidth} 360`}
				style:min-width={`${chartWidth}px`}
				role="img"
				aria-label="Total Points Dropoff"
			>
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
						>
							<title
								>{team.number} · {team.name}: {team.points.toFixed(1)} points · Rank {team.rank}</title
							>
						</circle>
						{#if team.rank !== index + 1}
							<line
								x1={x(team.rank)}
								x2={x(index + 1)}
								y1={y(team.points)}
								y2={y(team.points) - 10}
								class="label-leader"
							/>
						{/if}
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
	.label-leader {
		stroke: var(--body);
		opacity: 0.5;
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
