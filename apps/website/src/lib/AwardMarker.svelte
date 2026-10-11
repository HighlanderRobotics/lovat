<script lang="ts">
	export let award: 'winner' | 'impact';
	export let label = award === 'winner' ? 'Event winner' : 'FIRST Impact Award winner';
</script>

<span
	class="award-marker"
	class:winner={award === 'winner'}
	role="img"
	aria-label={label}
	title={label}
></span>

<style>
	/* Google's Material Symbols Rounded SVGs avoid icon-font fallback text. */
	.award-marker {
		display: inline-block;
		width: 24px;
		height: 24px;
		flex-shrink: 0;
		background-color: #63a4ff;
		mask: url('/assets/icons/bookmark.svg') center / contain no-repeat;
		-webkit-mask: url('/assets/icons/bookmark.svg') center / contain no-repeat;
	}

	.award-marker.winner {
		background-color: #ffd54f;
		mask-image: url('/assets/icons/crown.svg');
		-webkit-mask-image: url('/assets/icons/crown.svg');
	}
</style>
