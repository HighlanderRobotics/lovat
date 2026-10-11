<script lang="ts">
	export let role: string;

	const icons: Record<string, { label: string; path: string }> = {
		CYCLING: {
			label: 'Cycling',
			path: 'M12 4V1L8 5l4 4V6a6 6 0 0 1 6 6c0 1-.25 1.94-.68 2.77l1.46 1.46A7.9 7.9 0 0 0 20 12a8 8 0 0 0-8-8Zm0 14a6 6 0 0 1-6-6c0-1 .25-1.94.68-2.77L5.22 7.77A7.9 7.9 0 0 0 4 12a8 8 0 0 0 8 8v3l4-4-4-4v3Z'
		},
		SCORING: {
			label: 'Scoring',
			path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm0-14a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm0 10a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-6a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z'
		},
		FEEDING: {
			label: 'Feeding',
			path: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm-1-13 5 5-5 5-1.4-1.4 2.6-2.6H7v-2h5.2L9.6 8.4 11 7Z'
		},
		DEFENDING: {
			label: 'Defending',
			path: 'M12 2 3 6v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V6l-9-4Zm0 19.9C8.13 20.66 5 16.3 5 12V7.3l7-3.11 7 3.11V12c0 4.3-3.13 8.66-7 9.9Z'
		},
		IMMOBILE: {
			label: 'Immobile',
			path: 'M6 5h4v14H6V5Zm8 0h4v14h-4V5Z'
		}
	};

	$: icon = icons[role];
</script>

{#if icon}
	<svg viewBox="0 0 24 24" role="img" aria-label={`Lovat scouting role: ${icon.label}`}>
		<title>Lovat scouting role: {icon.label}</title>
		<path fill="currentColor" d={icon.path} />
	</svg>
{/if}

<style>
	svg {
		width: 18px;
		height: 18px;
		display: block;
		margin-top: 4px;
		color: inherit;
	}
</style>
