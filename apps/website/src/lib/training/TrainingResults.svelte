<script lang="ts">
	import type { Participant } from './types';
	import TrainingRoles from './TrainingRoles.svelte';
	export let participants: Participant[];
	let expanded: string | null = null;
	$: reference = participants.find((person) => person.score)?.score;
	const labels: Record<string, string> = {
		driverAbility: 'Driver ability',
		defenseEffectiveness: 'Defence effectiveness',
		activeDefensePercentage: 'Active defence',
		robotRoles: 'Roles',
		intakeType: 'Intake sources',
		intakePieces: 'Intake pieces',
		mobility: 'Paths',
		endgameResult: 'Endgame',
		coopertition: 'Coopertition',
		links: 'Links'
	};
	function field(score: Participant['score'] | undefined, name: string, expected = false): unknown {
		const value = score?.breakdown.fields.find((item) => item.field === name);
		return expected ? value?.expected : value?.actual;
	}
	function quantity(
		score: Participant['score'] | undefined,
		action: string,
		expected = false
	): number | undefined {
		const value = score?.breakdown.quantities.find((item) => item.action === action);
		return expected ? value?.expected : value?.actual;
	}
	function wrong(score: Participant['score'], name: string): boolean {
		return score?.breakdown.fields.find((item) => item.field === name)?.correct === false;
	}
	function wrongQuantity(score: Participant['score'], action: string): boolean {
		const value = score?.breakdown.quantities.find((item) => item.action === action);
		return (
			!!value &&
			(value.score ??
				Math.max(0, 1 - Math.abs(value.expected - value.actual) / Math.max(value.expected, 1))) <
				0.8
		);
	}
	function describe(value: unknown): string {
		if (value === undefined || value === null) return '—';
		if (Array.isArray(value)) return value.map(describe).join(', ');
		if (typeof value === 'boolean') return value ? 'Yes' : 'No';
		return String(value)
			.toLowerCase()
			.replaceAll('_', ' ')
			.replace(/^./, (letter) => letter.toUpperCase());
	}
</script>

<div class="results-scroll">
	<table>
		<thead
			><tr
				><th scope="col"><span class="sr-only">Scout</span></th><th scope="col">Cones</th><th
					scope="col">Cubes</th
				><th scope="col">Driver ability</th><th scope="col">Endgame</th><th scope="col">Roles</th
				><th scope="col">Paths</th><th scope="col" class="pass-heading">Pass</th></tr
			></thead
		>
		<tbody>
			<tr class="actual"
				><th scope="row">Actual</th><td>{quantity(reference, 'SCORE_CONE', true) ?? '—'}</td><td
					>{quantity(reference, 'SCORE_CUBE', true) ?? '—'}</td
				><td>{field(reference, 'driverAbility', true) ?? '—'}</td><td
					>{#if field(reference, 'endgameResult', true) === 'SUCCEEDED'}<img
							src="/assets/training/check.svg"
							width="24"
							height="24"
							alt="Succeeded"
						/>{:else if field(reference, 'endgameResult', true) === 'FAILED'}<img
							src="/assets/training/close.svg"
							width="24"
							height="24"
							alt="Failed"
						/>{:else}—{/if}</td
				><td><TrainingRoles roles={field(reference, 'robotRoles', true)} /></td><td class="word"
					>{describe(field(reference, 'mobility', true))}</td
				><td></td></tr
			>
			{#each participants as person (person.uuid)}
				<tr class:failed={person.score !== null && person.score.overallScore < 80}>
					<th scope="row"
						><button
							class="name"
							aria-label={`Show ${person.name ?? 'scout'}'s report details`}
							aria-expanded={expanded === person.uuid}
							on:click={() => (expanded = expanded === person.uuid ? null : person.uuid)}
							>{person.name ?? 'Unnamed scout'}</button
						><span class="team">({person.teamNumber})</span></th
					>
					{#if person.score}
						<td class:wrong={wrongQuantity(person.score, 'SCORE_CONE')}
							>{quantity(person.score, 'SCORE_CONE')}</td
						><td class:wrong={wrongQuantity(person.score, 'SCORE_CUBE')}
							>{quantity(person.score, 'SCORE_CUBE')}</td
						><td class:wrong={wrong(person.score, 'driverAbility')}
							>{field(person.score, 'driverAbility') ?? '—'}</td
						>
						<td
							>{#if field(person.score, 'endgameResult') === 'SUCCEEDED'}<img
									src="/assets/training/check.svg"
									width="24"
									height="24"
									alt="Succeeded"
								/>{:else if field(person.score, 'endgameResult') === 'FAILED'}<img
									src="/assets/training/close.svg"
									width="24"
									height="24"
									alt="Failed"
								/>{:else}—{/if}</td
						>
						<td
							><TrainingRoles
								roles={field(person.score, 'robotRoles')}
								correct={!wrong(person.score, 'robotRoles')}
							/></td
						><td class="word" class:wrong={wrong(person.score, 'mobility')}
							>{describe(field(person.score, 'mobility'))}</td
						><td
							><img
								src={`/assets/training/${person.score.overallScore >= 80 ? 'check' : 'close'}.svg`}
								width="24"
								height="24"
								alt={person.score.overallScore >= 80 ? 'Passed' : 'Needs practice'}
							/></td
						>
					{:else}<td colspan="7" class="pending"
							>{person.status === 'SUBMITTED' ? 'Grading pending' : 'Waiting for report'}</td
						>{/if}
				</tr>
				{#if expanded === person.uuid && person.score}
					<tr class="detail-row"
						><td colspan="8"
							><div class="details">
								<p>Overall: {person.score.overallScore}% · Pass: 80%</p>
								<p>
									{person.score.breakdown.timeline.matched} of {person.score.breakdown.timeline
										.expected} timeline events matched · {person.score.breakdown.timeline.actual} recorded
								</p>
								<dl>
									{#each person.score.breakdown.fields as item}<div>
											<dt>{labels[item.field] ?? item.field}</dt>
											<dd>
												{describe(item.actual)}{#if !item.correct}<span class="expected">
														· Expected {describe(item.expected)}</span
													>{/if}
											</dd>
										</div>{/each}
								</dl>
								{#each person.score.breakdown.quantities as item}{#each item.differences ?? [] as difference}<p
										>
											Missed {item.action === 'SCORE_CONE' ? 'cone' : 'cube'} at {Math.floor(
												difference.time / 60
											)}:{String(Math.floor(difference.time % 60)).padStart(2, '0')}
										</p>{/each}{/each}
							</div></td
						></tr
					>
				{/if}
			{/each}
		</tbody>
	</table>
</div>

<style>
	.results-scroll {
		overflow-x: auto;
		padding-bottom: 8px;
	}
	table {
		width: 100%;
		min-width: 802px;
		border-spacing: 0 6px;
		border-collapse: separate;
		table-layout: fixed;
		color: white;
	}
	thead th {
		font-size: 12px;
		line-height: 17px;
		font-weight: 400;
		color: #ffffff80;
		padding: 0 2px;
		white-space: nowrap;
	}
	th:first-child {
		width: 180px;
	}
	thead th:last-child {
		width: 65px;
	}
	.pass-heading {
		color: white;
		font-weight: 700;
	}
	tbody td,
	tbody th {
		background: var(--secondary-container);
		height: 33px;
		padding: 0 4px;
		text-align: center;
		vertical-align: middle;
	}
	tbody th {
		font-size: 14px;
		font-weight: 400;
		padding-left: 12px;
		text-align: left;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	tbody td {
		font-size: 16px;
		font-weight: 700;
	}
	tr > :first-child {
		border-radius: 7px 0 0 7px;
	}
	tr > :last-child {
		border-radius: 0 7px 7px 0;
	}
	.actual > * {
		background: #424242;
	}
	.failed > * {
		background: #563333;
	}
	td.wrong {
		color: #b13b3b;
	}
	.team {
		font-size: 10px;
		color: #ffffff80;
		margin-left: 6px;
	}
	.name {
		border: 0;
		color: inherit;
		background: none;
		padding: 0;
		cursor: pointer;
		font: inherit;
	}
	.name:hover,
	.name:focus-visible {
		text-decoration: underline;
	}
	img {
		vertical-align: middle;
	}
	td.word {
		font-size: 13px;
		font-weight: 500;
	}
	.pending {
		color: #ffffff80;
		font-size: 13px;
		font-weight: 400;
		text-align: left;
	}
	.detail-row td {
		border-radius: 7px;
		padding: 12px;
		text-align: left;
		font-weight: 400;
		font-size: 14px;
	}
	.details dl {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px 24px;
		margin-top: 12px;
	}
	.details dt {
		color: #ffffff80;
		font-size: 12px;
	}
	.details dd {
		margin: 0;
	}
	.expected {
		color: #d8b5b5;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
</style>
