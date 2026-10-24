<script lang="ts">
	import type { PageData } from './$types';
	export let data: PageData;
</script>

<svelte:head><title>Search | Lovat</title></svelte:head>

<main>
	<h1>Search</h1>
	<form action="/search" method="GET">
		<input
			type="search"
			name="q"
			value={data.query}
			placeholder="Events and teams"
			aria-label="Search query"
			maxlength="80"
			required
		/>
		<input
			type="number"
			name="year"
			value={data.year}
			aria-label="Season year"
			min="1992"
			max="9999"
			required
		/>
		<button>Search</button>
	</form>
	{#if data.query}
		<section>
			<h2>Teams</h2>
			<div class="results">
				{#each data.teams as team}<a href={`/teams/${team.teamNumber}/${data.year}`}
						><strong>{team.teamNumber}</strong>
						<div>{team.name}<span>{team.city ?? ''}</span></div></a
					>{:else}<p>No teams found.</p>{/each}
			</div>
		</section>
		<section>
			<h2>Events</h2>
			<div class="results">
				{#each data.events as event}<a href={`/tournaments/${event.key}`}
						><div>{event.name}<span>{event.location ?? ''}</span></div></a
					>{:else}<p>No events found.</p>{/each}
			</div>
		</section>
	{/if}
</main>

<style>
	main {
		max-width: 1160px;
		margin: auto;
		padding: 32px 26px 64px;
		color: var(--on-background);
	}
	h1 {
		font-size: 32px;
		font-weight: 500;
	}
	h2 {
		font-size: 22px;
		font-weight: 500;
	}
	form {
		display: flex;
		gap: 10px;
	}
	input,
	button {
		border: 1px solid var(--light-gray);
		border-radius: 7px;
		background: var(--secondary-container);
		padding: 10px 12px;
		color: var(--on-background);
		font: inherit;
	}
	input[type='search'] {
		flex: 1;
		min-width: 0;
	}
	input[type='number'] {
		width: 90px;
	}
	button {
		cursor: pointer;
		color: var(--victory-purple);
	}
	section {
		margin-top: 30px;
	}
	.results {
		display: grid;
		gap: 8px;
	}
	a {
		display: flex;
		align-items: center;
		gap: 24px;
		padding: 16px;
		border-radius: 7px;
		background: var(--secondary-container);
		color: var(--on-background);
		text-decoration: none;
	}
	a strong {
		min-width: 60px;
		font-size: 22px;
		font-weight: 500;
	}
	a div {
		display: grid;
		gap: 6px;
	}
	span,
	p {
		color: var(--body);
		font-size: 13px;
	}
	a:hover {
		background: var(--light-gray);
	}
	@media (max-width: 460px) {
		form {
			flex-wrap: wrap;
		}
		input[type='search'] {
			flex-basis: 100%;
		}
	}
</style>
