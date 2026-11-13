<script lang="ts">
	import '@highlanderrobotics/magnolia-svelte/fonts.css';
	import '$lib/styles/global.css';
	import Analytics from '$lib/components/Analytics.svelte';
	import { MagnoliaUIRoot } from '@highlanderrobotics/magnolia-svelte';
</script>

<Analytics />

<div class="color-scheme-dark">
	<MagnoliaUIRoot theme="dark">
		<slot />
	</MagnoliaUIRoot>
</div>
