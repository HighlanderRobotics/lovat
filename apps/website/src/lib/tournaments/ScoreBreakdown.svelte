<script lang="ts">
	export let alliances: { color: 'BLUE' | 'RED'; scoreBreakdown: Record<string, unknown> | null }[];

	$: blue = alliances.find((alliance) => alliance.color === 'BLUE')?.scoreBreakdown ?? {};
	$: red = alliances.find((alliance) => alliance.color === 'RED')?.scoreBreakdown ?? {};
	$: scoring = [
		['Autonomous', 'totalAutoPoints', 'autoPoints'],
		['Teleop', 'totalTeleopPoints', 'teleopPoints'],
		['Tower', 'totalTowerPoints'],
		['Foul points', 'foulPoints'],
		['Adjustments', 'adjustPoints'],
		['Total', 'totalPoints'],
		['Ranking points', 'rp']
	].filter(([, ...keys]) => keys.some((key) => key in blue || key in red));
	$: fuel = [
		['Autonomous', 'autoCount'],
		['Transition', 'transitionCount'],
		['Shift 1', 'shift1Count'],
		['Shift 2', 'shift2Count'],
		['Shift 3', 'shift3Count'],
		['Shift 4', 'shift4Count'],
		['Endgame', 'endgameCount'],
		['Total', 'totalCount']
	].filter(
		([, key]) =>
			value(blue, ['hubScore', key]) !== undefined || value(red, ['hubScore', key]) !== undefined
	);
	$: details = [...new Set([...flatten(blue).keys(), ...flatten(red).keys()])];

	function value(breakdown: Record<string, unknown>, path: string[]): unknown {
		let result: unknown = breakdown;

		for (const key of path) {
			if (!result || typeof result !== 'object' || Array.isArray(result)) return undefined;

			result = (result as Record<string, unknown>)[key];
		}

		return result;
	}

	function display(value: unknown): string {
		if (value === undefined || value === null) return '—';
		if (typeof value === 'boolean') return value ? 'Yes' : 'No';
		if (typeof value === 'number') return value.toLocaleString('en-US');
		if (typeof value === 'string') return value;

		return '—';
	}

	function first(breakdown: Record<string, unknown>, keys: string[]) {
		return keys.map((key) => breakdown[key]).find((value) => value !== undefined && value !== null);
	}

	function flatten(
		breakdown: Record<string, unknown>,
		prefix = '',
		depth = 0
	): Map<string, unknown> {
		const result = new Map<string, unknown>();

		for (const [key, value] of Object.entries(breakdown)) {
			const path = prefix ? `${prefix}.${key}` : key;

			if (value && typeof value === 'object' && !Array.isArray(value) && depth < 4) {
				for (const entry of flatten(value as Record<string, unknown>, path, depth + 1))
					result.set(...entry);
			} else if (value === null || ['string', 'number', 'boolean'].includes(typeof value))
				result.set(path, value);
		}

		return result;
	}

	function label(key: string) {
		return key
			.replaceAll('.', ' · ')
			.replace(/([a-z])([A-Z])/g, '$1 $2')
			.replace(/([a-zA-Z])([0-9])/g, '$1 $2')
			.replace(/^./, (letter) => letter.toUpperCase());
	}
</script>

{#if details.length}
	<div class="breakdown-sections">
		{#if scoring.length}<section aria-labelledby="scoring-heading">
				<h2 id="scoring-heading">Score breakdown</h2>
				<table>
					<thead
						><tr
							><th scope="col">Points</th><th class="blue" scope="col">Blue</th><th
								class="red"
								scope="col">Red</th
							></tr
						></thead
					><tbody>
						{#each scoring as [name, ...keys]}<tr class:total={name === 'Total'}
								><th scope="row">{name}</th><td>{display(first(blue, keys))}</td><td
									>{display(first(red, keys))}</td
								></tr
							>{/each}
					</tbody>
				</table>
			</section>{/if}
		{#if fuel.length}<section aria-labelledby="fuel-heading">
				<h2 id="fuel-heading">Fuel scored</h2>
				<table>
					<thead
						><tr
							><th scope="col">Phase</th><th class="blue" scope="col">Blue</th><th
								class="red"
								scope="col">Red</th
							></tr
						></thead
					><tbody>
						{#each fuel as [name, key]}<tr class:total={name === 'Total'}
								><th scope="row">{name}</th><td>{display(value(blue, ['hubScore', key]))}</td><td
									>{display(value(red, ['hubScore', key]))}</td
								></tr
							>{/each}
					</tbody>
				</table>
			</section>{/if}
	</div>
	<details class="official-details">
		<summary>Full breakdown</summary>
		<table>
			<thead
				><tr
					><th scope="col">Result</th><th class="blue" scope="col">Blue</th><th
						class="red"
						scope="col">Red</th
					></tr
				></thead
			><tbody>
				{#each details as key}<tr
						><th scope="row">{label(key)}</th><td>{display(value(blue, key.split('.')))}</td><td
							>{display(value(red, key.split('.')))}</td
						></tr
					>{/each}
			</tbody>
		</table>
	</details>
{/if}

<style>
	.breakdown-sections {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
		gap: 24px;
		margin-top: 32px;
	}
	h2 {
		font-size: 22px;
		font-weight: 500;
		margin: 0 0 16px;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		background: var(--secondary-container);
		border-radius: 7px;
		overflow: hidden;
	}
	th,
	td {
		padding: 12px 16px;
		border-bottom: 1px solid var(--light-gray);
		font-size: 14px;
	}
	th {
		text-align: left;
		font-weight: 400;
		overflow-wrap: anywhere;
	}
	thead th {
		font-weight: 500;
	}
	th:first-child {
		width: 60%;
	}
	td,
	thead th:not(:first-child) {
		text-align: center;
		font-variant-numeric: tabular-nums;
	}
	.blue {
		color: #a2a7d0;
	}
	.red {
		color: #d0a2a2;
	}
	.total th,
	.total td {
		font-weight: 600;
	}
	.official-details {
		margin-top: 24px;
	}
	summary {
		cursor: pointer;
		padding: 12px 0;
		font-size: 16px;
	}
	summary:focus-visible {
		outline: 2px solid var(--victory-purple);
		outline-offset: 3px;
	}
	@media (max-width: 600px) {
		th,
		td {
			padding: 10px;
			font-size: 13px;
		}
	}
</style>
