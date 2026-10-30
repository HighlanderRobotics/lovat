<script lang="ts">
	import type { Participant } from './types';
	export let score: NonNullable<Participant['score']>;
	const describe = (value: unknown): string =>
		value == null
			? '—'
			: Array.isArray(value)
				? value.map(describe).join(', ')
				: typeof value === 'boolean'
					? value
						? 'Yes'
						: 'No'
					: String(value).toLowerCase().replaceAll('_', ' ');
	const time = (seconds: number | null): string =>
		seconds === null
			? '—'
			: `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
	const percent = (value: number) => `${Math.round(value * 100)}%`;
	$: timeline = score.breakdown.timeline;
	$: fields = score.breakdown.fields;
	$: quantities = score.breakdown.quantities;
</script>

<div class="grade-details">
	<h2>Grade breakdown · {score.overallScore}%</h2>
	<p>Pass: 80% · {score.breakdown.rubricVersion ?? 'training-v1'}</p>
	<div class="categories">
		<div>
			<h3>Fuel counts · 50% of grade</h3>
			<p>
				{percent(
					quantities.reduce((sum, item) => sum + (item.score ?? 0), 0) /
						Math.max(quantities.length, 1)
				)}
			</p>
			<p>Totals and individual runs contribute equally.</p>
		</div>
		<div>
			<h3>Timeline · 30% of grade</h3>
			<p>
				{percent(
					timeline.score ??
						(timeline.expected + timeline.actual === 0
							? 1
							: (2 * timeline.matched) / (timeline.expected + timeline.actual))
				)}
			</p>
			<p>
				{timeline.matched} of {timeline.expected} events matched; {timeline.actual} recorded. Timing window:
				±{timeline.toleranceSeconds ?? 2}s.
			</p>
		</div>
		<div>
			<h3>Post-match · 20% of grade</h3>
			<p>{fields.filter((item) => item.correct).length} / {fields.length} correct</p>
			<p>Only the exercise’s graded questions are included.</p>
		</div>
	</div>
	<h3>Fuel totals and runs</h3>
	{#each quantities as item}
		<p>
			<strong
				>{item.action === 'STOP_SCORING' ? 'Scoring' : 'Feeding'}: {percent(
					item.score ?? 0
				)}</strong
			>
			· Expected {item.expected}, recorded {item.actual} ({item.actual - item.expected >= 0
				? '+'
				: ''}{item.actual - item.expected}){#if item.allowance !== undefined}
				· Total allowance ±{item.allowance}{/if}
		</p>
		{#if item.differences?.length}
			<ul>
				{#each item.differences as run}<li>
						At {time(run.time)}: expected {run.expected}, recorded {run.actual ??
							'missing'}{#if run.allowance !== undefined}
							· allowance ±{run.allowance}{/if}
					</li>{/each}
			</ul>
		{:else}<p>No run differences.</p>{/if}
	{/each}
	<h3>Post-match answers</h3>
	<table>
		<thead><tr><th>Question</th><th>Expected</th><th>Recorded</th><th>Result</th></tr></thead><tbody
			>{#each fields as item}<tr
					><th>{describe(item.field.replace(/([A-Z])/g, ' $1'))}</th><td
						>{describe(item.expected)}</td
					><td>{describe(item.actual)}</td><td>{item.correct ? 'Correct' : 'Review'}</td></tr
				>{/each}</tbody
		>
	</table>
	<h3>Timeline differences</h3>
	{#if timeline.differences?.length}
		<table>
			<thead
				><tr><th>Action / position</th><th>Expected</th><th>Recorded</th><th>Feedback</th></tr
				></thead
			><tbody
				>{#each timeline.differences as item}<tr
						><th>{describe(item.action)} / {describe(item.position)}</th><td
							>{time(item.expectedTime)}</td
						><td>{time(item.actualTime)}</td><td
							>{item.expectedTime === null
								? 'Extra event'
								: item.actualTime === null
									? 'Missing event'
									: `${item.deltaSeconds! > 0 ? '+' : ''}${item.deltaSeconds}s · within tolerance`}</td
						></tr
					>{/each}</tbody
			>
		</table>
	{:else}<p>
			{timeline.differences
				? 'All events match the answer timeline.'
				: 'Detailed timing feedback is available for newly graded reports.'}
		</p>{/if}
</div>

<style>
	.grade-details {
		color: white;
		line-height: 1.5;
	}
	h2 {
		font-size: 20px;
		margin: 0 0 4px;
	}
	h3 {
		font-size: 15px;
		margin: 20px 0 6px;
	}
	p {
		margin: 4px 0;
	}
	.categories {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 16px;
	}
	.categories > div {
		padding: 12px;
		background: #ffffff0a;
		border-radius: 7px;
	}
	.categories h3 {
		margin-top: 0;
	}
	table {
		width: 100%;
		margin: 8px 0 16px;
		border-collapse: collapse;
		font-size: 13px;
	}
	th,
	td {
		padding: 8px;
		text-align: left;
		border-bottom: 1px solid #ffffff20;
	}
	thead {
		color: #cac4d0;
	}
	@media (max-width: 750px) {
		.categories {
			grid-template-columns: 1fr;
		}
	}
</style>
