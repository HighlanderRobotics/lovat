<script lang="ts">
	import { numToStringRounded } from '#lib/metrics.ts';

	interface Point {
		value: number | null;
		label: string;
	}

	/** Per-match values as a smoothed line, oldest on the left. */
	let { points, max, axisLabel }: { points: Point[]; max?: number; axisLabel: string } = $props();

	const W = 364;
	const H = 229;
	const pad = { left: 44, right: 10, top: 12, bottom: 12 };

	const values = $derived(points.map((p) => p.value).filter((v): v is number => v !== null));
	const yMax = $derived(max ?? niceMax(Math.max(1, ...values)));
	const ticks = $derived(Array.from({ length: 5 }, (_, i) => (yMax / 4) * i));

	function niceMax(v: number) {
		const magnitude = 10 ** Math.floor(Math.log10(v));
		const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude * 4 >= v) ?? 10;
		return step * magnitude * 4;
	}

	const x = (i: number) => pad.left + (points.length <= 1 ? 0.5 : i / (points.length - 1)) * (W - pad.left - pad.right);
	const y = (v: number) => H - pad.bottom - (v / yMax) * (H - pad.top - pad.bottom);

	const coords = $derived(
		points.flatMap((p, i) => (p.value === null ? [] : [{ x: x(i), y: y(Math.min(p.value, yMax)), p }]))
	);

	/** Monotone-ish Catmull-Rom curve that does not overshoot. */
	const path = $derived.by(() => {
		if (coords.length === 0) return '';
		let d = `M${coords[0].x},${coords[0].y}`;
		for (let i = 1; i < coords.length; i++) {
			const p0 = coords[i - 2] ?? coords[i - 1];
			const p1 = coords[i - 1];
			const p2 = coords[i];
			const p3 = coords[i + 1] ?? p2;
			const t = 0.4 / 3;
			const c1y = Math.min(Math.max(p1.y + (p2.y - p0.y) * t, Math.min(p1.y, p2.y)), Math.max(p1.y, p2.y));
			const c2y = Math.min(Math.max(p2.y - (p3.y - p1.y) * t, Math.min(p1.y, p2.y)), Math.max(p1.y, p2.y));
			d += ` C${p1.x + (p2.x - p0.x) * t},${c1y} ${p2.x - (p3.x - p1.x) * t},${c2y} ${p2.x},${p2.y}`;
		}
		return d;
	});

	let hover = $state<number | null>(null);
</script>

<div class="chart">
	{#if points.length === 0}
		<div class="empty">No matches</div>
	{:else}
		<svg viewBox="0 0 {W} {H}" role="img" aria-label="{axisLabel} by match">
			{#each ticks as tick (tick)}
				<line x1={pad.left} x2={W - pad.right} y1={y(tick)} y2={y(tick)} class="grid" />
				<text x={pad.left - 6} y={y(tick)} class="tick" text-anchor="end" dominant-baseline="middle">{numToStringRounded(tick)}</text>
			{/each}
			<text class="axis" transform="translate(10 {H / 2}) rotate(-90)" text-anchor="middle">{axisLabel}</text>
			<path d={path} class="line" />
			{#each coords as c, i (i)}
				<circle
					cx={c.x}
					cy={c.y}
					r={hover === i ? 5 : 3}
					class="dot"
					role="presentation"
					onmouseenter={() => (hover = i)}
					onmouseleave={() => (hover = null)}
				/>
			{/each}
			{#if hover !== null && coords[hover]}
				{@const c = coords[hover]}
				<g transform="translate({Math.min(c.x, W - 150)} {Math.max(c.y - 30, 4)})">
					<rect width="150" height="22" rx="4" class="tip" />
					<text x="6" y="15" class="tip-text">{c.p.label}: {numToStringRounded(c.p.value)}</text>
				</g>
			{/if}
		</svg>
	{/if}
</div>

<style>
	.chart {
		width: 100%;
		max-width: 640px;
		margin: 0 auto;
		aspect-ratio: 364 / 229;
		border-radius: 10px;
		background: var(--surface-high);
		padding: 8px;
	}
	.empty {
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	svg {
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	.grid {
		stroke: var(--outline-variant);
		stroke-width: 1;
	}
	.tick,
	.axis {
		fill: var(--on-surface-variant);
		font-size: 11px;
	}
	.line {
		fill: none;
		stroke: var(--primary);
		stroke-width: 2.5;
	}
	.dot {
		fill: var(--primary);
		cursor: pointer;
	}
	.tip {
		fill: var(--surface-higher);
	}
	.tip-text {
		fill: var(--on-surface);
		font-size: 11px;
	}
</style>
