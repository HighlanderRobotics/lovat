<script lang="ts">
	import MatchPredictor from '$lib/tournaments/MatchPredictor.svelte';
	import { page } from '$app/stores';
	$: selected = Number($page.url.searchParams.get('team'));
	$: team =
		Number.isInteger(selected) && selected > 0 && selected <= 2147483647 ? selected : undefined;
</script>

<svelte:head><title>Match predictor · 2026 | Lovat</title></svelte:head>
<main>
	<nav aria-label="Predictor hierarchy">
		<a href="/2026">2026</a><span aria-hidden="true">&gt;</span><span>Match predictor</span>
	</nav>
	<h1>Match predictor</h1>
	{#key team}<MatchPredictor number={team} heading={false} />{/key}
</main>

<style>
	main {
		max-width: 1108px;
		margin: 0 auto;
		padding: 44px 26px 64px;
		color: var(--on-background);
	}
	nav {
		display: flex;
		gap: 8px;
		color: var(--body);
		font-size: 14px;
	}
	a {
		color: var(--victory-purple);
		text-decoration: none;
	}
	h1 {
		font-size: 32px;
		font-weight: 500;
		margin: 28px 0;
	}
	@media (max-width: 600px) {
		main {
			padding: 26px 20px 44px;
		}
	}
</style>
