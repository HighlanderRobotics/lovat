<script lang="ts">
	import AppBar from '#lib/components/AppBar.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import WeightSliders from '#lib/components/picklist/WeightSliders.svelte';
	import { defaultWeights, getPicklists, setPicklists } from '#lib/picklists.ts';
	import { prefs } from '#lib/storage.ts';
	import { toast } from '#lib/toast.svelte.ts';
	import { goBack } from '#lib/ui.svelte.ts';

	let title = $state('');
	let weights = $state(defaultWeights());

	function create() {
		setPicklists([
			...getPicklists(),
			{ id: crypto.randomUUID(), title, weights: $state.snapshot(weights), author: prefs.getString('username') }
		]);
		toast.show('Created picklist');
		goBack('/picklists');
	}
</script>

<AppBar title="New Picklist" back backFallback="/picklists">
	{#snippet actions()}
		<button class="icon-btn create" disabled={!title} onclick={create} aria-label="Create" title="Create"><Icon name="check" /></button>
	{/snippet}
</AppBar>

<div class="page-body stack" style="gap: 26px">
	<label class="field"><span>Title</span><input class="input filled" bind:value={title} autocapitalize="words" /></label>
	<WeightSliders bind:weights />
</div>

<style>
	.create:not(:disabled) {
		color: #4caf50;
	}
</style>
