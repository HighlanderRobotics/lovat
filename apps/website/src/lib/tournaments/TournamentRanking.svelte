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
	$: ticks = Array.from({ length: 5 }, (_, index) => minimum + ((maximum - minimum) * index) / 4);
	$: rankTicks = [
		...new Set([1, ...[0.25, 0.5, 0.75, 1].map((f) => Math.max(1, Math.round(teams.length * f)))])
	];
	$: x = (rank: number) => (teams.length > 1 ? 72 + ((rank - 1) / (teams.length - 1)) * 800 : 472);
	$: y = (points: number) => 292 - ((points - minimum) / (maximum - minimum)) * 264;
</script>

<section aria-labelledby="points-ranking-heading">
	<h2 id="points-ranking-heading">Total points ranking</h2>
	<p>Lovat scouting · Average points per match at this event</p>

	{#if loading}
		<p>Loading rankings…</p>
	{:else if failed}
		<p>Rankings unavailable. <button on:click={load}>Retry</button></p>
	{:else if !teams.length}
		<p>No scouting points available for this tournament.</p>
	{:else}
		<div class="chart-scroll">
			<svg viewBox="0 0 900 360" role="img" aria-label="Total points by tournament ranking">
				{#each ticks as value}
					<line x1="72" x2="872" y1={y(value)} y2={y(value)} class="grid" />
					<text x="60" y={y(value) + 4} text-anchor="end">{value.toFixed(0)}</text>
				{/each}

				{#each rankTicks as rank}
					<text x={x(rank)} y="315" text-anchor="middle">{rank}</text>
				{/each}

				<text x="472" y="346" text-anchor="middle" class="axis-title">Total points rank</text>
				<text transform="translate(18 160) rotate(-90)" text-anchor="middle" class="axis-title"
					>Total points</text
				>

				{#each ranked as team}
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
					</a>
				{/each}
			</svg>
		</div>

		<div class="selection" aria-live="polite">
			{#if selected}
				<a href={`/teams/${selected.number}/${year}`}>{selected.number} · {selected.name}</a>
				<span
					>#{selected.rank} · {selected.points.toFixed(1)} points · {selected.matches} matches</span
				>
			{:else}
				<span>Hover or focus a team to see its points.</span>
			{/if}
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

	p,
	.selection {
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
		min-width: 500px;
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

	.selection {
		display: flex;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 12px;
		min-height: 20px;
		margin-top: 16px;
	}

	button {
		color: var(--on-background);
		background: transparent;
		border: 1px solid var(--light-gray);
		border-radius: 7px;
		padding: 8px;
	}
</style>
