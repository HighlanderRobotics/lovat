<script lang="ts">
	let {
		tabs,
		selected = $bindable(0)
	}: {
		tabs: string[];
		selected?: number;
	} = $props();
</script>

<div class="tabs" role="tablist">
	{#each tabs as tab, i (tab)}
		<button role="tab" aria-selected={selected === i} class:selected={selected === i} onclick={() => (selected = i)}>
			<span>{tab}</span>
		</button>
	{/each}
</div>

<style>
	.tabs {
		display: flex;
		overflow-x: auto;
		border-bottom: 1px solid var(--surface-high);
		scrollbar-width: none;
	}
	button {
		flex: 1 0 auto;
		min-width: 90px;
		height: 48px;
		padding: 0 16px;
		border: none;
		background: transparent;
		color: var(--on-surface-variant);
		font-weight: 500;
		cursor: pointer;
	}
	button span {
		display: inline-block;
		padding: 13px 2px;
		border-bottom: 3px solid transparent;
	}
	button.selected {
		color: var(--primary);
	}
	button.selected span {
		border-bottom-color: var(--primary);
	}
</style>
