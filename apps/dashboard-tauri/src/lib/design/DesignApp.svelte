<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { Button, TextField } from '@highlanderrobotics/magnolia-svelte/v2';
	import manifest from './manifest.json';
	import NodeView from './DesignNode.svelte';
	import type { DesignNode } from './model.ts';
	import { destination } from './actions.ts';
	import './design.css';

	const sources = import.meta.glob('./scenes/*.json', { import: 'default' });
	const routes: Record<string, string> = {
		'/': '5775:9807',
		'/home': '5775:9807',
		'/forms': '5775:10069',
		'/match_schedule': '5775:16503',
		'/tournament_teams': '5775:17119',
		'/settings': '5775:14720',
		'/my_alliance': '5775:17181',
	};
	const id = $derived(
		routes[page.url.pathname] ??
			page.url.pathname.split('/').at(-1)!.replace('-', ':'),
	);
	const catalog = $derived(page.url.pathname === '/design');
	const frame = $derived(manifest.find((item) => item.id === id));
	const scene = $derived(
		frame
			? (sources[
					`./scenes/${id.replace(':', '-')}.json`
				]() as Promise<DesignNode>)
			: undefined,
	);
	let width = $state(393);
	let filter = $state('');
	let choices = $state<Record<string, string>>({});
	function choose(group: string, value: string) {
		choices[group] = value;
	}
	const scale = $derived(Math.min(width / 393, 1));
	const filtered = $derived(
		manifest.filter((item) =>
			`${item.name} ${item.id}`.toLowerCase().includes(filter.toLowerCase()),
		),
	);

	function open(target: string) {
		void goto(
			target === 'catalog' ? '/design' : `/design/${target.replace(':', '-')}`,
		);
	}
	function activate(node: DesignNode) {
		if (id === '5775:10120' && node.control === 'button') {
			open(
				choices['5775:10128'] === '5775:10130' ? '5775:10144' : '5775:14699',
			);
			return true;
		}
		const target = destination(id, node);
		if (target) open(target);
		return !!target;
	}
	onMount(() => {
		const keyboard = (event: KeyboardEvent) => {
			if (event.key === 'Escape') open('catalog');
		};
		window.addEventListener('keydown', keyboard);
		return () => window.removeEventListener('keydown', keyboard);
	});
</script>

<svelte:head
	><title
		>{catalog ? 'Screen catalog' : (frame?.name ?? 'Screen unavailable')} · Lovat</title
	></svelte:head
>

{#if catalog}
	<main class="design-catalog">
		<h1>Lovat Dashboard</h1>
		<p>91 Figma screens and states · local mock data</p>
		<TextField
			label="Find a screen"
			placeholder="Search screens or Figma IDs"
			bind:value={filter}
		/>
		<Button onclick={() => open('5775:9807')}>Open Home</Button>
		{#each filtered as item}
			<a href={`/design/${item.id.replace(':', '-')}`}
				><span>{item.name}</span><small>{item.id}</small></a
			>
		{/each}
	</main>
{:else if frame && scene}
	<main
		class="design-viewport"
		bind:clientWidth={width}
		aria-label={frame.name}
	>
		<div
			style={`height:${frame.height * scale}px;width:${393 * scale}px;position:relative;margin:auto`}
		>
			<div
				class="design-frame"
				data-frame={frame.id}
				style={`width:393px;height:${frame.height}px;transform:scale(${scale});transform-origin:top left`}
			>
				{#await scene}<div class="design-loading" role="status">Loading…</div>
				{:then node}{#key id}<NodeView
							{node}
							{activate}
							{choices}
							{choose}
						/>{/key}
				{:catch}<p role="alert">Could not open this screen.</p>
					<Button onclick={() => open('catalog')}>Screens</Button>{/await}
			</div>
		</div>
	</main>
{:else}
	<main class="design-catalog">
		<h1>Screen unavailable</h1>
		<Button onclick={() => open('catalog')}>Screens</Button>
	</main>
{/if}
