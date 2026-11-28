<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import {
		archiveScouter,
		deleteScouter,
		getScoutReportsByScouter,
		renameScouter,
		unarchiveScouter,
		type ScouterReportInfo
	} from '#lib/api/endpoints.ts';
	import { queryCache } from '#lib/api/query.svelte.ts';
	import AppBar from '#lib/components/AppBar.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import Empty from '#lib/components/Empty.svelte';
	import ErrorView from '#lib/components/ErrorView.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Menu from '#lib/components/Menu.svelte';
	import NameDialog from '#lib/components/scouters/NameDialog.svelte';
	import { toast } from '#lib/toast.svelte.ts';
	import { currentTournament } from '#lib/tournament.svelte.ts';
	import { goBack } from '#lib/ui.svelte.ts';

	const id = page.url.searchParams.get('id') ?? '';
	const archived = page.url.searchParams.get('archived') === 'true';
	let name = $state(page.url.searchParams.get('name') ?? '');
	let reports = $state<ScouterReportInfo[] | null>(null);
	let error = $state<string | null>(null);
	let renaming = $state(false);
	let deleting = $state(false);
	let deleteBusy = $state(false);

	async function load() {
		reports = null;
		error = null;
		try {
			reports = await getScoutReportsByScouter(id);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load scout reports';
		}
	}

	$effect(() => {
		untrack(load);
	});

	/** Lists refetch on mount, but drop stale in-memory copies right away. */
	function invalidateLists() {
		queryCache.clearAll();
	}

	async function setArchived(value: boolean) {
		try {
			await (value ? archiveScouter(id) : unarchiveScouter(id));
			invalidateLists();
			goBack('/scouters');
		} catch (e) {
			toast.error(`Failed to ${value ? 'archive' : 'unarchive'} scouter${e instanceof Error ? `: ${e.message}` : ''}`);
		}
	}

	async function remove() {
		deleteBusy = true;
		try {
			await deleteScouter(id);
			invalidateLists();
			deleting = false;
			goBack('/scouters');
		} catch (e) {
			toast.error(`Failed to delete scouter${e instanceof Error ? `: ${e.message}` : ''}`);
		} finally {
			deleteBusy = false;
		}
	}

	function reportHref(r: ScouterReportInfo) {
		const longKey = `${r.matchIdentity.toMediumKey()}_0`;
		return `/scout_report?${new URLSearchParams({ uuid: r.reportId, team: String(r.teamNumber), match: longKey, scout: name })}`;
	}
</script>

<AppBar title={name} back backFallback="/scouters">
	{#snippet actions()}
		<Menu
			items={archived
				? [
						{ label: 'Delete', icon: 'delete', run: () => (deleting = true) },
						{ label: 'Unarchive', icon: 'unarchive', run: () => setArchived(false) }
					]
				: [
						{ label: 'Rename', icon: 'edit', run: () => (renaming = true) },
						{ label: 'Archive', icon: 'archive', run: () => setArchived(true) }
					]}
		/>
	{/snippet}
</AppBar>

{#if error}
	<ErrorView message={error} onRetry={load} />
{:else if !reports}
	<div class="page-body stack">{#each [0, 1, 2, 3] as i (i)}<div class="skeleton" style="height: 56px"></div>{/each}</div>
{:else if reports.length === 0}
	<Empty
		image="/images/no-notes-dark.png"
		title="No reports found"
		body="{name} does not have any data recorded{currentTournament.value ? ` at ${currentTournament.value.name}` : ''}."
	/>
{:else}
	<div class="list">
		{#each reports as r (r.reportId)}
			<a class="list-item" href={reportHref(r)}>
				<span class="grow body-large">{r.teamNumber} in {r.matchIdentity.getLocalizedDescription({ includeTournament: !currentTournament.value })}</span>
				<Icon name="arrow_right" />
			</a>
		{/each}
	</div>
{/if}

<NameDialog
	bind:open={renaming}
	title="Rename Scouter"
	action="Rename"
	initial={name}
	submit={async (newName) => {
		await renameScouter(id, newName);
		name = newName;
		invalidateLists();
	}}
/>

<Dialog bind:open={deleting} title="Delete Scouter" dismissible={!deleteBusy}>
	<p style="margin: 0">Are you sure you want to delete this scouter? This will delete all of their reports.</p>
	{#snippet actions()}
		<button class="btn btn-text" disabled={deleteBusy} onclick={() => (deleting = false)}>Cancel</button>
		<button class="btn btn-danger" disabled={deleteBusy} onclick={remove}>{deleteBusy ? 'Deleting…' : 'Delete'}</button>
	{/snippet}
</Dialog>

<style>
	.list {
		max-width: 900px;
		width: 100%;
		margin: 0 auto;
	}
</style>
