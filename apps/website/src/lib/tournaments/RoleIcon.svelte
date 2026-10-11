<script lang="ts">
	export let role: string;

	// Match Dashboard's RobotRoleExtension.littleEmblem without an icon font.
	const icons: Record<string, { label: string; asset: string }> = {
		CYCLING: { label: 'Cycling', asset: 'role-cycling' },
		SCORING: { label: 'Scoring', asset: 'role-scoring' },
		FEEDING: { label: 'Feeding', asset: 'role-feeding' },
		DEFENDING: { label: 'Defending', asset: 'role-defending' },
		IMMOBILE: { label: 'Immobile', asset: 'role-immobile' }
	};

	$: icon = icons[role];
</script>

{#if icon}
	<span
		class="role-icon"
		role="img"
		aria-label={`Lovat scouting role: ${icon.label}`}
		title={`Lovat scouting role: ${icon.label}`}
		style:--role-icon={`url('/assets/icons/${icon.asset}.svg')`}
	></span>
{/if}

<style>
	.role-icon {
		width: 18px;
		height: 18px;
		display: block;
		background: currentColor;
		mask: var(--role-icon) center / contain no-repeat;
		-webkit-mask: var(--role-icon) center / contain no-repeat;
	}
</style>
