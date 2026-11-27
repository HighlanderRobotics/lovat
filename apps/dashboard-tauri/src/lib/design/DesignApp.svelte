<script lang="ts">
	import { page } from '$app/state';
	import { goto, beforeNavigate, afterNavigate } from '$app/navigation';
	import { onMount, untrack, tick, setContext } from 'svelte';
	import { Button, TextField } from '@highlanderrobotics/magnolia-svelte/v2';
	import manifest from './manifest.json';
	import layouts from './layouts.json';
	import type { ScreenLayout } from './layout.ts';
	import NodeView from './DesignNode.svelte';
	import { textOf, type DesignNode } from './model.ts';
	import { DesignRuntime, DESIGN_RUNTIME, prepareScene, optionScreens } from './runtime.svelte.ts';
	import { destination } from './actions.ts';
	import { presentation, isSearchChange, searchBase, type Presentation, type Dock } from './presentation.ts';
	import { nodes } from './behaviors.ts';
	import { PageMotion } from './pageMotion.ts';
		import './design.css';

	const runtime=new DesignRuntime();
	setContext(DESIGN_RUNTIME,runtime);
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
		const key=`${reference?'reference:':''}${target}`;
		const isReference=reference;
		const cached=cache.get(key);
		if(cached)return cached;
		return (sources[`./scenes/${target.replace(':','-')}.json`]() as Promise<DesignNode>).then(source=>{const node=isReference?source:prepareScene(source,target,runtime);cache.set(key,node);return node;});
	}
	const presentations=new WeakMap<DesignNode,Presentation>();
	function parts(node:DesignNode, frameId:string):Presentation {
		const origin=page.state.designReturn;
		const base=origin?cache.get(`${reference?'reference:':''}${origin}`):undefined;
		if(base && base!==node && node.children.some(child=>typeof child!=='string'&&child.dialogSurface)){
			const background=parts(base,origin!);
			return {page:{...background.page,children:[...background.page.children,...node.children.filter(child=>typeof child!=='string'&&(child.dialogSurface||child.name==='DialogBackdrop'))]},docks:background.docks,layout:{...background.layout,...(layouts[frameId as keyof typeof layouts] as ScreenLayout)}};
		}
		let value=presentations.get(node);if(!value){value=presentation(node,layouts[frameId as keyof typeof layouts] as ScreenLayout,reference);presentations.set(node,value);}return value;
	}
	let docks=$state<Dock[]>([]);
	let dockLayout=$state<ScreenLayout>({});
	$effect(()=>{const current=scene,frameId=id;if(current)untrack(()=>{void Promise.resolve(current).then(node=>{if(id===frameId){const value=parts(node,frameId);docks=value.docks;dockLayout=value.layout;}});});});
	const scene = $derived(frame ? load(id) : undefined);
	let width = $state(393);
	let viewport = $state<HTMLElement>();
	let safeTop = $state(0);
	let availableHeight = $state(0);
	let keyboardInset=$state(0);
	let stableHeight=0;
	function measure() {
		if (!viewport) return;
		const focused=document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
		const visual=window.visualViewport;
		const preserving=focused || keyboardInset>80;
		if(!preserving || !stableHeight)stableHeight=window.innerHeight;
		const height=preserving?Math.max(stableHeight,window.innerHeight):window.innerHeight;
		keyboardInset=preserving?Math.max(0,height-(visual?.height??height)-(visual?.offsetTop??0)):0;
		safeTop = parseFloat(getComputedStyle(viewport).paddingTop) || 0;
		availableHeight=height-safeTop-(parseFloat(getComputedStyle(viewport).paddingBottom)||0);
		if(keyboardInset>80)requestAnimationFrame(()=>{
			const input=document.activeElement as HTMLElement;
			const body=input.closest('[data-layout-role="body"]');
			if(body){const field=input.getBoundingClientRect(),box=body.getBoundingClientRect();if(field.bottom>box.bottom-12)body.scrollTop+=field.bottom-box.bottom+12;}
		});
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
	let canvas=$state<HTMLElement>();
	let motionHost=$state<HTMLElement>();
	let animateNext=true;
	let nextDirection:'forward'|'back'='forward';
	const motion=new PageMotion();
	runtime.onSelectionChange=(scope)=>{if(scope==='api-keys'){const count=runtime.count(scope);void open(count===0?'5775:15322':count===1?'5775:15503':'5775:15604',false);}};
	async function open(target: string, remember=true, direction:'forward'|'back'='forward') {
		if(target===id && !catalog)return;
		if(isSearchChange(id,target))remember=false;
		if(searchBase[id] && !searchBase[target])runtime.values[`search:${runtime.scope(id)}`]='';
		const request=++navigation;
		const targetNode=target!=='catalog'?await load(target):undefined;
		const modal=!!targetNode?.children.some(child=>typeof child!=='string'&&child.dialogSurface);
		const origin=page.state.designReturn;
		if(modal || origin)remember=false;
		nextDirection=direction;
		animateNext=(remember || direction==='back') && target!=='catalog' && !targetNode?.children.some(child=>typeof child!=='string' && child.dialogSurface);
		if(request!==navigation)return;
		const optionType=Object.entries(optionScreens).find(([,screen])=>screen===target)?.[0];
		if(optionType)runtime.questionType=optionType;
		const url=(target==='catalog'?'/design':`/design/${target.replace(':','-')}`)+(reference?'?reference=1':'');
		await goto(url,{replace:!remember,state:{designHistory:remember?[...(page.state.designHistory??[]),id]:(page.state.designHistory??[]),designReturn:modal?(origin??id):undefined}});
		await tick();
	}
	beforeNavigate((navigation)=>{
		if(navigation.type==='popstate' && page.state.designReturn){navigation.cancel();void open(page.state.designReturn,false);return;}
		if(navigation.type==='popstate' && searchBase[id])runtime.values[`search:${runtime.scope(id)}`]='';
		if(viewport){const body=viewport.querySelector('[data-layout-role="body"]');if(body)runtime.scrolls[id]=body.scrollTop;}
		const allowed=!reference && !catalog && !viewport?.querySelector('[role="dialog"]') && (navigation.type==='popstate' || animateNext);
		if(allowed)motion.prepare(canvas,motionHost,navigation.type==='popstate' && navigation.delta<0?'back':nextDirection);else motion.finish();
	});
	afterNavigate(()=>{void tick().then(()=>{
		motion.play(canvas);
		requestAnimationFrame(()=>{const body=viewport?.querySelector('[data-layout-role="body"]');if(body)body.scrollTop=runtime.scrolls[id]??0;});
	});});
	function activate(node: DesignNode) {
		if(node.formTabValue){runtime.formTab=node.formTabValue;void open(node.formTabValue==='Assignments'?'5775:10200':'5775:10144',false);return true;}
		if(node.collapseKey){runtime.collapsed[node.collapseKey]=!runtime.collapsed[node.collapseKey];return true;}
		if(node.filter){runtime.filters[node.filter.group]=node.filter.value;return true;}
		if(node.backAction){if(page.state.designReturn){void open(page.state.designReturn,false);return true;}if(page.state.designHistory?.length)history.back();else {const target=destination(id,{...node,name:'lucide/arrow-left'});if(target)void open(target,false,'back');}return true;}
		if(node.step){runtime.formDirty=true;const next=(runtime.numbers[node.step.key]??0)+node.step.delta;runtime.numbers[node.step.key]=node.step.key==='step:5775:14246'?Math.min(next,runtime.numbers['step:5775:14252']):node.step.key==='step:5775:14252'?Math.max(next,runtime.numbers['step:5775:14246']):Math.max(0,next);return true;}
		if(node.name==='lucide/search'){const scope=runtime.scope(id);runtime.values[`search:${scope}`] ??= '';runtime.searchOpen[scope]=true;return true;}
		const label=node.label || node.children.filter(c=>typeof c==='string').join(' ');
		const scope=runtime.scope(id);
		if(node.rowChoiceKey){runtime.checks[node.rowChoiceKey]=!runtime.checks[node.rowChoiceKey];runtime.onSelectionChange?.(scope);return true;}
		if(id==='5775:14183' && node.typeValue){if(runtime.questionType!==node.typeValue)runtime.typeDirty=true;runtime.questionType=node.typeValue;return true;}

		if(textOf(node)==='Options') {void open(optionScreens[runtime.questionType],false);return true;}
		if(label==='Cancel' && page.state.designReturn){void open(page.state.designReturn,false);return true;}
		if(label==='Cancel' && page.state.designHistory?.length){history.back();return true;}
		if(label==='Select all'){runtime.selectAll(scope);return true;}
		if(label==='Just my team' || label==='Just this tournament'){runtime.selectAll(scope,true);return true;}
		if(label==='Apply changes')runtime.apply(scope);
		if (id === '5775:10120' && node.control === 'button') {
			open(
				choices['5775:10128'] === '5775:10130' ? '5775:10144' : '5775:14699',
			);
			return true;
		}
		const target = destination(id, node);
		if (target){if(target==='5775:10144')runtime.formTab='Questions';void open(target,node.name!=='Tab' && node.name!=='Segment');}
		return !!target;
	}
	onMount(() => {
		const orientation=()=>{stableHeight=0;keyboardInset=0;measure();};
		screen.orientation?.addEventListener('change',orientation);
		const keyboard = (event: KeyboardEvent) => {
			if (event.key === 'Escape') open('catalog');
		};
		window.addEventListener('keydown', keyboard);
		window.addEventListener('resize', measure);
		document.addEventListener('focusin',measure);
		document.addEventListener('focusout',measure);
		window.visualViewport?.addEventListener('resize', measure);
		return () => {
			motion.finish();
			screen.orientation?.removeEventListener('change',orientation);
			window.removeEventListener('keydown', keyboard);
			window.removeEventListener('resize', measure);
			document.removeEventListener('focusin',measure);
			document.removeEventListener('focusout',measure);
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
		class:profile-page={/^5775:15(?:1\d\d|2[0-5]\d)$/.test(id)}
		class:keyboard-open={keyboardInset>80}
		style={`--keyboard-inset:${keyboardInset / scale}px`}
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
				{:then node}{@const view=parts(node,id)}<div class="design-page" bind:this={canvas}>{#key id}<NodeView
							node={view.page}
							{reference}
							layout={view.layout}
							{activate}
							{heightDelta}
							{choices}
							{choose}
						/>{/key}</div>
				{:catch}<p role="alert">Could not open this screen.</p>
					<Button onclick={() => open('catalog')}>Screens</Button>{/await}
				<div class="design-motion-host" bind:this={motionHost} aria-hidden="true"></div>
				<div class="design-dock" class:responses-dock={runtime.formTab==='Responses' && ['5775:10144','5775:10200'].includes(id)}>{#each docks as dock(dock.key)}<NodeView node={dock.node} {reference} root={false} layout={dockLayout} {activate} {heightDelta} {choices} {choose}/>{/each}</div>
			</div>
		</div>
	</main>
{:else}
	<main class="design-catalog">
		<h1>Screen unavailable</h1>
		<Button onclick={() => open('catalog')}>Screens</Button>
	</main>
{/if}
