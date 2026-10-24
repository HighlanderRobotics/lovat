<script lang="ts">
	import { onMount } from 'svelte';
	import type { z } from 'zod';
	import type { publicMatchMetricsSchema } from '$lib/server/publicAnalytics';

	export let matchKey: string;
	export let year: number;
	let teams: z.infer<typeof publicMatchMetricsSchema>['teams'] = [];

	onMount(() => {
		const controller = new AbortController();

		void fetch(`/api/public/matches/${encodeURIComponent(matchKey)}/metrics`, {
			signal: controller.signal
		})
			.then(async (response) => {
				if (response.ok && !controller.signal.aborted) {
					const result = await response.json();

					if (!controller.signal.aborted) teams = result.teams;
				}
			})
			.catch(() => {
				// Optional scouting data must not block official results.
			});

		return () => controller.abort();
	});

	function value(number: number | null, suffix = '') {
		return number === null ? '—' : `${Number(number.toFixed(1))}${suffix}`;
	}
</script>

{#if teams.length}
	<section aria-labelledby="lovat-scouting-heading">
		<h2 id="lovat-scouting-heading">Lovat scouting</h2>
		<div class="alliances">
			{#each ['BLUE', 'RED'] as alliance}
				{@const rows = teams.filter((team) => team.alliance === alliance)}
				{#if rows.length}
					<div class="alliance" class:blue={alliance === 'BLUE'} class:red={alliance === 'RED'}>
						<h3>{alliance === 'BLUE' ? 'Blue' : 'Red'}</h3>
						<div class="table-scroll">
							<table aria-label={`Lovat ${alliance.toLowerCase()} alliance scouting metrics`}>
								<thead
									><tr
										><th>Team</th><th>Auto</th><th>Teleop</th><th>Points</th><th>Fuel output</th><th
											>Fed</th
										><th>Defense</th></tr
									></thead
								>
								<tbody>
									{#each rows as team}
										<tr>
											<th scope="row"
												><a href={`/teams/${team.teamNumber}/${year}`}>{team.teamNumber}</a><span
													>{team.reports} {team.reports === 1 ? 'report' : 'reports'}</span
												></th
											>
											<td>{value(team.auto)}</td><td>{value(team.teleop)}</td><td
												>{value(team.points)}</td
											><td>{value(team.fuelOutput)}</td><td>{value(team.fuelFed)}</td><td
												>{value(team.defenseSeconds, 's')}</td
											>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				{/if}
			{/each}
		</div>
	</section>
{/if}

<style>
	section {
		margin-top: 28px;
	}
	h2 {
		font-size: 24px;
		font-weight: 500;
		margin: 0 0 18px;
	}
	.alliances {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 24px;
	}
	.alliance {
		min-width: 0;
		border-radius: 7px;
		overflow: hidden;
		background: var(--secondary-container);
	}
	h3 {
		font-size: 16px;
		font-weight: 500;
		margin: 0;
		padding: 12px 16px;
	}
	.blue h3 {
		background: #364077;
	}
	.red h3 {
		background: #793f3f;
	}
	.table-scroll {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-variant-numeric: tabular-nums;
		font-size: 13px;
	}
	th,
	td {
		padding: 12px 10px;
		text-align: right;
		border-bottom: 1px solid var(--light-gray);
	}
	thead th {
		font-size: 11px;
		color: var(--body);
		font-weight: 500;
	}
	th:first-child {
		text-align: left;
	}
	tbody th {
		font-weight: 500;
	}
	a {
		color: var(--on-background);
		text-decoration: none;
	}
	a:focus-visible {
		outline: 2px solid var(--victory-purple);
		outline-offset: 3px;
	}
	th span {
		display: block;
		white-space: nowrap;
		font-size: 10px;
		font-weight: 400;
		color: var(--body);
		margin-top: 4px;
	}
	tr:last-child th,
	tr:last-child td {
		border-bottom: 0;
	}
	@media (max-width: 850px) {
		.alliances {
			grid-template-columns: 1fr;
		}
	}
</style>
