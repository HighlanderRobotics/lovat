<script lang="ts">
	import type { SourceTeamMode } from '#lib/api/endpoints.ts';
	import type { Team } from '#lib/models/types.ts';

	let { team, selected = $bindable(null) }: { team: Team | null; selected?: SourceTeamMode | null } = $props();

	const options = $derived(
		(
			[
				['THIS_TEAM', 'only_team_', `Collected only by ${team?.number ?? 'your team'}`],
				['ALL_TEAMS', 'any_team_', 'Collected by any team'],
				['SPECIFIC_TEAMS', 'specific_teams_', 'Choose specific teams']
			] as const
		).filter(([mode]) => team || mode !== 'THIS_TEAM')
	);
</script>

<div class="cards" role="radiogroup">
	{#each options as [mode, image, label] (mode)}
		<button class="card-option" class:selected={selected === mode} role="radio" aria-checked={selected === mode} onclick={() => (selected = mode)}>
			<img src="/images/{image}{selected === mode ? 'selected' : 'default'}.png" alt="" />
			<span class="title-medium">{label}</span>
		</button>
	{/each}
</div>

<style>
	.cards {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.card-option {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--outline-variant);
		border-radius: 10px;
		overflow: hidden;
		padding: 0;
		background: var(--primary-container);
		color: var(--on-primary-container);
		cursor: pointer;
		text-align: left;
		transition: background 200ms;
	}
	.card-option.selected {
		background: var(--primary);
		color: var(--on-primary);
	}
	img {
		width: 100%;
		display: block;
	}
	span {
		padding: 7px 10px;
	}
</style>
