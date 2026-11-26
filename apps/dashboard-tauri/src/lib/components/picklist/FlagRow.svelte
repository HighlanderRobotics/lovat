<script lang="ts">
	import { flagBackground, flagByPath, flagForeground, type FlagConfiguration } from '#lib/flags.ts';
	import Icon from '../Icon.svelte';

	/** A team's selected flags; links to the flag editor. */
	let { flags, data, team }: { flags: FlagConfiguration[]; data: Record<string, unknown> | null; team: number } = $props();

	function text(flag: FlagConfiguration) {
		const value = data?.[flag.type];
		if (value === undefined || value === null) return '-';
		try {
			return flagByPath(flag.type).format(value);
		} catch {
			return '!';
		}
	}
</script>

<a class="flags" href="/picklist/flags?team={team}" aria-label="Edit team tags">
	{#if flags.length === 0}
		<span class="flag add"><Icon name="add" /></span>
	{:else}
		{#each flags as flag, i (i)}
			{#if data === null}
				<span class="flag skeleton"></span>
			{:else}
				{@const t = text(flag)}
				<span
					class="flag"
					style:background={flagBackground(flag.hue)}
					style:color={flagForeground(flag.hue)}
					style:font-size={t.length > 4 ? '11px' : t.length > 3 ? '13px' : '16px'}
					title={flagByPath(flag.type).readableName}>{t}</span
				>
			{/if}
		{/each}
	{/if}
</a>

<style>
	.flags {
		display: flex;
		gap: 10px;
		text-decoration: none;
	}
	.flag {
		width: 40px;
		height: 40px;
		border-radius: 7px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
	}
	.add {
		background: var(--surface-high);
		color: var(--on-surface);
	}
</style>
