<script lang="ts">
	import type { MatchScheduleMatch } from '#lib/api/endpoints.ts';
	import AllianceRow from './AllianceRow.svelte';
	import Icon from './Icon.svelte';

	let {
		match,
		badge,
		compact = false
	}: { match: MatchScheduleMatch; badge?: string; compact?: boolean } = $props();

	const predictorHref = $derived(
		`/match_predictor?red=${match.red.map((t) => t.teamNumber).join(',')}&blue=${match.blue.map((t) => t.teamNumber).join(',')}`
	);
</script>

<article class="match" class:compact>
	<div class="header">
		<span class="name">{match.identity.getLocalizedDescription({ includeTournament: false })}</span>
		{#if badge}<span class="badge">{badge}</span>{/if}
		{#if !compact && match.isScouted}<span class="scouted">Scouted</span>{/if}
		<span class="grow"></span>
		<a class="icon-btn" href={predictorHref} title="Match Predictor" aria-label="Match Predictor">
			<Icon name={compact ? 'chevron_right' : 'psychology'} />
		</a>
	</div>
	{#if compact}
		<AllianceRow {match} alliance="blue" showDetails={false} compact />
		<AllianceRow {match} alliance="red" showDetails={false} compact />
	{:else}
		<AllianceRow {match} alliance="red" />
		<AllianceRow {match} alliance="blue" />
	{/if}
</article>

<style>
	.match {
		border-radius: 8px;
		overflow: hidden;
		background: var(--surface-high);
		display: flex;
		flex-direction: column;
	}
	.match.compact {
		height: 122px;
		border-radius: 7px;
	}
	.header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 2px 4px 2px 10px;
		min-height: 46px;
	}
	.name {
		font-size: 12px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.compact .name {
		font-size: 14px;
	}
	.badge {
		padding: 5px 7px;
		border-radius: 5px;
		background: var(--secondary-container);
		color: var(--on-secondary-container);
		font-size: 10px;
		font-weight: 500;
		letter-spacing: 0.4px;
		white-space: nowrap;
	}
	.scouted {
		padding: 3px 6px;
		border-radius: 4px;
		background: var(--primary);
		color: var(--on-primary);
		font-size: 12px;
		font-weight: 500;
	}
</style>
