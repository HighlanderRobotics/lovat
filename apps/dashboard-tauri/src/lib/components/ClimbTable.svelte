<script lang="ts">
	import type { AllianceAnalysis } from '#lib/api/endpoints.ts';
	import { numToStringRounded } from '#lib/metrics.ts';

	/** Start time for each climb level by team (the Flutter "reef stack"). */
	let { analysis, background, foreground }: { analysis: AllianceAnalysis; background?: string; foreground?: string } = $props();
	const rows = $derived([analysis.l1StartTime, analysis.l2StartTime, analysis.l3StartTime]);
</script>

<div class="climb" style:background={background} style:color={foreground}>
	<table>
		<thead>
			<tr>
				<th></th>
				{#each [0, 1, 2] as col (col)}<th>{analysis.teams[col]?.team ?? '--'}</th>{/each}
			</tr>
		</thead>
		<tbody>
			{#each rows as list, row (row)}
				<tr>
					<th scope="row">L{row + 1} Start</th>
					{#each [0, 1, 2] as col (col)}
						<td>{list[col] == null ? '--' : `${numToStringRounded(list[col])}s`}</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.climb {
		border-radius: 10px;
		padding: 4px 10px;
		background: var(--surface-high);
		color: var(--on-surface-variant);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-weight: 500;
	}
	th,
	td {
		height: 38px;
		text-align: center;
		font-weight: 500;
	}
	th[scope='row'] {
		text-align: left;
	}
	tbody tr {
		border-top: 1px solid color-mix(in srgb, currentColor 20%, transparent);
	}
</style>
