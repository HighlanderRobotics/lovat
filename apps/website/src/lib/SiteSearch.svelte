<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { onDestroy } from 'svelte';

	type Suggestion = { href: string; title: string; detail: string; kind: string };

	let query = '';
	let focused = false;
	let suggestions: Suggestion[] = [];
	let selected = -1;
	let timer: ReturnType<typeof setTimeout>;
	let controller: AbortController | undefined;

	$: year = Number(
		$page.params.year ??
			(browser ? $page.url.searchParams.get('year') : null) ??
			$page.params.key?.match(/^(\d{4})/)?.[1] ??
			new Date().getFullYear()
	);
	$: if (browser) queueSuggestions(query, year);
	$: expanded = focused && suggestions.length > 0;

	function queueSuggestions(value: string, season: number) {
		clearTimeout(timer);
		controller?.abort();
		suggestions = [];
		selected = -1;

		if (!value.trim()) return;

		timer = setTimeout(async () => {
			const request = new AbortController();
			controller = request;

			try {
				const response = await fetch(
					`/api/public/search?${new URLSearchParams({ q: value.trim(), year: String(season) })}`,
					{ signal: request.signal }
				);

				if (!response.ok) return;

				const results = await response.json();

				if (request.signal.aborted) return;

				suggestions = [
					...results.teams
						.slice(0, 4)
						.map((team: { teamNumber: number; name: string; city: string | null }) => ({
							href: `/teams/${team.teamNumber}/${season}`,
							title: `${team.teamNumber} · ${team.name}`,
							detail: team.city ?? '',
							kind: 'Team'
						})),
					...results.events
						.slice(0, 4)
						.map((event: { key: string; name: string; location: string | null }) => ({
							href: `/tournaments/${event.key}`,
							title: event.name,
							detail: event.location ?? '',
							kind: 'Event'
						}))
				];
			} catch {
				// Search submission remains available when suggestions cannot load.
			}
		}, 250);
	}

	function submit(event: SubmitEvent) {
		const value = query.trim();
		const target =
			/^\d+$/.test(value) && Number(value) > 0
				? `/teams/${Number(value)}/${year}`
				: expanded && selected >= 0
					? suggestions[selected].href
					: null;

		if (target) {
			event.preventDefault();
			focused = false;
			void goto(target);
		}
	}

	function keydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			focused = false;
			selected = -1;
		} else if (suggestions.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
			event.preventDefault();
			focused = true;
			selected =
				(selected + (event.key === 'ArrowDown' ? 1 : selected < 0 ? 0 : -1) + suggestions.length) %
				suggestions.length;
		}
	}

	onDestroy(() => {
		clearTimeout(timer);
		controller?.abort();
	});
</script>

<div class="search-row">
	<div class="search-container">
		<form action="/search" method="GET" role="search" on:submit={submit}>
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
				role="combobox"
				aria-autocomplete="list"
				aria-expanded={expanded}
				aria-controls="site-search-suggestions"
				aria-activedescendant={expanded && selected >= 0
					? `site-search-option-${selected}`
					: undefined}
				autocomplete="off"
				on:focus={() => (focused = true)}
				on:input={() => (focused = true)}
				on:blur={() => (focused = false)}
				on:keydown={keydown}
				required
			/>
			<button type="submit" aria-label="Submit search"
				><svg viewBox="0 0 24 24" aria-hidden="true"
					><path d="m12 4-1.4 1.4L16.2 11H4v2h12.2l-5.6 5.6L12 20l8-8Z" /></svg
				></button
			>
		</form>
		{#if expanded}
			<ul id="site-search-suggestions" role="listbox" aria-label="Search suggestions">
				{#each suggestions as suggestion, index}
					<li role="presentation">
						<a
							id={`site-search-option-${index}`}
							href={suggestion.href}
							role="option"
							aria-selected={selected === index}
							class:selected={selected === index}
							on:pointerdown={(event) => event.preventDefault()}
							on:click={() => (focused = false)}
						>
							<span class="result-name">{suggestion.title}<small>{suggestion.detail}</small></span>
							<span class="result-kind">{suggestion.kind}</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>

<style>
	.search-row {
		background: var(--background);
		padding: 0 24px 12px;
	}
	.search-container {
		position: relative;
		max-width: 1108px;
		margin: 0 auto;
	}
	ul {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		right: 0;
		z-index: 20;
		margin: 0;
		padding: 6px;
		list-style: none;
		border: 1px solid var(--light-gray);
		border-radius: 7px;
		background: var(--secondary-container);
		box-shadow: 0 12px 28px #0006;
	}
	li a {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 12px;
		border-radius: 4px;
		color: var(--on-background);
		text-decoration: none;
	}
	li a:hover,
	li a.selected {
		background: var(--light-gray);
	}
	.result-name {
		display: grid;
		gap: 4px;
		min-width: 0;
	}
	small,
	.result-kind {
		color: var(--body);
		font-size: 12px;
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
