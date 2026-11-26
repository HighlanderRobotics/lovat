<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { picklistAnalysisQuery, sharePicklist } from '#lib/api/endpoints.ts';
	import { useQuery } from '#lib/api/query.svelte.ts';
	import AppBar from '#lib/components/AppBar.svelte';
	import ErrorView from '#lib/components/ErrorView.svelte';
	import Menu from '#lib/components/Menu.svelte';
	import ExportDialog from '#lib/components/picklist/ExportDialog.svelte';
	import PicklistRanking from '#lib/components/picklist/PicklistRanking.svelte';
	import { getPicklistFlags } from '#lib/flags.ts';
	import { getPicklists } from '#lib/picklists.ts';
	import { toast } from '#lib/toast.svelte.ts';

	const picklist = getPicklists().find((p) => p.id === page.url.searchParams.get('id'));
	const flags = getPicklistFlags().map((f) => f.type);
	const query = useQuery(() => (picklist ? picklistAnalysisQuery(flags, picklist.weights) : null));
	let exporting = $state(false);

	async function share() {
		if (!picklist) return;
		toast.show('Uploading...');
		try {
			await sharePicklist(picklist);
			toast.show('Successfully uploaded picklist.');
		} catch (e) {
			toast.error(`Error uploading picklist: ${e instanceof Error ? e.message : e}`);
		}
	}
</script>

<AppBar title={picklist?.title ?? 'Picklist'} back backFallback="/picklists">
	{#snippet actions()}
		{#if picklist}
			<Menu
				items={[
					{ label: 'Edit', icon: 'edit', run: () => goto(`/picklist/edit?id=${picklist.id}`) },
					{ label: 'Share with team', icon: 'upload', run: share },
					{ label: 'Export CSV', icon: 'download', run: () => (exporting = true) }
				]}
			/>
		{/if}
	{/snippet}
</AppBar>

{#if !picklist}
	<ErrorView message="This picklist no longer exists on this device." />
{:else}
	<PicklistRanking {query} title={picklist.title} />
	<ExportDialog bind:open={exporting} title={picklist.title} weights={() => picklist.weights} />
{/if}
