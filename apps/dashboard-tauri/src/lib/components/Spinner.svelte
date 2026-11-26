<script lang="ts">
	let { size = 40 }: { size?: number } = $props();
</script>

<svg class="spinner" width={size} height={size} viewBox="0 0 50 50" role="progressbar" aria-label="Loading">
	<circle cx="25" cy="25" r="20" fill="none" stroke-width="4" />
</svg>

<style>
	.spinner {
		animation: rotate 1.4s linear infinite;
	}
	circle {
		stroke: var(--primary);
		stroke-linecap: round;
		animation: dash 1.4s ease-in-out infinite;
	}
	@keyframes rotate {
		to {
			transform: rotate(360deg);
		}
	}
	@keyframes dash {
		0% {
			stroke-dasharray: 1 150;
			stroke-dashoffset: 0;
		}
		50% {
			stroke-dasharray: 90 150;
			stroke-dashoffset: -35;
		}
		100% {
			stroke-dasharray: 90 150;
			stroke-dashoffset: -124;
		}
	}
</style>
