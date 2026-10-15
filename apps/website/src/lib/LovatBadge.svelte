<script lang="ts">
	export let compact = false;
</script>

<span
	class="lovat-badge"
	class:compact
	role="img"
	aria-label="Uses Lovat"
	title="Registered Lovat team"
>
	<img src="/favicon-dark.png" alt="" />
	{#if !compact}<span>Uses Lovat</span>{/if}
</span>

<style>
	.lovat-badge {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 5px 10px;
		border: 1px solid #74658b;
		border-radius: 999px;
		background: #292438;
		color: #e2d6fb;
		font-size: 12px;
		font-weight: 500;
		white-space: nowrap;
		flex-shrink: 0;
	}
	img {
		width: 18px;
		height: 18px;
		object-fit: contain;
	}
	.compact {
		padding: 3px;
	}
	.compact img {
		width: 14px;
		height: 14px;
	}
</style>
