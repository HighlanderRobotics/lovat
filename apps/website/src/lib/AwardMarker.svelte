<script lang="ts">
	import { Icon } from 'magnolia-ui-svelte';

	export let award: 'winner' | 'impact';
	export let label = award === 'winner' ? 'Event winner' : 'FIRST Impact Award winner';
</script>

<span class="award-marker" role="img" aria-label={label} title={label}>
	<span aria-hidden="true">
		<Icon
			icon={award === 'winner' ? 'crown' : 'bookmark'}
			filled
			color={award === 'winner' ? '#ffd54f' : '#63a4ff'}
		/>
	</span>
</span>

<style>
	/* Current Material Symbols subset: the Magnolia font predates the crown glyph. */
	@font-face {
		font-family: 'Material Award Symbols';
		src: url('/assets/icons/award-symbols.woff2') format('woff2');
		font-style: normal;
		font-weight: 100 700;
		font-display: block;
	}

	.award-marker :global(.material-symbols-rounded) {
		font-family: 'Material Award Symbols';
	}
</style>
