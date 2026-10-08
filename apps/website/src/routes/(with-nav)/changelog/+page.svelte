<!-- HTML comes from the build-time Markdown renderer, which escapes raw HTML and restricts link protocols. -->
<script lang="ts">
	import type { PageData } from './$types';

	export let data: PageData;
	$: years = [...new Set(data.months.map((month) => month.year).filter(Boolean))];
</script>

<svelte:head>
	<title>Changelog | Lovat</title>
	<meta
		name="description"
		content="Explore Lovat’s new features, fixes, and improvements by month, from scouting and schedules to analysis and picklists."
	/>
</svelte:head>

<main>
	<header>
		<h1>Changelog</h1>
		<nav aria-label="Changelog by year">
			{#each years as year}
				<a href={`#year-${year}`}>{year}</a>
			{/each}
			<a class="source" href="https://github.com/HighlanderRobotics/lovat/blob/main/CHANGELOG.md"
				>GitHub ↗</a
			>
		</nav>
	</header>
	{#each data.months as month, index}
		{#if month.year && (index === 0 || data.months[index - 1].year !== month.year)}
			<div id={`year-${month.year}`} class="year-anchor"></div>
		{/if}
		<section class="month" aria-labelledby={month.id}>
			<h2 id={month.id}><a href={`#${month.id}`}>{month.title}</a></h2>
			{#if month.html}
				<div class="markdown">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -->
					{@html month.html}
				</div>
			{/if}
			{#each month.features as feature}
				<div class="feature">
					<h3 id={feature.id}>{feature.title}</h3>
					<div class="markdown">
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						{@html feature.html}
					</div>
				</div>
			{/each}
		</section>
	{/each}
</main>

<style>
	main {
		max-width: 800px;
		margin: 0 auto;
		padding: 40px 24px 64px;
	}
	header {
		margin-bottom: 40px;
	}
	h1 {
		color: var(--on-background);
		font-size: 36px;
		font-weight: 500;
		margin: 0 0 8px;
	}
	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
		margin-top: 20px;
		font-size: 14px;
	}
	a {
		color: var(--victory-purple);
		text-decoration: none;
	}
	a:hover {
		text-decoration: underline;
	}
	a:focus-visible {
		outline: 2px solid var(--victory-purple);
		outline-offset: 4px;
	}
	.source {
		margin-left: auto;
	}
	.month {
		border-top: 1px solid var(--outline-variant);
		padding-top: 28px;
		margin-top: 36px;
	}
	h2,
	h3,
	.year-anchor {
		scroll-margin-top: 97px;
	}
	h2 {
		font-size: 24px;
		font-weight: 500;
		margin: 0 0 24px;
	}
	h2 a {
		color: var(--on-background);
	}
	h3 {
		color: var(--on-background);
		font-size: 16px;
		font-weight: 500;
		margin: 0 0 10px;
	}
	.feature + .feature {
		margin-top: 24px;
	}
	.markdown {
		color: var(--body);
		font-size: 15px;
		line-height: 1.7;
		overflow-wrap: anywhere;
	}
	.markdown :global(ul) {
		list-style: disc;
		padding-left: 20px;
	}
	.markdown :global(li + li) {
		margin-top: 10px;
	}
	.markdown :global(p) {
		margin-top: 16px;
	}
	.markdown :global(a) {
		color: var(--victory-purple);
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.markdown :global(a:focus-visible) {
		outline: 2px solid var(--victory-purple);
		outline-offset: 3px;
	}
	.markdown :global(code) {
		background: var(--surface-container);
		padding: 2px 5px;
		border-radius: 4px;
		font-size: 0.9em;
	}
</style>
