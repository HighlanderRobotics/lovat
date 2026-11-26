<script lang="ts">
	import { untrack } from 'svelte';
	import { getAnalysts, promoteAnalyst, type Analyst } from '#lib/api/endpoints.ts';
	import AppBar from '#lib/components/AppBar.svelte';
	import ErrorView from '#lib/components/ErrorView.svelte';

	let analysts = $state<Analyst[] | null>(null);
	let error = $state<string | null>(null);
	let submitting = $state(false);

	async function load() {
		try {
			analysts = (await getAnalysts()) ?? [];
		} catch {
			error = 'Failed to load analysts';
		}
	}

	$effect(() => {
		untrack(load);
	});

	async function promote(a: Analyst) {
		submitting = true;
		error = null;
		try {
			await promoteAnalyst(a.id);
			await load();
		} catch {
			error = 'Failed to promote analyst';
		} finally {
			submitting = false;
		}
	}
</script>

<AppBar title="Promote analysts" back backFallback="/settings" loading={submitting} />

{#if error && !analysts}
	<ErrorView message={error} onRetry={load} />
{:else if !analysts}
	<div class="page-body stack">{#each [0, 1, 2] as i (i)}<div class="skeleton" style="height: 56px"></div>{/each}</div>
{:else if analysts.length === 0}
	<div class="page-body">There are no analysts on your team to promote.</div>
{:else}
	{#if error}<p class="page-body" style="color: var(--error)">{error}</p>{/if}
	<div class="list">
		{#each analysts as a (a.id)}
			<div class="list-item" style="cursor: default">
				<span class="grow"><span class="body-large">{a.name}</span><br /><span class="subtitle">{a.email}</span></span>
				<button class="btn btn-tonal" disabled={submitting} onclick={() => promote(a)}>Promote</button>
			</div>
		{/each}
	</div>
{/if}

<style>
	.list {
		max-width: 900px;
		width: 100%;
		margin: 0 auto;
	}
</style>
