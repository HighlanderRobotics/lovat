<script lang="ts">
	import { untrack } from 'svelte';
	import { getCachedFlag, getFlag } from '#lib/api/endpoints.ts';
	import { flagBackground, flagByPath, flagForeground, type FlagConfiguration } from '#lib/flags.ts';
	import { toast } from '#lib/toast.svelte.ts';

	/** A team flag that fetches its own value, like the Flutter NetworkFlag. */
	let { team, flag, data: provided }: { team: number; flag: FlagConfiguration; data?: unknown } = $props();

	let loaded = $state(false);
	let data = $state<unknown>(undefined);
	const type = $derived(flagByPath(flag.type));

	$effect(() => {
		if (provided !== undefined) {
			data = provided;
			loaded = true;
			return;
		}
		const path = flag.type;
		const t = team;
		untrack(() => {
			loaded = false;
			data = undefined;
			const cached = getCachedFlag(path, t);
			if (cached !== undefined) {
				data = cached;
				loaded = true;
			}
			getFlag(path, t)
				.then((value) => {
					if (t !== team || path !== flag.type) return;
					data = value;
					loaded = true;
				})
				.catch((e) => {
					if (data === undefined) toast.error(`Error fetching ${type.readableName}: ${e instanceof Error ? e.message : e}`);
					loaded = true;
				});
		});
	});

	const text = $derived.by(() => {
		if (data === undefined || data === null) return '-';
		try {
			return type.format(data);
		} catch {
			return '!';
		}
	});
</script>

{#if !loaded}
	<span class="flag skeleton"></span>
{:else}
	<span
		class="flag"
		style:background={flagBackground(flag.hue)}
		style:color={flagForeground(flag.hue)}
		title={type.readableName}
		style:font-size={text.length > 4 ? '11px' : text.length > 3 ? '13px' : '16px'}>{text}</span
	>
{/if}

<style>
	.flag {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: 7px;
		padding: 2px;
		font-weight: 500;
		white-space: nowrap;
		overflow: hidden;
		flex-shrink: 0;
	}
</style>
