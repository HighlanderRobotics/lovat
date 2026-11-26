<script lang="ts">
	import AppBar from '#lib/components/AppBar.svelte';
	import ScouterList from '#lib/components/scouters/ScouterList.svelte';

	let filter = $state('');
</script>

<AppBar title="Archived Scouters" back backFallback="/scouters">
	{#snippet bottom()}
		<!-- svelte-ignore a11y_autofocus -->
		<div class="search"><input class="input filled" placeholder="Search" bind:value={filter} autofocus aria-label="Search archived scouters" /></div>
	{/snippet}
</AppBar>

<ScouterList archived={true} {filter} />

<style>
	.search {
		padding: 0 24px 16px;
		max-width: 900px;
		margin: 0 auto;
	}
</style>
