<script lang="ts">
	import AppBar from '#lib/components/AppBar.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { pickedTeams } from '#lib/pickedTeams.svelte.ts';
	import { toast } from '#lib/toast.svelte.ts';
</script>

<AppBar title="Picked Teams" back backFallback="/picklists?tab=2" />

{#if pickedTeams.list.length === 0}
	<div class="center" style="flex: 1">No teams marked as picked.</div>
{:else}
	<ul class="list">
		{#each pickedTeams.list as team (team)}
			<li class="row-item">
				<span class="grow body-large">{team}</span>
				<button
					class="icon-btn"
					aria-label="Remove {team}"
					onclick={() => {
						pickedTeams.remove(team);
						toast.show(`Removed ${team} from picked teams`, { action: { label: 'Undo', run: () => pickedTeams.add(team) } });
					}}><Icon name="delete" /></button
				>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.list {
		list-style: none;
		margin: 0 auto;
		padding: 0;
		max-width: 900px;
		width: 100%;
	}
	.row-item {
		display: flex;
		align-items: center;
		min-height: 56px;
		padding: 0 8px 0 24px;
		border-bottom: 1px solid var(--surface-high);
	}
</style>
