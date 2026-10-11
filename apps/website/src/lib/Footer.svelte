<script lang="ts">
	import { dashboardUrl, learnUrl } from '$lib/siteUrls';
</script>

<footer>
	<a class="brand" href="/">Lovat</a>
	<nav aria-label="Footer">
		<a href="/about">About</a>
		<a href="/download">Download</a>
		<a href="https://www.youtube.com/watch?v=LYKE8soFBJ8" target="_blank" rel="noreferrer"
			>Collection training 2026</a
		>
		<a href={`${learnUrl()}/guides/welcome`}>Learn</a>
		<a href={dashboardUrl()}>Dashboard</a>
		<a href="/changelog">Changelog</a>
		<a href="/contact">Contact</a>
	</nav>
</footer>

<style>
	footer {
		border-top: 1px solid var(--light-gray);
		padding: 28px max(24px, calc((100vw - 1108px) / 2));
		display: flex;
		align-items: center;
		gap: 28px;
		background: var(--background);
	}
	.brand {
		color: var(--victory-purple);
		font-size: 24px;
		font-weight: 500;
	}
	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 16px 24px;
	}
	a {
		color: var(--body);
		text-decoration: none;
		font-size: 13px;
	}
	a:hover {
		color: var(--victory-purple);
	}
	a:focus-visible {
		outline: 2px solid var(--victory-purple);
		outline-offset: 4px;
	}
	@media (max-width: 600px) {
		footer {
			align-items: start;
			flex-direction: column;
			gap: 20px;
		}
	}
</style>
