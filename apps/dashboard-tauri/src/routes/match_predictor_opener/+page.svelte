<script lang="ts">
	import { goto } from '$app/navigation';
	import AppBar from '#lib/components/AppBar.svelte';
	import TeamNumberFields from '#lib/components/TeamNumberFields.svelte';

	let red = $state(['', '', '']);
	let blue = $state(['', '', '']);
	const valid = $derived([...red, ...blue].every((v) => /^\d+$/.test(v)));
	const labels = ['Team 1', 'Team 2', 'Team 3'];
</script>

<AppBar title="Hypothetical Match Prediction" />

<form
	class="page-body stack"
	onsubmit={(e) => {
		e.preventDefault();
		if (valid) void goto(`/match_predictor?red=${red.join(',')}&blue=${blue.join(',')}&nav=1`);
	}}
>
	<div class="title-medium">Red Alliance</div>
	<TeamNumberFields bind:values={red} {labels} />
	<div class="title-medium" style="margin-top: 10px">Blue Alliance</div>
	<TeamNumberFields bind:values={blue} {labels} />
	<button class="btn btn-filled" type="submit" disabled={!valid} style="margin-top: 10px">View</button>
</form>
