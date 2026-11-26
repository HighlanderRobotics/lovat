<script lang="ts">
	import type { PicklistWeight } from '#lib/api/endpoints.ts';

	let { weights = $bindable(), disabled = false }: { weights: PicklistWeight[]; disabled?: boolean } = $props();
</script>

<div class="weights">
	{#each weights as weight, i (weight.path)}
		<label class="weight">
			<span class="title-medium">{weight.localizedName}</span>
			<input type="range" min="0" max="1" step="0.125" bind:value={weights[i].value} {disabled} aria-valuetext={String(weight.value)} />
		</label>
	{/each}
</div>

<style>
	.weights {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.weight {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	input {
		accent-color: var(--primary);
		width: 100%;
	}
</style>
