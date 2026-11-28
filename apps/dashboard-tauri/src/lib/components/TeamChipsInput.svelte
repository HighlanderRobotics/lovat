<script lang="ts">
	import type { Team } from '#lib/models/types.ts';
	import Icon from './Icon.svelte';

	let {
		value = $bindable([]),
		teams = null,
		label = 'Filter by teams',
		maxChips = 3,
		onchange
	}: {
		value?: Team[];
		/** Known teams for suggestions; null allows any typed number. */
		teams?: Team[] | null;
		label?: string;
		maxChips?: number;
		onchange?: (teams: Team[]) => void;
	} = $props();

	let query = $state('');
	let focused = $state(false);
	let input: HTMLInputElement | undefined = $state();

	const suggestions = $derived.by((): Team[] => {
		if (!query) return [];
		const parsed = Number.parseInt(query, 10);
		const chosen = new Set(value.map((t) => t.number));
		if (!teams) return Number.isNaN(parsed) ? [] : [{ number: parsed, name: '' }];
		const q = query.toLowerCase();
		return teams
			.filter((t) => !chosen.has(t.number) && (t.name.toLowerCase().includes(q) || String(t.number).includes(query)))
			.slice(0, 8);
	});

	function add(team: Team) {
		if (value.length >= maxChips || value.some((t) => t.number === team.number)) return;
		value = [...value, team];
		query = '';
		onchange?.(value);
		input?.focus();
	}

	function remove(team: Team) {
		value = value.filter((t) => t.number !== team.number);
		onchange?.(value);
	}

	function keydown(e: KeyboardEvent) {
		if (e.key === 'Enter' && suggestions[0]) {
			e.preventDefault();
			add(suggestions[0]);
		} else if (e.key === 'Backspace' && !query && value.length) {
			remove(value[value.length - 1]);
		}
	}
</script>

<div class="chips-input" class:focused>
	<span class="label" class:raised={focused || value.length || query}>{label}</span>
	<div class="content">
		{#each value as team (team.number)}
			<span class="chip-item">
				{team.number}
				<button aria-label="Remove {team.number}" onclick={() => remove(team)}><Icon name="close" size={16} /></button>
			</span>
		{/each}
		{#if value.length < maxChips}
			<input
				bind:this={input}
				bind:value={query}
				inputmode="numeric"
				aria-label={label}
				onfocus={() => (focused = true)}
				onblur={() => setTimeout(() => (focused = false), 150)}
				onkeydown={keydown}
			/>
		{/if}
	</div>
	{#if focused && suggestions.length}
		<ul class="suggestions" role="listbox">
			{#each suggestions as team (team.number)}
				<li>
					<button role="option" aria-selected="false" onmousedown={(e) => e.preventDefault()} onclick={() => add(team)}>
						{team.name ? `${team.number} - ${team.name}` : team.number}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.chips-input {
		position: relative;
		border: 1px solid var(--outline);
		border-radius: 4px;
		min-height: 56px;
		padding: 8px 12px;
		display: flex;
		align-items: center;
	}
	.chips-input.focused {
		outline: 2px solid var(--primary);
		outline-offset: -1px;
		border-color: transparent;
	}
	.label {
		position: absolute;
		left: 12px;
		top: 50%;
		transform: translateY(-50%);
		color: var(--on-surface-variant);
		font-size: 16px;
		pointer-events: none;
		transition: all 120ms;
		background: var(--surface);
		padding: 0 4px;
	}
	.label.raised {
		top: 0;
		font-size: 12px;
	}
	.content {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
		flex: 1;
	}
	.chip-item {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		height: 32px;
		padding: 0 4px 0 12px;
		border-radius: 8px;
		border: 1px solid var(--outline);
		background: var(--surface);
		color: var(--on-surface-variant);
		font-weight: 500;
	}
	.chip-item button {
		border: none;
		background: none;
		color: inherit;
		cursor: pointer;
		display: inline-flex;
	}
	input {
		flex: 1;
		min-width: 60px;
		border: none;
		background: transparent;
		color: var(--on-surface);
		font: inherit;
		font-size: 16px;
		outline: none;
		height: 32px;
	}
	.suggestions {
		position: absolute;
		left: 0;
		right: 0;
		top: 100%;
		z-index: 20;
		margin: 4px 0 0;
		padding: 4px 0;
		list-style: none;
		background: var(--surface-high);
		border-radius: 4px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
	}
	.suggestions button {
		width: 100%;
		text-align: left;
		padding: 12px 16px;
		border: none;
		background: none;
		cursor: pointer;
	}
	.suggestions button:hover {
		background: rgba(255, 255, 255, 0.06);
	}
</style>
