<script lang="ts">
	import { page } from '$app/state';
	import { setSourceTeams } from '#lib/api/endpoints.ts';
	import AppBar from '#lib/components/AppBar.svelte';
	import TeamMultiSelect from '#lib/components/settings/TeamMultiSelect.svelte';
	import { clearAnalysisCaches } from '#lib/sourceSettings.ts';
	import { goBack } from '#lib/ui.svelte.ts';

	const initial = (page.url.searchParams.get('teams') ?? '').split(',').filter(Boolean).map(Number);
</script>

<AppBar title="Source teams" back backFallback="/settings" />
<div class="page-body stack" style="flex: 1">
	<TeamMultiSelect
		{initial}
		submitText="Save"
		submit={async (teams) => {
			await setSourceTeams('SPECIFIC_TEAMS', teams.map((t) => t.number));
			clearAnalysisCaches();
			goBack('/settings');
		}}
	/>
</div>
