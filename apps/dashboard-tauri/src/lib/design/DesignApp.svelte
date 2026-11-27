<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount, untrack, tick } from 'svelte';
	import { Button, TextField } from '@highlanderrobotics/magnolia-svelte/v2';
	import manifest from './manifest.json';
	import layouts from './layouts.json';
	import type { ScreenLayout } from './layout.ts';
	import NodeView from './DesignNode.svelte';
	import type { DesignNode } from './model.ts';
	import { destination } from './actions.ts';
	import './design.css';

	const sources = import.meta.glob('./scenes/*.json', { import: 'default' });
	const routes: Record<string, string> = {
		'/': '5775:9807',
		'/index.html': '5775:9807',
		'/home': '5775:9807',
		'/forms': '5775:10069',
		'/match_schedule': '5775:16503',
		'/tournament_teams': '5775:17119',
		'/settings': '5775:14720',
		'/my_alliance': '5775:17181',
	};
	const id = $derived(
		routes[page.url.pathname] ??
			(page.url.pathname.startsWith('/design/')
				? page.url.pathname.split('/').at(-1)!.replace('-', ':')
				: '5775:9807'),
	);
	const catalog = $derived(page.url.pathname === '/design');
	const reference = $derived(page.url.searchParams.has('reference'));
	const frame = $derived(manifest.find((item) => item.id === id));
	const cache = new Map<string,DesignNode>();
	function load(target:string): DesignNode | Promise<DesignNode> {
		const cached=cache.get(target);
		if(cached)return cached;
		return (sources[`./scenes/${target.replace(':','-')}.json`]() as Promise<DesignNode>).then(node=>{cache.set(target,node);return node;});
	}
	const scene = $derived(frame ? load(id) : undefined);
	let width = $state(393);
	let viewport = $state<HTMLElement>();
	let safeTop = $state(0);
	let availableHeight = $state(0);
	function measure() {
		if (!viewport) return;
		safeTop = parseFloat(getComputedStyle(viewport).paddingTop) || 0;
		availableHeight = (window.visualViewport?.height ?? window.innerHeight) - safeTop - (parseFloat(getComputedStyle(viewport).paddingBottom) || 0);
	}
	$effect(() => {
		const element = viewport;
		if (element) untrack(measure);
	});
	let filter = $state('');
	let choices = $state<Record<string, string>>({});
	function choose(group: string, value: string) {
		choices[group] = value;
	}
	const scale = $derived(Math.min(width / 393, 1));
	const displayHeight = $derived(!reference && availableHeight > 0 ? availableHeight / scale : (frame?.height ?? 852));
	const heightDelta = $derived(
		(frame?.height ?? displayHeight) - displayHeight,
	);
	const filtered = $derived(
		manifest.filter((item) =>
			`${item.name} ${item.id}`.toLowerCase().includes(filter.toLowerCase()),
		),
	);

	let navigation = 0;
	let activeTransition: ViewTransition | undefined;
	async function open(target: string) {
		const request=++navigation;
		if(target!=='catalog')await load(target);
		if(request!==navigation)return;
		const url=(target==='catalog'?'/design':`/design/${target.replace(':','-')}`)+(reference?'?reference=1':'');
		const update=async()=>{await goto(url);await tick();};
		if(!reference && document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches){
			activeTransition?.skipTransition();
			activeTransition=document.startViewTransition(update);
			void activeTransition.finished.catch(()=>{});
		}else await update();
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
		window.addEventListener('resize', measure);
		window.visualViewport?.addEventListener('resize', measure);
		return () => {
			window.removeEventListener('keydown', keyboard);
			window.removeEventListener('resize', measure);
			window.visualViewport?.removeEventListener('resize', measure);
		};
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
			<a href={`/design/${item.id.replace(':', '-')}`} onclick={(event)=>{event.preventDefault();void open(item.id);}}
				><span>{item.name}</span><small>{item.id}</small></a
			>
		{/each}
	</main>
{:else if frame && scene}
	<main
		class="design-viewport"
		class:reference-mode={reference}
		bind:this={viewport}
		bind:clientWidth={width}
		aria-label={frame.name}
	>
		<div
			style={`height:${displayHeight * scale}px;width:${393 * scale}px;position:relative;margin:auto`}
		>
			<div
				class="design-frame"
				data-frame={frame.id}
				style={`width:393px;height:${displayHeight}px;transform:scale(${scale});transform-origin:top left`}
			>
				{#await scene}<div class="design-loading" role="status">Loading…</div>
				{:then node}{#key id}<NodeView
							{node}
							{reference}
							layout={layouts[id as keyof typeof layouts] as ScreenLayout}
							{activate}
							{heightDelta}
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
