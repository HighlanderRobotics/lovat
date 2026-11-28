<script lang="ts">
	import { addScouter } from '#lib/api/endpoints.ts';
	import AppBar from '#lib/components/AppBar.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import NameDialog from '#lib/components/scouters/NameDialog.svelte';
	import ScouterList from '#lib/components/scouters/ScouterList.svelte';

	let filter = $state('');
	let adding = $state(false);
	let refreshKey = $state(0);
</script>

<AppBar title="Scouters">
	{#snippet actions()}
		<a class="icon-btn" href="/scouters/archived" title="View archived scouters" aria-label="View archived scouters"><Icon name="schedule" /></a>
	{/snippet}
	{#snippet bottom()}
		<div class="search"><input class="input filled" placeholder="Search" bind:value={filter} aria-label="Search scouters" /></div>
	{/snippet}
</AppBar>

<ScouterList archived={false} {filter} {refreshKey} />

<button class="fab" aria-label="Add scouter" title="Add scouter" onclick={() => (adding = true)}><Icon name="add" /></button>

<NameDialog
	bind:open={adding}
	title="Add Scouter"
	action="Add"
	submit={async (name) => {
		await addScouter(name);
		refreshKey++;
	}}
/>

<style>
	.search {
		padding: 0 24px 16px;
		max-width: 900px;
		margin: 0 auto;
	}
	.fab {
		position: fixed;
		right: 16px;
		bottom: calc(16px + var(--safe-bottom));
		width: 56px;
		height: 56px;
		border-radius: 16px;
		border: none;
		background: var(--primary-container);
		color: var(--on-primary-container);
		box-shadow: 0 3px 8px rgba(0, 0, 0, 0.4);
		cursor: pointer;
	}
</style>
