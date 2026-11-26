<script lang="ts">
	/** Thin bar shown while stale data refreshes in the background. */
	let { active = true }: { active?: boolean } = $props();
</script>

<div class="track" class:active role={active ? 'progressbar' : undefined} aria-label={active ? 'Refreshing' : undefined}>
	{#if active}<div class="bar"></div>{/if}
</div>

<style>
	.track {
		height: 4px;
		overflow: hidden;
		position: relative;
	}
	.track.active {
		background: var(--primary-container);
	}
	.bar {
		position: absolute;
		inset: 0;
		width: 40%;
		background: var(--primary);
		animation: slide 1.2s ease-in-out infinite;
	}
	@keyframes slide {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(250%);
		}
	}
</style>
