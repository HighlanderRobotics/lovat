<script lang="ts">
	import { onMount } from 'svelte';
	import RoleIcon from './RoleIcon.svelte';
	import {
		rollingValues,
		roleDistribution,
		type SeriesMatch,
		type GraphMetric
	} from './teamAnalytics';

	export let number: number;
	export let year: number;

	let matches: SeriesMatch[] = [];
	let loading = true;
	let failed = false;
	let controller: AbortController;
	let metric: GraphMetric = 'points';
	let eventKey = '';
	let chart = 'line';
	let window = 1;
	let active = -1;
	let chartWidth = 900;

	const metrics = {
		points: 'Points',
		auto: 'Auto points',
		teleop: 'Teleop points',
		feeding: 'Fuel fed'
	};
	const roles: Record<string, { label: string; color: string }> = {
		CYCLING: { label: 'Cycling', color: '#b9a3f5' },
		SCORING: { label: 'Scoring', color: '#75c6a0' },
		FEEDING: { label: 'Feeding', color: '#82b8f8' },
		DEFENDING: { label: 'Defending', color: '#edb476' },
		IMMOBILE: { label: 'Immobile', color: '#e08ba0' }
	};

	async function load() {
		controller?.abort();
		const request = new AbortController();
		controller = request;
		loading = true;
		failed = false;

		try {
			const response = await fetch(`/api/public/teams/${number}/${year}/series`, {
				signal: request.signal
			});

			if (!response.ok) throw new Error('Analytics unavailable');

			const result = await response.json();

			if (!request.signal.aborted) matches = result.matches;
		} catch {
			if (!request.signal.aborted) failed = true;
		} finally {
			if (!request.signal.aborted) loading = false;
		}
	}

	onMount(() => {
		void load();

		return () => controller?.abort();
	});

	$: events = [...new Map(matches.map((match) => [match.eventKey, match.eventName])).entries()];
	$: filtered = matches.filter((match) => !eventKey || match.eventKey === eventKey);
	$: values = rollingValues(
		filtered.map((match) => match[metric]),
		Number(window)
	);
	$: maximum = Math.max(1, ...values.filter((value): value is number => value !== null));
	$: step = maximum >= 20 ? 10 : maximum >= 5 ? 5 : 1;
	$: ceiling = Math.ceil(maximum / step) * step;
	$: plotWidth = chartWidth - 80;
	$: x = (index: number) =>
		58 + (filtered.length > 1 ? index / (filtered.length - 1) : 0.5) * plotWidth;
	$: y = (value: number) => 278 - (value / ceiling) * 260;
	$: path = values.reduce(
		(result, value, index) =>
			value === null
				? result
				: `${result} ${index === 0 || values[index - 1] === null ? 'M' : 'L'}${x(index)},${y(value)}`,
		''
	);
	$: distribution = roleDistribution(filtered);
	$: if (filtered && metric && window) active = -1;
	$: selected = filtered[active];

	function measure(node: HTMLElement) {
		const observer = new ResizeObserver(() => (chartWidth = Math.max(280, node.clientWidth)));
		observer.observe(node);

		return { destroy: () => observer.disconnect() };
	}

	function pie(entries: { role: string; percentage: number }[], index: number) {
		const start =
			(entries.slice(0, index).reduce((sum, entry) => sum + entry.percentage, 0) / 100) *
				Math.PI *
				2 -
			Math.PI / 2;
		const end = start + (entries[index].percentage / 100) * Math.PI * 2;

		return `M150 150 L${150 + 132 * Math.cos(start)} ${150 + 132 * Math.sin(start)} A132 132 0 ${end - start > Math.PI ? 1 : 0} 1 ${150 + 132 * Math.cos(end)} ${150 + 132 * Math.sin(end)} Z`;
	}

	function link(match: SeriesMatch) {
		return match.matchKey ? `/matches/${match.matchKey}` : `/tournaments/${match.eventKey}`;
	}
</script>

<section aria-label="Team analytics">
	<h2>Lovat analytics</h2>
	{#if loading}<p>Loading analytics…</p>
	{:else if failed}<p>Analytics unavailable. <button on:click={load}>Retry</button></p>
	{:else if year !== 2026}
		<p>Analytics unavailable for this season.</p>
	{:else if !matches.length}<p>No scouting data for this season.</p>
	{:else}
		<div class="controls">
			<label
				>Metric<select bind:value={metric}
					>{#each Object.entries(metrics) as [value, name]}<option {value}>{name}</option
						>{/each}</select
				></label
			>
			<label
				>Event<select bind:value={eventKey}
					><option value="">All events</option>{#each events as [key, name]}<option value={key}
							>{name}</option
						>{/each}</select
				></label
			>
			<label
				>Chart<select bind:value={chart}
					><option value="line">Line</option><option value="bar">Bar</option></select
				></label
			>
			<label
				>Average<select bind:value={window}
					><option value={1}>Per match</option><option value={3}>Last 3 matches</option><option
						value={5}>Last 5 matches</option
					></select
				></label
			>
		</div>
		<div class="chart-panel">
			<h3>{metrics[metric]} per match</h3>
			{#if values.some((value) => value !== null)}
				<div class="plot" use:measure>
					<svg
						class="performance"
						viewBox={`0 0 ${chartWidth} 320`}
						role="img"
						aria-label={`${metrics[metric]} per scouted match`}
					>
						{#each [0, 1, 2, 3, 4] as tick}
							<line
								x1="58"
								x2={chartWidth - 22}
								y1={y((ceiling * tick) / 4)}
								y2={y((ceiling * tick) / 4)}
								class="grid-line"
							/>
							<text x="46" y={y((ceiling * tick) / 4) + 4} text-anchor="end"
								>{((ceiling * tick) / 4).toLocaleString('en-US', {
									maximumFractionDigits: 1
								})}</text
							>
						{/each}
						{#if chart === 'line'}<path d={path} class="data-line" />{/if}
						{#each values as value, index}
							{#if value !== null}
								<a
									href={link(filtered[index])}
									aria-label={`${filtered[index].label}, ${filtered[index].eventName}: ${value.toFixed(1)} ${metrics[metric]}`}
									on:focus={() => (active = index)}
									on:mouseenter={() => (active = index)}
								>
									{#if chart === 'bar'}<rect
											x={x(index) - Math.min(40, (plotWidth / filtered.length) * 0.65) / 2}
											y={y(value)}
											width={Math.min(40, (plotWidth / filtered.length) * 0.65)}
											height={278 - y(value)}
											class="data-bar"
										/>{/if}
									<circle
										cx={x(index)}
										cy={y(value)}
										r={active === index ? 7 : chart === 'bar' ? 3 : 4}
										class="data-point"
										><title
											>{filtered[index].label} · {filtered[index].eventName}: {value.toFixed(1)}
											{metrics[metric]}</title
										></circle
									>
								</a>
							{/if}
							{#if index % Math.max(1, Math.ceil(filtered.length / (chartWidth < 500 ? 4 : 8))) === 0 || index === filtered.length - 1}<text
									x={x(index)}
									y="302"
									text-anchor="middle">{index + 1}</text
								>{/if}
						{/each}
					</svg>
				</div>
				<div class="match-caption">
					{#if selected}<a href={link(selected)}>{selected.label} · {selected.eventName}</a><strong
							>{values[active]?.toFixed(1)} {metrics[metric]}</strong
						>{:else}<span>Scouted matches</span>{/if}
				</div>
			{:else}<p>No values available.</p>{/if}
		</div>
		<div class="roles-panel">
			<h3>Roles</h3>
			{#if distribution.length}
				<div class="role-breakdown">
					<svg class="pie" viewBox="0 0 300 300" role="img" aria-label="Scouting role breakdown">
						{#each distribution as entry, index}
							{#if distribution.length === 1}<circle
									cx="150"
									cy="150"
									r="132"
									fill={roles[entry.role].color}
									><title>{roles[entry.role].label}: {entry.percentage.toFixed(1)}%</title></circle
								>
							{:else}<path d={pie(distribution, index)} fill={roles[entry.role].color}
									><title>{roles[entry.role].label}: {entry.percentage.toFixed(1)}%</title></path
								>{/if}
						{/each}
					</svg>
					<ul>
						{#each distribution as entry}<li>
								<span class="role-label" style:color={roles[entry.role].color}
									><RoleIcon role={entry.role} /><span>{roles[entry.role].label}</span></span
								><strong>{entry.percentage.toFixed(1)}%</strong>
							</li>{/each}
					</ul>
				</div>
			{:else}<p>No roles available.</p>{/if}
		</div>
		<details class="values-table">
			<summary>Match values</summary>
			<div class="table-scroll">
				<table>
					<thead><tr><th>Match</th><th>Event</th><th>{metrics[metric]}</th></tr></thead><tbody
						>{#each filtered as match}<tr
								><td><a href={link(match)}>{match.label}</a></td><td>{match.eventName}</td><td
									>{match[metric]?.toFixed(1) ?? '—'}</td
								></tr
							>{/each}</tbody
					>
				</table>
			</div>
		</details>
	{/if}
</section>

<style>
	section {
		margin-top: 28px;
	}
	h2 {
		font-size: 24px;
		font-weight: 500;
	}
	h3 {
		margin: 0 0 20px;
		font-size: 20px;
		font-weight: 500;
	}
	.controls {
		display: grid;
		grid-template-columns: 1fr 2fr 1fr 1fr;
		gap: 16px;
		margin: 24px 0;
	}
	label {
		display: grid;
		gap: 8px;
		color: var(--body);
		font-size: 13px;
		min-width: 0;
	}
	select,
	button {
		color: var(--on-background);
		background: var(--secondary-container);
		border: 1px solid var(--light-gray);
		border-radius: 7px;
		padding: 10px 12px;
		font: inherit;
		min-width: 0;
		width: 100%;
	}
	button {
		width: auto;
		cursor: pointer;
	}
	.chart-panel,
	.roles-panel {
		padding: 24px;
		margin-top: 24px;
		border-radius: 7px;
		background: var(--secondary-container);
	}
	.performance {
		width: 100%;
		display: block;
		overflow: visible;
	}
	text {
		fill: var(--body);
		font-size: 13px;
	}
	.grid-line {
		stroke: var(--light-gray);
		stroke-width: 1;
	}
	.data-line {
		stroke: var(--victory-purple);
		stroke-width: 3;
		fill: none;
	}
	.data-point,
	.data-bar {
		fill: var(--victory-purple);
	}
	.performance a:hover,
	.performance a:focus {
		filter: brightness(1.25);
		outline: none;
	}
	.match-caption {
		min-height: 32px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
		color: var(--body);
		font-size: 13px;
	}
	a {
		color: var(--victory-purple);
		text-decoration: none;
	}
	.role-breakdown {
		display: flex;
		align-items: center;
		gap: 40px;
	}
	.pie {
		width: 240px;
		max-width: 100%;
		flex-shrink: 0;
	}
	ul {
		padding: 0;
		margin: 0;
		list-style: none;
		width: min(100%, 360px);
	}
	li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
		padding: 12px 0;
	}
	.role-label {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	li strong {
		font-size: 14px;
		font-weight: 500;
	}
	.values-table {
		margin: 24px 0;
		color: var(--body);
	}
	summary {
		cursor: pointer;
	}
	.table-scroll {
		overflow-x: auto;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
		margin-top: 16px;
	}
	th,
	td {
		padding: 12px;
		text-align: left;
		border-bottom: 1px solid var(--light-gray);
	}
	th:last-child,
	td:last-child {
		text-align: right;
	}
	@media (max-width: 600px) {
		.controls {
			grid-template-columns: 1fr 1fr;
		}
		.chart-panel,
		.roles-panel {
			padding: 16px;
		}
		.role-breakdown {
			flex-direction: column;
			gap: 16px;
		}
		.match-caption {
			align-items: flex-start;
			flex-direction: column;
		}
	}
</style>
