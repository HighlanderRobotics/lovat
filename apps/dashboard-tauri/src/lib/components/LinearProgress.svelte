<script lang="ts">
	import { ProgressBar } from '@highlanderrobotics/magnolia-svelte/v2';
	let { active = true }: { active?: boolean } = $props();
</script>

{#if active}<ProgressBar label="Refreshing" tone="accent" />{:else}<div
		style="height:4px"
	></div>{/if}
