<script lang="ts">
	import type { Note } from '#lib/api/endpoints.ts';
	import Icon from '../Icon.svelte';
	import NotesEditor from '../NotesEditor.svelte';

	let { note, warning = false, onEdit }: { note: Note; warning?: boolean; onEdit?: () => void } = $props();
	let editing = $state(false);
</script>

<div class="note" class:warning>
	<div class="row head">
		<span class="title-medium grow">
			{note.type === 'breakDescription'
				? `Robot broke in ${note.matchIdentity.getLocalizedDescription({ abbreviateName: true })}`
				: note.matchIdentity.getLocalizedDescription()}
		</span>
		{#if note.uuid}
			<button class="icon-btn" aria-label="Edit note" onclick={() => (editing = true)}><Icon name="edit" /></button>
		{/if}
	</div>
	<p>{note.body}</p>
	{#if note.author}<p class="author">{note.author}</p>{/if}
</div>

{#if note.uuid}
	<NotesEditor bind:open={editing} uuid={note.uuid} initialNotes={note.body} onSubmitted={onEdit} />
{/if}

<style>
	.note {
		border-radius: 10px;
		padding: 15px;
		background: var(--primary-container);
		color: var(--on-primary-container);
	}
	.note.warning {
		background: var(--warning-bg);
		color: var(--warning-fg);
	}
	.head {
		align-items: flex-start;
	}
	.icon-btn {
		color: inherit;
		margin: -8px -8px 0 0;
	}
	p {
		margin: 0;
		white-space: pre-wrap;
	}
	.author {
		margin-top: 4px;
		opacity: 0.75;
	}
</style>
