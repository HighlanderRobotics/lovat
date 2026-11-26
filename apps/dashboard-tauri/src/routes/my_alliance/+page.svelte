<script lang="ts">
	import { goto } from '$app/navigation';
	import AppBar from '#lib/components/AppBar.svelte';
	import TeamNumberFields from '#lib/components/TeamNumberFields.svelte';

	let values = $state(['', '', '']);
	const valid = $derived(values.every((v) => /^\d+$/.test(v)));
</script>

<AppBar title="My Alliance" />

<form class="page-body stack" style="gap: 20px" onsubmit={(e) => { e.preventDefault(); if (valid) void goto(`/alliance?teams=${values.join(',')}`); }}>
	<TeamNumberFields bind:values labels={['Team 1', 'Team 2', 'Team 3']} />
	<button class="btn btn-filled" type="submit" disabled={!valid}>View</button>
</form>
