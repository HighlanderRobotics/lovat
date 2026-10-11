<script lang="ts">
	import { matchLabel } from '$lib/tournaments/matchLabel';
	import type { z } from 'zod';
	import type { tournamentSchema } from '$lib/server/tournament';

	export let match: z.infer<typeof tournamentSchema>['matches'][number];
	export let playoffType: number | null;
	export let timezone: string | null;
	export let year: number;
	export let teamNames: Map<number, string>;
	export let highlightedTeam: number | undefined = undefined;
	export let onTeamSelect: ((number: number) => void) | undefined = undefined;
	export let id: string | undefined = undefined;
	export let linkToMatch = true;

	function time(value: string | null) {
		if (!value) return 'Time TBD';

		let zone = timezone ?? 'UTC';

		try {
			new Intl.DateTimeFormat('en-US', { timeZone: zone }).format();
		} catch {
			zone = 'UTC';
		}

		return new Intl.DateTimeFormat('en-US', {
			timeZone: zone,
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		}).format(new Date(value));
	}
</script>

<article class="match-card" {id} tabindex="-1" aria-label={matchLabel(match, playoffType)}>
	<div class="match-header">
		<div class="match-title">
			<h4>
				{#if linkToMatch}<a class="match-link" href={`/matches/${match.key}`}
						>{matchLabel(match, playoffType)}</a
					>{:else}{matchLabel(match, playoffType)}{/if}
			</h4>
			<span class="badge">{match.status.replaceAll('_', ' ')}</span>
		</div>
		<div class="scores" aria-label="Alliance scores">
			{#each ['BLUE', 'RED'] as color}
				<span
					class="score"
					class:blue-score={color === 'BLUE'}
					class:red-score={color === 'RED'}
					class:winner={match.winningAlliance === color}
					aria-label={`${color === 'BLUE' ? 'Blue' : 'Red'} alliance score`}
				>
					<span>{match.alliances.find((alliance) => alliance.color === color)?.score ?? '—'}</span>
				</span>
				{#if color === 'BLUE'}<span class="score-divider" aria-hidden="true">–</span>{/if}
			{/each}
		</div>
		<div class="timing">
			<span>Scheduled time <strong>{time(match.scheduledTime)}</strong></span>
			{#if match.actualTime}<span>Actual time <strong>{time(match.actualTime)}</strong></span>{/if}
		</div>
	</div>

	<div class="alliances">
		{#each ['BLUE', 'RED'] as color}
			<div class="alliance" class:red={color === 'RED'} class:blue={color === 'BLUE'}>
				<div class="participants">
					{#each match.teamSlots.filter((slot) => slot.alliance === color) as slot}
						<svelte:element
							this={onTeamSelect ? 'button' : 'a'}
							role={onTeamSelect ? 'button' : 'link'}
							href={onTeamSelect ? undefined : `/teams/${slot.teamNumber}/${year}`}
							class="team-number"
							class:disqualified={slot.disqualified === true}
							class:highlighted={highlightedTeam === slot.teamNumber}
							on:click={() => onTeamSelect?.(slot.teamNumber)}
							aria-label={`${onTeamSelect ? 'Show matches for team' : 'View team'} ${slot.teamNumber}${slot.disqualified ? ', disqualified' : ''}`}
							><strong>{slot.teamNumber}</strong>
							{#if teamNames.has(slot.teamNumber)}<span class="team-name"
									>{teamNames.get(slot.teamNumber)}</span
								>{/if}{#if slot.surrogate || slot.disqualified}<span
									>{#if slot.surrogate}S{/if}{#if slot.surrogate && slot.disqualified}
										·
									{/if}{#if slot.disqualified}DQ{/if}</span
								>{/if}</svelte:element
						>
					{/each}
					{#if !match.teamSlots.some((slot) => slot.alliance === color)}<span>Teams TBD</span>{/if}
				</div>
			</div>
		{/each}
	</div>
</article>

<style>
	.match-link {
		color: inherit;
		text-decoration: none;
	}
	.match-link:focus-visible {
		outline: 2px solid var(--victory-purple);
		outline-offset: 3px;
	}
	.match-card {
		scroll-margin-top: 90px;
		overflow: hidden;
		border-radius: 7px;
		background: var(--secondary-container);
	}
	.match-header {
		padding: 12px 16px;
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		align-items: center;
		gap: 12px;
	}

	.match-title {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
	}
	h4 {
		margin: 0;
		font-size: 15px;
		font-weight: 500;
	}
	.badge {
		background: var(--light-gray);
		border-radius: 5px;
		padding: 5px 7px;
		font-size: 10px;
		letter-spacing: 0.4px;
	}
	.timing {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		font-variant-numeric: tabular-nums;
	}
	.timing strong {
		font-size: 14px;
		font-weight: 500;
	}
	.timing span {
		font-size: 11px;
		color: var(--body);
	}
	.alliances {
		display: grid;
		grid-template-columns: 1fr 1fr;
	}
	/* Alliance tokens shared with Dashboard's darkColorScheme. */
	.alliance {
		padding: 12px 16px;
		min-width: 0;
	}
	.red {
		background: #793f3f;
	}
	.blue {
		background: #364077;
	}
	.scores {
		display: flex;
		justify-content: center;
		gap: 12px;
		align-items: center;
		padding: 0;
	}
	.blue-score > span {
		color: #a2a7d0;
	}
	.red-score > span {
		color: #d0a2a2;
	}
	.score-divider {
		color: var(--body);
	}

	.score {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 20px;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}
	.score.winner > span {
		text-decoration: underline;
		text-underline-offset: 4px;
	}
	.participants {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 10px;
	}
	.team-number {
		min-width: 0;
		overflow-wrap: anywhere;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--on-background);
		cursor: pointer;
		text-align: left;
	}
	.team-number:nth-child(2) {
		align-items: center;
		text-align: center;
	}
	.team-number:nth-child(3) {
		align-items: flex-end;
		text-align: right;
	}
	.team-number strong {
		font-size: 20px;
		font-weight: 400;
	}
	.team-name {
		margin-top: 3px;
	}
	.team-number span {
		font-size: 11px;
		color: #d0a2a2;
	}
	.blue .team-number span {
		color: #a2a7d0;
	}
	.team-number.disqualified strong,
	.team-number.disqualified .team-name {
		text-decoration: line-through;
	}
	.team-number.highlighted strong {
		text-decoration: underline;
		text-underline-offset: 4px;
	}
	.team-number.disqualified.highlighted strong {
		text-decoration: underline line-through;
	}

	.team-number {
		text-decoration: none;
	}
	.team-number:focus-visible {
		outline: 2px solid var(--victory-purple);
		outline-offset: 3px;
	}
	@media (max-width: 700px) {
		.alliances {
			grid-template-columns: 1fr;
		}
		.match-header {
			padding: 10px;
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}
		.scores {
			grid-column: 1 / -1;
			grid-row: 2;
		}
		.match-title {
			max-width: 100%;
		}
		.timing {
			max-width: 100%;
			text-align: right;
		}
		.alliance {
			padding: 10px;
		}
	}
</style>
