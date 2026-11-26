<script lang="ts">
	import type { AutoPath } from '#lib/models/autoPath.ts';

	/** Field image with one or more auto paths drawn over it. */
	let {
		paths,
		progress = null,
		color = '#4255F9'
	}: {
		paths: { path: AutoPath; color?: string }[];
		/** Milliseconds into auto; null shows the static path. */
		progress?: number | null;
		color?: string;
	} = $props();
</script>

<div class="field">
	<img src="/images/auto_background.png" alt="Field" />
	<svg viewBox="0 0 100 100" preserveAspectRatio="none">
		{#each paths as entry, i (i)}
			{#if progress === null}
				<polyline
					points={entry.path.randomizedOffsets.map((o) => `${o.x},${o.y}`).join(' ')}
					fill="none"
					stroke={entry.color ?? color}
					stroke-width="0.9"
					stroke-linejoin="round"
					stroke-linecap="round"
					vector-effect="non-scaling-stroke"
					style="stroke-width: 4px"
				/>
			{/if}
		{/each}
	</svg>
	{#if progress !== null}
		{#each paths as entry, i (i)}
			{@const robot = entry.path.positionAt(progress)}
			<span class="robot" style:left="{robot.x}%" style:top="{robot.y}%" style:background={entry.color ?? color}></span>
			{#each entry.path.gamePiecesAt(progress) as piece, j (j)}
				<img
					class="piece"
					class:disrupt={piece.piece === 'disrupt'}
					src={piece.piece === 'fuel' ? '/images/frc_fuel.svg' : '/images/bomb.svg'}
					alt=""
					style:left="{piece.position.x}%"
					style:top="{piece.position.y}%"
				/>
			{/each}
		{/each}
	{/if}
</div>

<style>
	.field {
		position: relative;
		aspect-ratio: 489 / 491;
		overflow: hidden;
		border-radius: 6px;
	}
	.field > img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.robot {
		position: absolute;
		width: 24px;
		height: 24px;
		margin: -12px 0 0 -12px;
		border-radius: 12px;
	}
	.piece {
		position: absolute;
		width: 11px;
		height: 11px;
		margin: -5.5px 0 0 -5.5px;
		filter: brightness(0) invert(1);
	}
	.piece.disrupt {
		width: 21px;
		height: 21px;
		margin: -10.5px 0 0 -10.5px;
	}
</style>
