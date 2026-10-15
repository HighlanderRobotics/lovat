<script lang="ts">
	import { onDestroy } from 'svelte';
	export let number: number;
	let teams: (number | undefined)[] = [
		number,
		undefined,
		undefined,
		undefined,
		undefined,
		undefined
	];
	let prediction: { blueWinning: number; redWinning: number } | null = null;
	let message = '';
	let loading = false;
	let controller: AbortController;
	let revision = 0;
	function resetInputs(_teams: (number | undefined)[]) {
		revision++;
		prediction = null;
		message = '';
		controller?.abort();
		loading = false;
	}
	$: resetInputs(teams);
	onDestroy(() => controller?.abort());
	async function predict() {
		const current = revision;
		const valid = teams.every((team) => Number.isInteger(team) && team! > 0);
		if (!valid || new Set(teams).size !== 6) {
			message = 'Choose six distinct teams.';
			return;
		}
		controller?.abort();
		const request = new AbortController();
		controller = request;
		loading = true;
		message = '';
		prediction = null;
		try {
			const response = await fetch(`/api/public/prediction?year=2026&teams=${teams.join(',')}`, {
				signal: request.signal
			});
			if (!response.ok) throw new Error('Unavailable');
			const result = await response.json();
			if (current !== revision || request.signal.aborted) return;
			prediction = result.prediction;
			if (!prediction) message = 'Not enough scouting data.';
		} catch {
			if (!request.signal.aborted) message = 'Prediction unavailable.';
		} finally {
			if (current === revision) loading = false;
		}
	}
</script>

<section aria-label="Match predictor">
	<h3>Match predictor</h3>
	<form on:submit|preventDefault={predict}>
		<div class="alliances">
			{#each ['Blue', 'Red'] as color, side}<fieldset>
					<legend>{color} alliance</legend>
					<div class="teams">
						{#each [0, 1, 2] as station}<label
								><span>Team {station + 1}</span><input
									type="number"
									min="1"
									max="2147483647"
									required
									bind:value={teams[side * 3 + station]}
								/></label
							>{/each}
					</div>
				</fieldset>{/each}
		</div>
		<button disabled={loading}>{loading ? 'Predicting…' : 'Predict match'}</button>
	</form>
	<div aria-live="polite">
		{#if prediction}<div class="prediction">
				<div class="blue" style:width={`${prediction.blueWinning * 100}%`}></div>
				<div class="labels">
					<span>Blue {Math.round(prediction.blueWinning * 100)}%</span><span
						>Red {Math.round(prediction.redWinning * 100)}%</span
					>
				</div>
			</div>{/if}{#if message}<p>{message}</p>{/if}
	</div>
</section>

<style>
	section {
		margin-top: 24px;
		padding: 24px;
		border-radius: 7px;
		background: var(--secondary-container);
	}
	h3 {
		font-size: 20px;
		font-weight: 500;
		margin: 0 0 20px;
	}
	.alliances {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 20px;
	}
	fieldset {
		border: 0;
		padding: 0;
		min-width: 0;
		margin: 0;
	}
	legend {
		color: var(--body);
		margin-bottom: 12px;
	}
	.teams {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}
	label {
		display: grid;
		gap: 6px;
		font-size: 12px;
		color: var(--body);
	}
	input {
		min-width: 0;
		width: 100%;
		box-sizing: border-box;
	}
	input,
	button {
		border: 1px solid var(--light-gray);
		background: var(--background);
		color: var(--on-background);
		border-radius: 7px;
		padding: 10px;
		font: inherit;
	}
	button {
		margin: 16px 0;
		cursor: pointer;
	}
	.prediction {
		position: relative;
		height: 32px;
		background: #bd6565;
	}
	.blue {
		height: 100%;
		background: #6677c5;
	}
	.labels {
		position: absolute;
		inset: 0;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0 12px;
		font-size: 12px;
		color: white;
	}
	@media (max-width: 600px) {
		.alliances {
			grid-template-columns: 1fr;
		}
		section {
			padding: 16px;
		}
	}
</style>
