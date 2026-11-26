<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { deleteMutablePicklist, deleteSharedPicklist, mutablePicklistsQuery, sharedPicklistsQuery } from '#lib/api/endpoints.ts';
	import { useQuery } from '#lib/api/query.svelte.ts';
	import AppBar from '#lib/components/AppBar.svelte';
	import ErrorView from '#lib/components/ErrorView.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import LinearProgress from '#lib/components/LinearProgress.svelte';
	import Tabs from '#lib/components/Tabs.svelte';
	import { getPicklists, setPicklists } from '#lib/picklists.ts';
	import { toast } from '#lib/toast.svelte.ts';

	let tab = $state(Number(page.url.searchParams.get('tab') ?? 0) || 0);
	let mine = $state(getPicklists());
	const shared = useQuery(() => (tab === 1 ? sharedPicklistsQuery() : null));
	const mutable = useQuery(() => (tab === 2 ? mutablePicklistsQuery() : null));

	// Keep the tab in the URL so Back returns to it.
	$effect(() => {
		const url = new URL(location.href);
		if (url.searchParams.get('tab') === String(tab)) return;
		url.searchParams.set('tab', String(tab));
		void goto(url, { replace: true, shallow: true });
	});

	function deleteMine(index: number) {
		const [removed] = mine.splice(index, 1);
		setPicklists(mine);
		toast.show(`Deleted "${removed.title}"`, {
			action: {
				label: 'Undo',
				run: () => {
					mine.splice(index, 0, removed);
					setPicklists(mine);
				}
			}
		});
	}

	async function deleteRemote(kind: 'shared' | 'mutable', id: string, name: string) {
		if (!confirm(`Delete "${name}" for your whole team?`)) return;
		toast.show('Deleting...');
		try {
			if (kind === 'shared') {
				await deleteSharedPicklist(id);
				shared.refetch();
			} else {
				await deleteMutablePicklist(id);
				mutable.refetch();
			}
			toast.show(`Successfully deleted picklist "${name}"`);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : String(e));
		}
	}
</script>

{#snippet notOnTeam()}
	<div class="page-body stack">
		<img src="/images/welcome-back-dark.png" alt="" style="max-width: 100%" />
		<h2 class="headline-medium">Strategize with your team</h2>
		<p style="margin: 0">Join a team to collaborate on picklists with your teammates.</p>
	</div>
{/snippet}

<AppBar title="Picklists">
	{#snippet bottom()}
		<Tabs tabs={['Mine', 'Shared', 'Mutable']} bind:selected={tab} />
	{/snippet}
</AppBar>

{#if tab === 0}
	<ul class="list">
		{#each mine as picklist, i (picklist.id)}
			<li class="row-item">
				<a class="list-item" href="/picklist?id={picklist.id}">
					<span class="grow body-large">{picklist.title}</span><Icon name="arrow_right" />
				</a>
				<button class="icon-btn" aria-label="Delete {picklist.title}" title="Delete" onclick={() => deleteMine(i)}><Icon name="delete" /></button>
			</li>
		{/each}
	</ul>
	<a class="fab" href="/picklist/new" aria-label="New picklist" title="New picklist"><Icon name="add" /></a>
{:else}
	{@const q = tab === 1 ? shared : mutable}
	<LinearProgress active={q.isFetching} />
	{#if q.error && !q.hasData}
		{#if q.error === 'Not on team'}{@render notOnTeam()}{:else}<ErrorView message={q.error} onRetry={q.refetch} />{/if}
	{:else if tab === 1 && shared.data}
		<ul class="list">
			{#each shared.data as p (p.id)}
				<li class="row-item">
					<a class="list-item" href="/shared_picklist?id={p.id}&title={encodeURIComponent(p.title)}">
						<span class="grow"><span class="body-large">{p.title}</span>{#if p.author}<br /><span class="subtitle">{p.author}</span>{/if}</span>
						<Icon name="arrow_right" />
					</a>
					<button class="icon-btn" aria-label="Delete {p.title}" title="Delete" onclick={() => deleteRemote('shared', p.id, p.title)}><Icon name="delete" /></button>
				</li>
			{/each}
		</ul>
	{:else if tab === 2 && mutable.data}
		<ul class="list">
			{#each mutable.data as p (p.uuid)}
				<li class="row-item">
					<a class="list-item" href="/mutable_picklist?id={p.uuid}">
						<span class="grow"><span class="body-large">{p.name}</span>{#if p.author}<br /><span class="subtitle">{p.author}</span>{/if}</span>
						<Icon name="arrow_right" />
					</a>
					<button class="icon-btn" aria-label="Delete {p.name}" title="Delete" onclick={() => deleteRemote('mutable', p.uuid, p.name)}><Icon name="delete" /></button>
				</li>
			{/each}
		</ul>
	{/if}
{/if}

<style>
	.list {
		list-style: none;
		margin: 0 auto;
		padding: 0;
		max-width: 900px;
		width: 100%;
	}
	.row-item {
		display: flex;
		align-items: center;
		border-bottom: 1px solid var(--surface-high);
		padding-right: 8px;
	}
	.fab {
		position: fixed;
		right: 16px;
		bottom: calc(16px + var(--safe-bottom));
		width: 56px;
		height: 56px;
		border-radius: 16px;
		background: var(--primary-container);
		color: var(--on-primary-container);
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 3px 8px rgba(0, 0, 0, 0.4);
	}
</style>
