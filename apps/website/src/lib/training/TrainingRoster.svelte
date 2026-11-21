<script lang="ts">
	import type { Participant } from './types';
	export let participants: Participant[];
	export let submitted = false;
	export let columns = 2;
	export let onRemove: ((person: Participant) => void) | undefined = undefined;
</script>

<div class="roster" style={`--columns: ${columns}`}>
	{#each participants as person (person.uuid)}
		{@const complete = submitted ? person.status === 'SUBMITTED' : person.ready && person.connected}
		<div
			class="person"
			aria-label={`${person.name ?? 'Unnamed scout'}, team ${person.teamNumber}, ${complete ? (submitted ? 'submitted' : 'ready') : person.connected ? 'preparing' : 'disconnected'}`}
		>
			<span class="name">{person.name ?? 'Unnamed scout'}</span><span class="team"
				>({person.teamNumber})</span
			>
			{#if complete}<img
					class="check"
					src="/assets/training/check.svg"
					width="24"
					height="24"
					alt={submitted ? 'Submitted' : 'Ready'}
				/>{/if}
			{#if onRemove}<button
					class="remove"
					aria-label={`Remove ${person.name ?? 'scout'}`}
					on:click={() => onRemove?.(person)}
					><img src="/assets/training/close.svg" width="24" height="24" alt="" /></button
				>{/if}
		</div>
	{/each}
</div>

<style>
	.roster {
		display: grid;
		grid-template-columns: repeat(var(--columns), minmax(0, 1fr));
		gap: 6px 12px;
		align-content: start;
	}
	.person {
		position: relative;
		height: 33px;
		display: flex;
		gap: 4px;
		align-items: center;
		padding: 0 34px 0 12px;
		border-radius: 7px;
		background: var(--secondary-container);
		color: white;
		min-width: 0;
	}
	.name {
		font-size: 14px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.team {
		font-size: 10px;
		color: #ffffff80;
		white-space: nowrap;
	}
	.check {
		position: absolute;
		right: 7px;
		top: 5px;
	}
	.remove {
		display: flex;
		position: absolute;
		left: -25px;
		top: 4px;
		border: 0;
		padding: 0;
		background: var(--background);
		border-radius: 4px;
		opacity: 0;
		cursor: pointer;
	}
	.person:hover .remove,
	.person:focus-within .remove {
		opacity: 1;
	}
	@media (max-width: 600px) {
		.roster {
			grid-template-columns: 1fr;
		}
		.remove {
			opacity: 1;
		}
	}
</style>
