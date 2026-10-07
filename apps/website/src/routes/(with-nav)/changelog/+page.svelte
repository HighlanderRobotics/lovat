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

<header class="intro">
	<div class="content">
		<p class="eyebrow">What’s new</p>
		<h1>Changelog</h1>
		<p>Follow Lovat’s progress across scouting, analysis, and everything in between.</p>
		<p class="date-note">
			Changes are grouped by the month they entered the codebase. Deployment dates may differ.
		</p>
	</div>
</header>

<div class="timeline">
	<aside>
		<nav aria-label="Changelog by year">
			<p class="eyebrow">Jump to a year</p>
			{#each years as year}
				<a href={`#year-${year}`}>{year}</a>
			{/each}
		</nav>
		<a class="source" href="https://github.com/HighlanderRobotics/lovat/blob/main/CHANGELOG.md"
			>View on GitHub ↗</a
		>
	</aside>
	<main>
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
</div>

<style>
	.content {
		max-width: 1000px;
		margin: 0 auto;
	}
	.intro {
		background: var(--secondary-container);
		padding: 64px 24px;
	}
	.eyebrow {
		color: var(--victory-purple);
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}
	h1 {
		color: var(--on-background);
		font-size: clamp(36px, 6vw, 56px);
		font-weight: 500;
		margin: 12px 0;
	}
	.intro p:not(.eyebrow) {
		color: var(--body);
		font-size: 18px;
		line-height: 1.6;
		max-width: 650px;
	}
	.intro .date-note {
		font-size: 14px !important;
		margin-top: 16px;
	}
	.timeline {
		max-width: 1048px;
		margin: 0 auto;
		padding: 48px 24px 80px;
		display: grid;
		grid-template-columns: 170px minmax(0, 1fr);
		gap: 48px;
	}
	aside {
		align-self: start;
		position: sticky;
		top: 97px;
	}
	nav {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	nav .eyebrow {
		margin-bottom: 4px;
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
	nav a {
		color: var(--body);
		font-size: 16px;
	}
	.source {
		display: inline-block;
		margin-top: 24px;
		font-size: 13px;
	}
	.month {
		border-bottom: 1px solid var(--outline-variant);
		padding-bottom: 36px;
		margin-bottom: 36px;
	}
	.month:last-child {
		border-bottom: 0;
	}
	h2,
	h3,
	.year-anchor {
		scroll-margin-top: 97px;
	}
	h2 {
		font-size: 28px;
		font-weight: 500;
		margin: 0 0 28px;
	}
	h2 a {
		color: var(--on-background);
	}
	h3 {
		color: var(--on-background);
		font-size: 17px;
		font-weight: 500;
		margin: 0 0 12px;
	}
	.feature + .feature {
		margin-top: 28px;
	}
	.markdown {
		color: var(--body);
		font-size: 15px;
		line-height: 1.8;
		overflow-wrap: anywhere;
	}
	.markdown :global(ul) {
		list-style: disc;
		padding-left: 20px;
	}
	.markdown :global(li + li) {
		margin-top: 12px;
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
	@media (max-width: 700px) {
		.intro {
			padding: 40px 20px;
		}
		.timeline {
			display: block;
			padding: 28px 20px 48px;
		}
		aside {
			position: static;
			margin-bottom: 36px;
		}
		nav {
			flex-direction: row;
			flex-wrap: wrap;
			gap: 16px;
		}
		nav .eyebrow {
			flex-basis: 100%;
		}
		.source {
			margin-top: 16px;
		}
	}
</style>
