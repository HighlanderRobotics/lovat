<script lang="ts">
	import { notesQuery } from '#lib/api/endpoints.ts';
	import { useQuery } from '#lib/api/query.svelte.ts';
	import Empty from '../Empty.svelte';
	import ErrorView from '../ErrorView.svelte';
	import Icon from '../Icon.svelte';
	import LinearProgress from '../LinearProgress.svelte';
	import NoteCard from './NoteCard.svelte';

	let { team }: { team: number } = $props();
	const query = useQuery(() => notesQuery(team));
	let showBreaks = $state(false);

	const notes = $derived((query.data ?? []).filter((n) => n.type === 'note'));
	const breaks = $derived((query.data ?? []).filter((n) => n.type === 'breakDescription'));
</script>

<LinearProgress active={query.isFetching && query.hasData} />
{#if query.data}
	{#if query.data.length === 0}
		<Empty image="/images/no-notes-dark.png" title="No notes on {team}" />
	{:else}
		<div class="page-body stack notes">
			{#if breaks.length}
				<button class="robot-broke" onclick={() => (showBreaks = !showBreaks)} aria-expanded={showBreaks}>
					<Icon name="warning" fill />
					<span class="grow">
						<strong>Robot broke</strong><br />
						<span>{showBreaks ? 'Hide' : 'View'} {breaks.length} {breaks.length > 1 ? 'reports' : 'report'}</span>
					</span>
					<Icon name={showBreaks ? 'expand_less' : 'chevron_right'} />
				</button>
				{#if showBreaks}
					{#each breaks as note, i (i)}<NoteCard {note} warning onEdit={query.refetch} />{/each}
				{/if}
			{/if}
			{#each notes as note, i (i)}<NoteCard {note} onEdit={query.refetch} />{/each}
		</div>
	{/if}
{:else if query.error}
	<ErrorView message={query.error} onRetry={query.refetch} />
{:else}
	<div class="page-body stack">
		{#each [90, 140, 74, 120] as h (h)}<div class="skeleton" style="height: {h}px"></div>{/each}
	</div>
{/if}

<style>
	.notes {
		gap: 15px;
	}
	.robot-broke {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 14px;
		border: none;
		border-radius: 10px;
		background: var(--warning-bg);
		color: var(--warning-fg);
		text-align: left;
		cursor: pointer;
	}
</style>
