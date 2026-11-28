<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		createMutablePicklist,
		getSharedPicklist,
		picklistAnalysisQuery,
		type PicklistAnalysisTeam
	} from '#lib/api/endpoints.ts';
	import { useQuery } from '#lib/api/query.svelte.ts';
	import AppBar from '#lib/components/AppBar.svelte';
	import Menu from '#lib/components/Menu.svelte';
	import ExportDialog from '#lib/components/picklist/ExportDialog.svelte';
	import PicklistRanking from '#lib/components/picklist/PicklistRanking.svelte';
	import { getPicklistFlags } from '#lib/flags.ts';
	import { picklistWeightNames } from '#lib/metrics.ts';
	import { toast } from '#lib/toast.svelte.ts';

	const id = page.url.searchParams.get('id') ?? '';
	const title = page.url.searchParams.get('title') ?? 'Shared picklist';
	const flags = getPicklistFlags().map((f) => f.type);
	const load = () => getSharedPicklist(id, picklistWeightNames);
	let exporting = $state(false);

	const query = useQuery<PicklistAnalysisTeam[]>(() => ({
		key: ['sharedPicklistAnalysis', id, flags],
		label: 'picklist analysis',
		fn: async () => picklistAnalysisQuery(flags, (await load()).weights).fn()
	}));

	async function convert() {
		toast.show('Converting to mutable...');
		try {
			const picklist = await load();
			const teams = (await picklistAnalysisQuery([], picklist.weights).fn()).map((t) => t.teamNumber);
			if (teams.length === 0) throw new Error('Failed to fetch team rankings.');
			await createMutablePicklist({ uuid: picklist.id, name: picklist.title, teams, author: picklist.author });
			toast.show('Successfully converted to mutable.');
		} catch (e) {
			toast.error(`Error converting to mutable: ${e instanceof Error ? e.message : e}`);
		}
	}
</script>

<AppBar {title} back backFallback="/picklists?tab=1">
	{#snippet actions()}
		<Menu
			items={[
				{ label: 'Convert to mutable', icon: 'swap_vert', run: convert },
				{ label: 'View weights', icon: 'balance', run: () => goto(`/shared_picklist/weights?id=${id}&title=${encodeURIComponent(title)}`) },
				{ label: 'Export CSV', icon: 'download', run: () => (exporting = true) }
			]}
		/>
	{/snippet}
</AppBar>

<PicklistRanking {query} {title} />
<ExportDialog bind:open={exporting} {title} weights={async () => (await load()).weights} />
