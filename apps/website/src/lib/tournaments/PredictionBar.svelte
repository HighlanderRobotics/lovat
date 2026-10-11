<script lang="ts">
	import { scoutingSession, scoutingToken } from '$lib/scoutingSession';
	import { onMount, createEventDispatcher } from 'svelte';
	import { getPrediction } from '$lib/tournaments/scoutingPrediction';
	import { publicAnalysis } from '$lib/tournaments/publicAnalysis';

	export let blue: number[];
	export let red: number[];
	export let matchKey: string;
	const dispatch = createEventDispatcher<{ roles: { teamNumber: number; role: string }[] }>();
	let publicPrediction = true;

	let element: HTMLDivElement;
	let visible = false;
	let prediction: { blueWinning: number; redWinning: number } | null = null;
	let requestId = 0;

	onMount(() => {
		const observer = new IntersectionObserver(
			([entry]) => {
				visible = entry.isIntersecting;
			},
			{ rootMargin: '200px' }
		);

		observer.observe(element);

		return () => {
			observer.disconnect();
			requestId++;
		};
	});

	async function load(
		signedIn: boolean,
		revision: number,
		inView: boolean,
		blueTeams: number[],
		redTeams: number[],
		key: string
	) {
		const current = ++requestId;

		prediction = null;

		if (!inView) return;

		try {
			const result = await publicAnalysis(key);

			if (current !== requestId) return;

			prediction = result.prediction;
			publicPrediction = true;
			dispatch('roles', result.roles);
		} catch {
			// Missing scouting data and provider failures leave the card unchanged.
		}

		if (!signedIn || current !== requestId || blueTeams.length !== 3 || redTeams.length !== 3)
			return;

		try {
			const result = await getPrediction(revision, blueTeams, redTeams, scoutingToken);

			if (current === requestId && result) {
				prediction = result;
				publicPrediction = false;
			}
		} catch {
			// Public aggregate predictions remain available if the private session is unavailable.
		}
	}

	$: load($scoutingSession.signedIn, $scoutingSession.revision, visible, blue, red, matchKey);
	$: bluePercent = prediction ? Math.round(prediction.blueWinning * 100) : 0;
</script>

<div bind:this={element}>
	{#if prediction}
		<div
			class="prediction"
			role="img"
			aria-label={`Lovat ${publicPrediction ? 'public ' : ''}prediction: blue ${bluePercent}%, red ${100 - bluePercent}%`}
			title={publicPrediction ? 'Lovat public scouting prediction' : 'Lovat scouting prediction'}
		>
			<div class="blue" style:flex-grow={prediction.blueWinning}></div>
			<div class="red" style:flex-grow={prediction.redWinning}></div>
			<div class="labels">
				<span>{bluePercent}%</span><span>{100 - bluePercent}%</span>
			</div>
		</div>
	{/if}
</div>

<style>
	.prediction {
		position: relative;
		display: flex;
		height: 24px;
	}
	.blue {
		background: #6677c5;
		flex-basis: 0;
	}
	.red {
		background: #bd6565;
		flex-basis: 0;
	}
	.labels {
		position: absolute;
		inset: 0;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0 12px;
		color: #fff;
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		text-shadow: 0 1px 2px #000;
	}
</style>
