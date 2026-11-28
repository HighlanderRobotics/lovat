<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { getFlags } from '#lib/api/endpoints.ts';
	import AppBar from '#lib/components/AppBar.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import {
		flagBackground,
		flagByPath,
		flagForeground,
		flagTypes,
		getPicklistFlags,
		setPicklistFlags,
		startFlag,
		type FlagConfiguration
	} from '#lib/flags.ts';

	const MAX = 4;
	const team = Number(page.url.searchParams.get('team') ?? 8033) || 8033;
	let selected = $state<FlagConfiguration[]>(getPicklistFlags());
	let values = $state<Record<string, unknown>>({});
	let filter = $state('');
	let editing = $state<number | null>(null);

	$effect(() => {
		untrack(() => {
			const paths = flagTypes.map((f) => f.path);
			getFlags(paths, team)
				.then((v) => (values = Object.fromEntries(paths.map((p, i) => [p, v[i]]))))
				.catch(() => {});
		});
	});

	function save() {
		setPicklistFlags($state.snapshot(selected));
	}

	function text(path: string) {
		const v = values[path];
		if (v === undefined || v === null) return '-';
		try {
			return flagByPath(path).format(v);
		} catch {
			return '!';
		}
	}

	function move(i: number, delta: number) {
		const j = i + delta;
		if (j < 0 || j >= selected.length) return;
		[selected[i], selected[j]] = [selected[j], selected[i]];
		editing = j;
		save();
	}

	const shown = $derived(
		flagTypes.filter(
			(f) =>
				f.readableName.toLowerCase().includes(filter.toLowerCase()) || f.description.toLowerCase().includes(filter.toLowerCase())
		)
	);
</script>

{#snippet badge(flag: FlagConfiguration)}
	{@const t = text(flag.type)}
	<span class="flag" style:background={flagBackground(flag.hue)} style:color={flagForeground(flag.hue)} style:font-size={t.length > 4 ? '11px' : t.length > 3 ? '13px' : '16px'}>{t}</span>
{/snippet}

<AppBar title="Team Tags" back backFallback="/picklists" />

<div class="page-body stack">
	<div class="tray" aria-label="Selected tags">
		{#each selected as flag, i (i)}
			<button class="slot" class:active={editing === i} onclick={() => (editing = editing === i ? null : i)} aria-label="Edit {flagByPath(flag.type).readableName}">
				{@render badge(flag)}
			</button>
		{/each}
		{#each Array(MAX - selected.length) as _, i (i)}<span class="slot empty"></span>{/each}
	</div>

	{#if editing !== null && selected[editing]}
		{@const flag = selected[editing]}
		<div class="card stack editor">
			<div class="title-medium">{flagByPath(flag.type).readableName}</div>
			<label class="field">
				<span>Color</span>
				<input type="range" min="0" max="359" bind:value={selected[editing].hue} onchange={save} class="hue" />
			</label>
			<div class="row">
				<button class="btn btn-tonal" onclick={() => move(editing!, -1)} disabled={editing === 0}><Icon name="arrow_back" />Move left</button>
				<button class="btn btn-tonal" onclick={() => move(editing!, 1)} disabled={editing === selected.length - 1}>Move right<Icon name="arrow_forward" /></button>
				<span class="grow"></span>
				<button
					class="btn btn-danger"
					onclick={() => {
						selected.splice(editing!, 1);
						editing = null;
						save();
					}}><Icon name="delete" />Remove</button
				>
			</div>
		</div>
	{/if}

	<input class="input" placeholder="Search" bind:value={filter} aria-label="Search tags" />
	<div class="list">
		{#each shown as type (type.path)}
			<button
				class="list-item"
				disabled={selected.length >= MAX}
				onclick={() => {
					selected.push(startFlag(type));
					save();
				}}
			>
				{@render badge(startFlag(type))}
				<span class="grow"><span class="body-large">{type.readableName}</span><br /><span class="subtitle">{type.description}</span></span>
				<Icon name="add" />
			</button>
		{/each}
	</div>
</div>

<style>
	.tray {
		align-self: center;
		display: flex;
		gap: 10px;
		padding: 10px;
		border: 2px solid var(--outline);
		border-radius: 17px;
	}
	.slot {
		width: 40px;
		height: 40px;
		padding: 0;
		border: none;
		background: none;
		cursor: pointer;
		border-radius: 7px;
	}
	.slot.active {
		outline: 2px solid var(--primary);
		outline-offset: 2px;
	}
	.slot.empty {
		border: 1px dashed var(--outline-variant);
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
		flex-shrink: 0;
	}
	.hue {
		width: 100%;
		appearance: none;
		height: 12px;
		border-radius: 6px;
		background: linear-gradient(90deg, hsl(0 60% 70%), hsl(60 60% 70%), hsl(120 60% 70%), hsl(180 60% 70%), hsl(240 60% 70%), hsl(300 60% 70%), hsl(359 60% 70%));
	}
	.list-item {
		padding-left: 8px;
	}
	.list-item:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>
