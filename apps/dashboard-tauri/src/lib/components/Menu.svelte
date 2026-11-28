<script lang="ts">
	import Icon from './Icon.svelte';

	interface Item {
		label: string;
		icon: string;
		run: () => void;
	}

	let { items, label = 'More options' }: { items: Item[]; label?: string } = $props();
	let open = $state(false);
</script>

<svelte:window onclick={() => (open = false)} />

<div class="menu-wrap">
	<button
		class="icon-btn"
		aria-label={label}
		aria-haspopup="menu"
		aria-expanded={open}
		onclick={(e) => {
			e.stopPropagation();
			open = !open;
		}}><Icon name="more_vert" /></button
	>
	{#if open}
		<div class="menu" role="menu">
			{#each items as item (item.label)}
				<button
					role="menuitem"
					onclick={() => {
						open = false;
						item.run();
					}}><Icon name={item.icon} /> {item.label}</button
				>
			{/each}
		</div>
	{/if}
</div>

<style>
	.menu-wrap {
		position: relative;
	}
	.menu {
		position: absolute;
		right: 0;
		top: 44px;
		z-index: 30;
		min-width: 220px;
		padding: 8px 0;
		border-radius: 4px;
		background: var(--surface-high);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
	}
	.menu button {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 12px 16px;
		border: none;
		background: none;
		text-align: left;
		cursor: pointer;
	}
	.menu button:hover {
		background: rgba(255, 255, 255, 0.06);
	}
</style>
