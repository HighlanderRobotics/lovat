<script lang="ts">
	import type { Snippet } from 'svelte';

	type Tone = 'plain' | 'colored' | 'emphasis';
	let { value, label, tone = 'plain', children }: { value?: string; label: string; tone?: Tone; children?: Snippet } =
		$props();
</script>

<div class="tile {tone}">
	<div class="value headline-small">
		{#if children}{@render children()}{:else}{value}{/if}
	</div>
	<div class="label label-large">{label}</div>
</div>

<style>
	.tile {
		border-radius: 10px;
		padding: 10px;
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-width: 0;
	}
	.plain {
		background: var(--surface-high);
		color: var(--on-surface-variant);
	}
	.colored {
		background: var(--primary-container);
		color: var(--on-primary-container);
	}
	.emphasis {
		background: var(--primary);
		color: var(--on-primary);
	}
	.value {
		display: flex;
		align-items: center;
		gap: 2px;
	}
</style>
