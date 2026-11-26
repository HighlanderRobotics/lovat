<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import AppBar from '#lib/components/AppBar.svelte';
	import FlagBadge from '#lib/components/FlagBadge.svelte';
	import Breakdowns from '#lib/components/lookup/Breakdowns.svelte';
	import Categories from '#lib/components/lookup/Categories.svelte';
	import Notes from '#lib/components/lookup/Notes.svelte';
	import Tabs from '#lib/components/Tabs.svelte';
	import { getTeamLookupFlag } from '#lib/flags.ts';

	const routeTeam = page.url.searchParams.get('team');
	const fromLink = routeTeam !== null && page.url.searchParams.get('nav') !== '1';

	let field = $state(routeTeam ?? '');
	let team = $state<number | null>(routeTeam && /^\d+$/.test(routeTeam) ? Number(routeTeam) : null);
	let tab = $state(Number(page.url.searchParams.get('tab') ?? 0) || 0);
	const flag = getTeamLookupFlag();
	let timer: ReturnType<typeof setTimeout>;

	function onInput() {
		clearTimeout(timer);
		timer = setTimeout(() => {
			team = /^\d+$/.test(field) ? Number(field) : null;
			const url = new URL(page.url.href);
			if (team === null) url.searchParams.delete('team');
			else url.searchParams.set('team', String(team));
			if (!fromLink) url.searchParams.set('nav', '1');
			void goto(url, { replace: true, shallow: true });
		}, 200);
	}
</script>

<AppBar title="Team Lookup" back={fromLink}>
	{#snippet bottom()}
		<div class="search">
			<label class="field grow">
				<span class="sr-only">Team #</span>
				<input class="input" placeholder="Team #" inputmode="numeric" bind:value={field} oninput={onInput} />
			</label>
			{#if team !== null}
				<a href="/team_lookup/flag?team={team}" aria-label="Change team tag" title="Change team tag">
					{#key team}<FlagBadge {team} {flag} />{/key}
				</a>
			{/if}
		</div>
		<Tabs tabs={['Categories', 'Breakdowns', 'Notes']} bind:selected={tab} />
	{/snippet}
</AppBar>

{#if team === null}
	<div class="center" style="flex: 1">Enter a team number</div>
{:else}
	{#key team}
		{#if tab === 0}<Categories {team} />{:else if tab === 1}<Breakdowns {team} />{:else}<Notes {team} />{/if}
	{/key}
{/if}

<style>
	.search {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 19px 24px 8px;
		max-width: 900px;
		margin: 0 auto;
	}
</style>
