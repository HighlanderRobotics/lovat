<script lang="ts">
	import type { AutoPath } from '#lib/models/autoPath.ts';
	import AutoPathField from './AutoPathField.svelte';
	import Icon from './Icon.svelte';

	const DURATION = 20_000;

	let { paths }: { paths: { path: AutoPath; color?: string }[] } = $props();

	let value = $state(0);
	let playing = $state(false);
	let frame = 0;
	let startedAt = 0;
	let startValue = 0;

	function tick(now: number) {
		value = Math.min(1, startValue + (now - startedAt) / DURATION);
		if (value >= 1) {
			playing = false;
			return;
		}
		frame = requestAnimationFrame(tick);
	}

	function toggle() {
		if (playing) {
			cancelAnimationFrame(frame);
			playing = false;
			return;
		}
		if (value >= 1) value = 0;
		startValue = value;
		startedAt = performance.now();
		playing = true;
		frame = requestAnimationFrame(tick);
	}

	function scrub(e: Event) {
		cancelAnimationFrame(frame);
		playing = false;
		value = Number((e.target as HTMLInputElement).value);
	}

	$effect(() => () => cancelAnimationFrame(frame));

	/** Reset when a different path is shown. */
	$effect(() => {
		void paths;
		cancelAnimationFrame(frame);
		playing = false;
		value = 0;
	});

	const seconds = $derived(Math.round(value * DURATION) / 1000);
</script>

<div class="player">
	<AutoPathField {paths} progress={value === 0 ? null : value * DURATION} />
	<div class="controls">
		<button class="icon-btn" onclick={toggle} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'}>
			<Icon name={playing ? 'pause' : 'play_arrow'} />
		</button>
		<input type="range" min="0" max="1" step="0.001" {value} oninput={scrub} aria-label="Auto timeline" />
		<span class="time">{seconds.toFixed(seconds < 10 ? 1 : 0)}s</span>
	</div>
</div>

<style>
	.player {
		width: 100%;
		max-width: 520px;
		margin: 0 auto;
		background: var(--surface-high);
		border-radius: 10px;
		padding: 10px 10px 3px;
	}
	.controls {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	input[type='range'] {
		flex: 1;
		accent-color: var(--primary);
	}
	.time {
		min-width: 40px;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
</style>
