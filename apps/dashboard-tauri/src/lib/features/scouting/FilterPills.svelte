<script lang="ts">
	import { Checkbox } from '@highlanderrobotics/magnolia-svelte/v2';
	import { onMount } from 'svelte';
	let {
		selected,
		onchange,
	}: { selected: string[]; onchange: (values: string[]) => void } = $props();
	let open = $state(false),
		query = $state(''),
		root: HTMLDivElement;
	const options = ['Quals', 'Elims'];
	const matches = $derived(
		options.filter((option) =>
			option.toLowerCase().includes(query.toLowerCase()),
		),
	);
	function toggle(value: string) {
		onchange(
			selected.includes(value)
				? selected.filter((item) => item !== value)
				: [...selected, value],
		);
	}
	onMount(() => {
		const outside = (event: PointerEvent) => {
			if (!root.contains(event.target as Node)) open = false;
		};
		document.addEventListener('pointerdown', outside);
		return () => document.removeEventListener('pointerdown', outside);
	});
</script>

<div class="design-filter-pills" bind:this={root}>
	<div class="design-filter-field">
		{#each selected as value}<button
				class="design-filter-token"
				aria-label={`Remove ${value} filter`}
				onclick={() => toggle(value)}
				>{value}<span aria-hidden="true">×</span></button
			>{/each}
		<input
			aria-label="Add match filter"
			placeholder="Add tag…"
			bind:value={query}
			onfocus={() => (open = true)}
			oninput={() => (open = true)}
			onkeydown={(event) => {
				if (event.key === 'Escape') open = false;
				if (event.key === 'Enter' && matches.length === 1) {
					if (!selected.includes(matches[0])) toggle(matches[0]);
					query = '';
					open = false;
				}
			}}
		/>
		<button
			class="design-filter-open"
			aria-label="Choose match filters"
			aria-expanded={open}
			onclick={() => (open = !open)}
			><img src="/design-assets/6dba2.svg" alt="" /></button
		>
	</div>
	{#if open}<div
			class="design-filter-menu"
			role="group"
			aria-label="Match filters"
		>
			{#each matches as value}<Checkbox
					label={value}
					checked={selected.includes(value)}
					onchange={() => toggle(value)}
				/>{/each}
		</div>{/if}
</div>
