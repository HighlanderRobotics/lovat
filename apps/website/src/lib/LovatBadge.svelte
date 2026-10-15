<script lang="ts">
	export let compact = false;
</script>

<span class="lovat-badge" class:compact role="img" aria-label="Uses Lovat" title="Registered Lovat team">
	<span class="mark" aria-hidden="true"></span>
	{#if !compact}<span>Uses Lovat</span>{/if}
</span>

<style>
	.lovat-badge {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--body);
		font-size: 12px;
		font-weight: 500;
		white-space: nowrap;
		flex-shrink: 0;
		opacity: 0.65;
	}
	.mark {
		width: 18px;
		height: 18px;
		background: currentColor;
		mask: url('/assets/icons/lovat-mark.png') center / 170% no-repeat;
	}
	.compact {
		color: inherit;
		opacity: 0.55;
	}
	.compact .mark {
		width: 14px;
		height: 14px;
	}
</style>
