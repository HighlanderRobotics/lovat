<script lang="ts">
	import { addScouter } from '#lib/api/endpoints.ts';
	import type { Scout } from '#lib/models/types.ts';
	import { toast } from '#lib/toast.svelte.ts';
	import Icon from '../Icon.svelte';

	/** Scouters assigned to one robot in a shift, with search-to-add. */
	let {
		label,
		scouts = $bindable(),
		allScouts,
		onScouterAdded
	}: { label: string; scouts: Scout[]; allScouts: Scout[]; onScouterAdded: () => Promise<void> } = $props();

	let query = $state('');
	let focused = $state(false);
	let adding = $state(false);

	const matches = $derived(
		allScouts
			.filter((s) => !scouts.some((x) => x.id === s.id) && s.name.toLowerCase().includes(query.toLowerCase()))
			.slice(0, 8)
	);

	function pick(scout: Scout) {
		scouts = [...scouts, scout];
		query = '';
	}

	async function createAndPick() {
		adding = true;
		try {
			const scout = await addScouter(query.trim());
			await onScouterAdded();
			pick(scout);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to add scouter');
		} finally {
			adding = false;
		}
	}
</script>

<div class="picker">
	<div class="label-large">{label}</div>
	{#each scouts as scout (scout.id)}
		<div class="assigned">
			<span class="grow">{scout.name}</span>
			<button class="icon-btn" aria-label="Remove {scout.name} from {label}" onclick={() => (scouts = scouts.filter((s) => s.id !== scout.id))}>
				<Icon name="close" />
			</button>
		</div>
	{/each}
	<div class="search">
		<input
			class="input filled"
			placeholder="Add..."
			bind:value={query}
			aria-label="Add scouter to {label}"
			onfocus={() => (focused = true)}
			onblur={() => setTimeout(() => (focused = false), 150)}
		/>
		{#if focused && query}
			<ul class="suggestions">
				{#each matches as scout (scout.id)}
					<li><button onmousedown={(e) => e.preventDefault()} onclick={() => pick(scout)}>{scout.name}</button></li>
				{/each}
				{#if !allScouts.some((s) => s.name.toLowerCase() === query.trim().toLowerCase())}
					<li>
						<button class="create" disabled={adding} onmousedown={(e) => e.preventDefault()} onclick={createAndPick}>
							<Icon name="person_add" size={18} /> Add scouter “{query.trim()}”
						</button>
					</li>
				{/if}
			</ul>
		{/if}
	</div>
</div>

<style>
	.picker {
		display: flex;
		flex-direction: column;
		gap: 7px;
	}
	.assigned {
		display: flex;
		align-items: center;
		padding-left: 14px;
		min-height: 48px;
		border-radius: 4px 4px 0 0;
		background: var(--surface-high);
	}
	.search {
		position: relative;
	}
	.suggestions {
		position: absolute;
		left: 0;
		right: 0;
		top: 100%;
		z-index: 20;
		list-style: none;
		margin: 4px 0 0;
		padding: 4px 0;
		background: var(--surface-higher);
		border-radius: 4px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
	}
	.suggestions button {
		width: 100%;
		text-align: left;
		padding: 12px 16px;
		border: none;
		background: none;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.suggestions button:hover {
		background: rgba(255, 255, 255, 0.06);
	}
	.create {
		color: var(--primary);
	}
</style>
