<script lang="ts">
	import { page } from '$app/state';
	import AppBar from '#lib/components/AppBar.svelte';
	import ErrorView from '#lib/components/ErrorView.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import WeightSliders from '#lib/components/picklist/WeightSliders.svelte';
	import { getPicklists, setPicklists } from '#lib/picklists.ts';
	import { goBack } from '#lib/ui.svelte.ts';

	const id = page.url.searchParams.get('id');
	const all = getPicklists();
	const original = all.find((p) => p.id === id);
	let title = $state(original?.title ?? '');
	let weights = $state(original?.weights ?? []);

	function save() {
		setPicklists(all.map((p) => (p.id === id ? { ...p, title, weights: $state.snapshot(weights) } : p)));
		goBack(`/picklist?id=${id}`);
	}
</script>

<AppBar title={original ? `Editing "${original.title}"` : 'Edit picklist'} back backFallback="/picklist?id={id}">
	{#snippet actions()}
		{#if original}<button class="icon-btn" style="color: #4caf50" onclick={save} aria-label="Save changes" title="Save changes"><Icon name="check" /></button>{/if}
	{/snippet}
</AppBar>

{#if !original}
	<ErrorView message="This picklist no longer exists on this device." />
{:else}
	<div class="page-body stack" style="gap: 26px">
		<label class="field"><span>Title</span><input class="input filled" bind:value={title} autocapitalize="words" /></label>
		<WeightSliders bind:weights />
	</div>
{/if}
