<script lang="ts">
	import { onMount } from 'svelte';
	export let districtKey: string;
	export let year: number;
	let teams: {
		number: number;
		name: string;
		matches: number;
		points: number;
		auto: number;
		teleop: number;
	}[] = [];
	let loading = true;
	let failed = false;
	type SortMetric = 'points' | 'auto' | 'teleop' | 'matches';
	let metric: SortMetric = 'points';
	let descending = true;
	const columns: { key: SortMetric; label: string }[] = [
		{ key: 'matches', label: 'Matches' },
		{ key: 'points', label: 'Points' },
		{ key: 'auto', label: 'Auto' },
		{ key: 'teleop', label: 'Teleop' }
	];
	function sortBy(key: SortMetric) {
		descending = metric === key ? !descending : true;
		metric = key;
	}
	let controller: AbortController;
	async function load() {
		controller?.abort();
		controller = new AbortController();
		loading = true;
		failed = false;
		try {
			const response = await fetch(`/api/public/districts/${districtKey}/leaderboard`, {
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
	$: sorted = [...teams].sort(
		(a, b) => (descending ? b[metric] - a[metric] : a[metric] - b[metric]) || a.number - b.number
	);
</script>

<section aria-label="District leaderboard">
	<div class="heading">
		<h2>Lovat leaderboard</h2>
		<label
			>Rank by <select bind:value={metric} on:change={() => (descending = true)}
				><option value="matches">Matches</option><option value="points">Points</option><option
					value="auto">Auto</option
				><option value="teleop">Teleop</option></select
			></label
		>
	</div>
	<p>Season scouting averages · {teams.length} teams with reports</p>
	{#if loading}<p>Loading leaderboard…</p>{:else if failed}<p>
			Leaderboard unavailable. <button on:click={load}>Retry</button>
		</p>
	{:else if !teams.length}<p>No scouting metrics for this district and season.</p>
	{:else}<div class="table-scroll">
			<table>
				<thead
					><tr
						><th>Rank</th><th>Team</th>{#each columns as column}<th
								aria-sort={metric === column.key
									? descending
										? 'descending'
										: 'ascending'
									: 'none'}
								><button on:click={() => sortBy(column.key)}
									>{column.label}{metric === column.key ? (descending ? ' ↓' : ' ↑') : ''}</button
								></th
							>{/each}</tr
					></thead
				><tbody>
					{#each sorted as team, index}<tr
							><td
								>{index > 0 && team[metric] === sorted[index - 1][metric]
									? sorted.findIndex((t) => t[metric] === team[metric]) + 1
									: index + 1}</td
							><td><a href={`/teams/${team.number}/${year}`}>{team.number} · {team.name}</a></td><td
								>{team.matches}</td
							><td>{team.points.toFixed(1)}</td><td>{team.auto.toFixed(1)}</td><td
								>{team.teleop.toFixed(1)}</td
							></tr
						>{/each}
				</tbody>
			</table>
		</div>{/if}
</section>

<style>
	section {
		margin-top: 28px;
	}
	.heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
	}
	h2 {
		font-size: 24px;
		font-weight: 500;
	}
	p,
	label {
		color: var(--body);
		font-size: 13px;
	}
	select,
	button {
		background: var(--secondary-container);
		color: var(--on-background);
		border: 1px solid var(--light-gray);
		border-radius: 7px;
		padding: 8px;
	}
	.table-scroll {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 14px;
	}
	th,
	td {
		padding: 14px 12px;
		border-bottom: 1px solid var(--light-gray);
		text-align: right;
		white-space: nowrap;
	}
	th:nth-child(2),
	td:nth-child(2) {
		text-align: left;
	}
	th button {
		border: 0;
		padding: 0;
		background: transparent;
		font: inherit;
		cursor: pointer;
	}
	a {
		color: var(--victory-purple);
		text-decoration: none;
	}
</style>
