<script lang="ts">
	import type { TeamRanking } from '#lib/api/endpoints.ts';
	import { teamPrimaryColor } from '#lib/teamColors.ts';
	import Icon from './Icon.svelte';

	let { ranking }: { ranking: TeamRanking } = $props();

	const teamNumber = $derived(String(ranking.number));
	const rank = $derived((ranking.rank ?? 0) > 0 ? String(ranking.rank) : '—');
	const score = $derived(
		ranking.rankingPoints == null
			? 'RP unavailable'
			: `${ranking.rankingPoints} RP${ranking.matchesPlayed == null ? '' : ` / ${ranking.matchesPlayed} QM`}`
	);

	let primary = $state<string | null>(null);
	let avatarFailed = $state(false);

	$effect(() => {
		primary = null;
		avatarFailed = false;
		let cancelled = false;
		void teamPrimaryColor(teamNumber).then((c) => {
			if (!cancelled) primary = c;
		});
		return () => (cancelled = true);
	});
</script>

<a
	class="team-card"
	href="/team_lookup?team={teamNumber}"
	style:background={primary ? `linear-gradient(90deg, color-mix(in srgb, ${primary} 45%, #292929), #292929)` : undefined}
>
	<div class="avatar" style:background={primary ?? '#292929'}>
		{#if avatarFailed}
			<Icon name="groups" size={24} />
		{:else}
			<img
				src="https://avatars.frc.sh/teams/{encodeURIComponent(teamNumber)}.png"
				alt="Team {teamNumber} image"
				onerror={() => (avatarFailed = true)}
			/>
		{/if}
	</div>
	<div class="info">
		<div class="number">{teamNumber}</div>
		<div class="score">{score}</div>
	</div>
	<div class="rank">{rank}</div>
</a>

<style>
	.team-card {
		display: flex;
		align-items: center;
		gap: 7px;
		height: 53px;
		padding: 6px;
		border-radius: 7px;
		border: 1px solid #404040;
		background: #292929;
		color: #e0e0e0;
		text-decoration: none;
		overflow: hidden;
	}
	.avatar {
		width: 38px;
		height: 39px;
		padding: 7px;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		color: rgba(255, 255, 255, 0.7);
	}
	.avatar img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}
	.info {
		flex: 1;
		min-width: 0;
	}
	.number {
		font-size: 16px;
		font-weight: 500;
		line-height: 18px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.score {
		font-size: 10px;
		line-height: 1.5;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.rank {
		width: 39px;
		text-align: center;
		font-size: 24px;
		font-weight: 500;
		line-height: 32px;
		flex-shrink: 0;
	}
</style>
