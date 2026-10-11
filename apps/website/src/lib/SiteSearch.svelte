<script lang="ts">
	import { page } from '$app/stores';

	let query = '';
	$: year = Number(
		$page.url.pathname.match(/(?:^|\/)(\d{4})(?:[a-z]|\/|$)/)?.[1] ?? new Date().getFullYear()
	);
</script>

<div class="search-row">
	<form action="/search" method="GET" role="search">
		<input type="hidden" name="year" value={year} />
		<svg viewBox="0 0 24 24" aria-hidden="true"
			><path
				d="M9.5 3a6.5 6.5 0 1 0 3.96 11.66L19.8 21 21 19.8l-6.34-6.34A6.5 6.5 0 0 0 9.5 3Zm0 2a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z"
			/></svg
		>
		<input
			type="search"
			name="q"
			bind:value={query}
			placeholder="Search events and teams"
			aria-label="Search events and teams"
			maxlength="80"
			required
		/>
		<button type="submit" aria-label="Submit search"
			><svg viewBox="0 0 24 24" aria-hidden="true"
				><path d="m12 4-1.4 1.4L16.2 11H4v2h12.2l-5.6 5.6L12 20l8-8Z" /></svg
			></button
		>
	</form>
</div>

<style>
	.search-row {
		background: var(--background);
		padding: 0 24px 12px;
	}
	form {
		max-width: 1108px;
		margin: 0 auto;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 12px;
		border: 1px solid var(--light-gray);
		border-radius: 7px;
		background: var(--secondary-container);
	}
	input[type='search'] {
		flex: 1;
		min-width: 0;
		background: transparent;
		color: var(--on-background);
		border: 0;
		outline: none;
		font: inherit;
		font-size: 14px;
	}
	form:focus-within {
		border-color: var(--victory-purple);
	}
	svg {
		width: 20px;
		height: 20px;
		fill: currentColor;
		color: var(--body);
		flex-shrink: 0;
	}
	button {
		display: flex;
		padding: 0;
		background: transparent;
		border: 0;
		cursor: pointer;
	}
	button:focus-visible {
		outline: 2px solid var(--victory-purple);
		outline-offset: 4px;
	}
</style>
