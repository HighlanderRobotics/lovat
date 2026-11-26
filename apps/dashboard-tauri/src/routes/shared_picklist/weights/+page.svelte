<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { getSharedPicklist, type ConfiguredPicklist } from '#lib/api/endpoints.ts';
	import AppBar from '#lib/components/AppBar.svelte';
	import ErrorView from '#lib/components/ErrorView.svelte';
	import WeightSliders from '#lib/components/picklist/WeightSliders.svelte';
	import Spinner from '#lib/components/Spinner.svelte';
	import { picklistWeightNames } from '#lib/metrics.ts';

	const id = page.url.searchParams.get('id') ?? '';
	const title = page.url.searchParams.get('title') ?? '';
	let picklist = $state<ConfiguredPicklist | null>(null);
	let error = $state<string | null>(null);

	async function load() {
		error = null;
		try {
			picklist = await getSharedPicklist(id, picklistWeightNames);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	$effect(() => {
		untrack(load);
	});
</script>

<AppBar title="{title} - Weights" back />

{#if error}
	<ErrorView message={error} onRetry={load} />
{:else if !picklist}
	<div class="center" style="flex: 1"><Spinner /></div>
{:else}
	<div class="page-body"><WeightSliders weights={picklist.weights} disabled /></div>
{/if}
