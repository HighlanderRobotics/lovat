<script lang="ts">
	import Analytics from '$lib/components/Analytics.svelte';
	import { MagnoliaUIRoot } from 'magnolia-ui-svelte';
	import Footer from '$lib/Footer.svelte';
</script>

<Analytics />

<div class="color-scheme-dark">
	<MagnoliaUIRoot>
		<div class="site-shell">
			<div class="page-content"><slot /></div>
			<Footer />
		</div>
	</MagnoliaUIRoot>
</div>

<style>
	.site-shell {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}
	.page-content {
		flex: 1;
	}
	:global(.color-scheme-dark select:not([multiple])) {
		appearance: none;
		padding-right: 38px !important;
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23bcbcbc' d='m7 10 5 5 5-5z'/%3E%3C/svg%3E") !important;
		background-repeat: no-repeat !important;
		background-position: right 8px center !important;
		background-size: 24px !important;
	}
	:global(.color-scheme-dark .select::after) {
		display: none !important;
		content: '' !important;
	}
</style>
