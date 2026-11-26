<script lang="ts">
	import { longMatchKey, type MatchScheduleMatch } from '#lib/api/endpoints.ts';
	import type { Alliance } from '#lib/models/match.ts';
	import Icon from './Icon.svelte';

	let {
		match,
		alliance,
		showDetails = true,
		compact = false
	}: { match: MatchScheduleMatch; alliance: Alliance; showDetails?: boolean; compact?: boolean } = $props();

	const teams = $derived(alliance === 'red' ? match.red : match.blue);
	const allianceHref = $derived(`/alliance?teams=${teams.map((t) => t.teamNumber).join(',')}`);
</script>

<div class="alliance {alliance}" class:compact>
	{#each teams as info, i (i)}
		{@const scouted = info.scouters.some((s) => s.isScouted) || info.externalReportCount !== 0}
		<div class="team" style:align-items={i === 0 ? 'flex-start' : i === 1 ? 'center' : 'flex-end'}>
			<div class="team-row">
				<a class="number" href="/team_lookup?team={info.teamNumber}">{info.teamNumber}</a>
				{#if scouted}
					<a
						class="reports"
						href="/scout_reports?key={longMatchKey(match, alliance, i)}&team={info.teamNumber}"
						title="View report data"
						aria-label="View report data for {info.teamNumber}"><Icon name="description" size={16} /></a
					>
				{/if}
			</div>
			{#if showDetails}
				<div class="scouters">
					{#each info.scouters as s, j (j)}
						<div class="scouter">
							<Icon name={s.isScouted ? 'check_circle' : 'radio_button_unchecked'} size={16} fill={s.isScouted} />
							<span>{s.name}</span>
						</div>
					{/each}
					{#if info.externalReportCount !== 0}
						<div class="external">
							{info.externalReportCount} external<br />report{info.externalReportCount === 1 ? '' : 's'}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/each}
	<a class="open" href={allianceHref} aria-label="Open {alliance} alliance"><Icon name="chevron_right" size={18} /></a>
</div>

<style>
	.alliance {
		display: flex;
		align-items: flex-start;
		padding: 10px;
		gap: 4px;
		position: relative;
	}
	.alliance.compact {
		padding: 7px 10px;
		align-items: center;
		flex: 1;
	}
	.red {
		background: var(--red-alliance);
		--on: var(--on-red-alliance);
	}
	.blue {
		background: var(--blue-alliance);
		--on: var(--on-blue-alliance);
	}
	.team {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.team-row {
		display: flex;
		align-items: center;
		gap: 2px;
	}
	.number {
		font-size: 22px;
		line-height: 28px;
		color: var(--on-surface);
		text-decoration: none;
	}
	.compact .number {
		font-size: 16px;
		line-height: 24px;
		color: #e0e0e0;
	}
	.number:hover {
		text-decoration: underline;
	}
	.reports {
		color: var(--on);
		display: inline-flex;
	}
	.scouters {
		display: flex;
		flex-direction: column;
		color: var(--on);
		font-size: 11px;
		font-weight: 500;
		max-width: 100%;
	}
	.scouter {
		display: flex;
		align-items: center;
		gap: 2px;
		min-width: 0;
	}
	.scouter span {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.external {
		padding-top: 2px;
		line-height: 1.1;
	}
	.open {
		color: var(--on);
		align-self: center;
		display: inline-flex;
		opacity: 0.8;
	}
</style>
