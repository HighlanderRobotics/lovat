<script lang="ts">
	import { page } from '$app/state';
	import AppBar from '#lib/components/AppBar.svelte';
	import FlagBadge from '#lib/components/FlagBadge.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { flagTypes, getTeamLookupFlag, setTeamLookupFlag, startFlag } from '#lib/flags.ts';
	import { goBack } from '#lib/ui.svelte.ts';

	const team = Number(page.url.searchParams.get('team') ?? 8033) || 8033;
	let filter = $state('');
	let selected = $state(getTeamLookupFlag().type);

	const shown = $derived(flagTypes.filter((f) => f.readableName.includes(filter) || f.description.includes(filter)));
</script>

<AppBar title="Team Tags" back backFallback="/team_lookup?team={team}">
	{#snippet bottom()}
		<div class="search"><input class="input" placeholder="Search" bind:value={filter} aria-label="Search tags" /></div>
	{/snippet}
</AppBar>

<div class="list">
	{#each shown as type (type.path)}
		<button
			class="list-item"
			onclick={() => {
				setTeamLookupFlag(startFlag(type));
				selected = type.path;
				goBack(`/team_lookup?team=${team}`);
			}}
		>
			<FlagBadge {team} flag={startFlag(type)} />
			<span class="grow">
				<span class="body-large">{type.readableName}</span><br />
				<span class="subtitle">{type.description}</span>
			</span>
			{#if selected === type.path}<Icon name="check" />{/if}
		</button>
	{/each}
</div>

<style>
	.search {
		padding: 15px;
	}
	.list {
		max-width: 900px;
		margin: 0 auto;
		width: 100%;
	}
</style>
