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
	import { presentation, apiToolbar, isSearchChange, searchBase, type Presentation, type Dock } from './presentation.ts';
	import { nodes } from './behaviors.ts';
	import { navbarDirection, navbarLabel, revisitDelta } from './navigation.ts';
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
	let navbarTemplate:DesignNode|undefined;
	$effect(()=>{const current=page.state.designTab??id;untrack(()=>{runtime.currentTab=navbarLabel(current)??runtime.currentTab;});});
	const presentations=new WeakMap<DesignNode,Presentation>();
	function parts(node:DesignNode, frameId:string):Presentation {
		const origin=page.state.designReturn;
		const base=origin?cache.get(`${reference?'reference:':''}${origin}`):undefined;
		if(base && base!==node && node.children.some(child=>typeof child!=='string'&&child.dialogSurface)){
			const background=parts(base,origin!);
			return {page:{...background.page,children:[{tag:'div',name:'ModalBackground',style:'display:contents',inert:true,children:background.page.children},...node.children.filter(child=>typeof child!=='string'&&(child.dialogSurface||child.name==='DialogBackdrop'))]},docks:background.docks,layout:{...background.layout,...(layouts[frameId as keyof typeof layouts] as ScreenLayout)}};
		}
		let value=presentations.get(node);if(!value){value=presentation(node,layouts[frameId as keyof typeof layouts] as ScreenLayout,reference);presentations.set(node,value);}
        const nav=value.docks.find(dock=>dock.key.startsWith('nav:'));if(nav)navbarTemplate=nav.node;
        if(page.state.designTab && !nav && navbarTemplate){
          const layout:ScreenLayout={...value.layout,'runtime:navbar':{kind:'nav' as const,x:0,y:0,w:393,h:52}};
          for(const [key,anchor] of Object.entries(layout))if(anchor.kind==='body')layout[key]={...anchor,bottom:Math.max(anchor.bottom??0,52)};
          return {...value,layout,docks:[...value.docks,{key:'nav:0',node:{...navbarTemplate,id:'runtime:navbar'}}]};
        }
        return value;
	}
	let docks=$state<Dock[]>([]);
	let dockLayout=$state<ScreenLayout>({});
	$effect(()=>{const current=scene,frameId=id,keyCount=runtime.count('api-keys');if(current)untrack(()=>{void Promise.resolve(current).then(node=>{if(id===frameId){const value=parts(node,frameId);if(!reference && runtime.scope(frameId)==='api-keys'){docks=apiToolbar(keyCount);dockLayout={...value.layout,'runtime:api-toolbar':{kind:'footer',x:26,y:0,w:341,h:keyCount===1?98:44,bottom:26,blockX:0,blockY:0}};}else{docks=value.docks;dockLayout=value.layout;}}});});});
	const scene = $derived(frame ? load(id) : undefined);
	let width = $state(393);
	let viewport = $state<HTMLElement>();
	let safeTop = $state(0);
	let safeBottom = $state(0);
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
		safeBottom=parseFloat(getComputedStyle(viewport).paddingBottom)||0;
		availableHeight=height-safeTop-safeBottom;
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
	let traversalDirection:'forward'|'back'|undefined;
	const motion=new PageMotion();
	runtime.onSelectionChange=undefined;
	async function open(target: string, remember=true, direction:'forward'|'back'='forward',navbar=false) {
		if(target===id && !catalog)return;
		if(isSearchChange(id,target))remember=false;
		if(searchBase[id] && !searchBase[target])runtime.values[`search:${runtime.scope(id)}`]='';
		const request=++navigation;
		const targetNode=target!=='catalog'?await load(target):undefined;
		if(target==='5775:15753'){const field=targetNode?nodes(targetNode).find(node=>node.control==='input'):undefined;const record=runtime.apiRecords?.find(record=>runtime.apiSelected[record.id]);if(field?.inputKey&&record)runtime.values[field.inputKey]=record.name;}
		if(target==='5775:14350' && runtime.editingOption){runtime.values['field:5775:14381']=runtime.optionLabels[runtime.editingOption.key]??runtime.editingOption.label;runtime.values['field:5775:14383']=runtime.optionHints[runtime.editingOption.key]??runtime.editingOption.hint??'';}
		const modal=!!targetNode?.children.some(child=>typeof child!=='string'&&child.dialogSurface);
		const origin=page.state.designReturn;
		if(modal || origin)remember=false;
		nextDirection=direction;
		animateNext=(remember || direction==='back') && target!=='catalog' && !targetNode?.children.some(child=>typeof child!=='string' && child.dialogSurface);
		if(request!==navigation)return;
		const optionType=Object.entries(optionScreens).find(([,screen])=>screen===target)?.[0];
		if(optionType)runtime.questionType=optionType;
		const delta=remember?revisitDelta(page.state.designHistory??[],target):0;
		if(delta){traversalDirection=navbar?direction:'back';history.go(delta);return;}
		const url=(target==='catalog'?'/design':`/design/${target.replace(':','-')}`)+(reference?'?reference=1':'');
		await goto(url,{replace:!remember,state:{designTab:navbar?target:undefined,designHistory:remember?[...(page.state.designHistory??[]),id]:(page.state.designHistory??[]),designReturn:modal?(origin??id):undefined}});
		await tick();
	}
	beforeNavigate((navigation)=>{
		if(navigation.type==='popstate' && page.state.designReturn){navigation.cancel();void open(page.state.designReturn,false);return;}
		if(navigation.type==='popstate' && searchBase[id])runtime.values[`search:${runtime.scope(id)}`]='';
		if(viewport){const body=viewport.querySelector('[data-layout-role="body"]');if(body)runtime.scrolls[id]=body.scrollTop;}
		const allowed=!reference && !catalog && !viewport?.querySelector('[role="dialog"]') && (navigation.type==='popstate' || animateNext);
		const direction=navigation.type==='popstate'?(traversalDirection??(navigation.delta<0?'back':'forward')):nextDirection;
		traversalDirection=undefined;
		if(allowed)motion.prepare(canvas,motionHost,direction);else motion.finish();
	});
	afterNavigate(()=>{void tick().then(()=>{
		motion.play(canvas);
		requestAnimationFrame(()=>{const body=viewport?.querySelector('[data-layout-role="body"]');if(body)body.scrollTop=runtime.scrolls[id]??0;});
	});});
	function activate(node: DesignNode) {
        if(node.memberName && node.name==='ListItem')runtime.activeMember=node.memberName;
        if(node.name==='ListItem' && /^(DCMP|SF Pit|\[WIP\])/.test(textOf(node)))runtime.formKind=/Superscout/i.test(textOf(node))?'match':/Break/i.test(textOf(node))?'alliance':'team';
		if(node.editOption){runtime.editingOption=node.editOption;void open('5775:14350');return true;}
		if(node.responseDetail){void open(node.responseDetail);return true;}
		if(node.formTabValue){runtime.formTab=node.formTabValue;void open(node.formTabValue==='Assignments'?(runtime.formKind==='match'?'5775:11390':runtime.formKind==='alliance'?'5775:11985':'5775:10200'):node.formTabValue==='Responses'?(runtime.formKind==='match'?'5787:14547':runtime.formKind==='alliance'?'5787:14566':'5787:14528'):'5775:10144',false);return true;}
		if(node.collapseKey){runtime.collapsed[node.collapseKey]=!runtime.collapsed[node.collapseKey];return true;}
		if(node.filter){runtime.filters[node.filter.group]=node.filter.value;return true;}
		if(node.backAction){if(page.state.designReturn){void open(page.state.designReturn,false);return true;}if(page.state.designHistory?.length)history.back();else {const target=destination(id,{...node,name:'lucide/arrow-left'});if(target)void open(target,false,'back');}return true;}
		if(node.step){
			runtime.formDirty=true;const step=node.step;let next=(runtime.numbers[step.key]??0)+step.delta;
			if(step.key===step.minKey)next=Math.min(next,runtime.numbers[step.maxKey!]??next);
			if(step.key===step.maxKey)next=Math.max(next,runtime.numbers[step.minKey!]??next);
			runtime.numbers[step.key]=Math.max(0,next);return true;
		}
		if(node.name==='lucide/search'){const scope=runtime.scope(id);runtime.values[`search:${scope}`] ??= '';runtime.searchOpen[scope]=true;return true;}
		const label=node.label || node.children.filter(c=>typeof c==='string').join(' ');
		const scope=runtime.scope(id);
        if(/^Promote \d+ Analysts?$/.test(label)){runtime.promoteAnalysts();void open('5775:15010',false);setTimeout(()=>runtime.promotionNotice='',1500);return true;}
        if(label==='Promote' && id==='5775:15131'){runtime.promoted[runtime.activeMember]=true;runtime.promotionNotice=`Promoted ${runtime.activeMember}`;void open('5775:15010',false);setTimeout(()=>runtime.promotionNotice='',1500);return true;}
        if(node.name==='lucide/settings' && (/^5775:(10144|10200|10287|11390|11985)$/.test(id)||id.startsWith('5787:'))){void open('5787:14585');return true;}
        if(node.name==='lucide/eye'){const previews:Record<string,string>={'5775:14235':'5787:17005','5775:14265':'5787:17054','5775:14284':'5787:17082','5775:14305':'5787:17116','5775:14394':'5787:17179'};void open(previews[id]??'5787:17005');return true;}
        if(node.name==='lucide/copy' && id==='5787:14585'){runtime.promotionNotice='Copied form';setTimeout(()=>runtime.promotionNotice='',1500);return true;}
        if(label==='Delete form'){void open('5787:14615');return true;}
        if(label==='Delete' && id==='5787:14615'){void open('5775:10069',false);return true;}
        if(label==='Export form data'){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({form:'DCMP Break Scouting',responses:[]},null,2)],{type:'application/json'}));a.download='DCMP-Break-Scouting.json';a.click();URL.revokeObjectURL(a.href);return true;}
        if(label==='Publish form as a template'){runtime.promotionNotice='Published form as a template';setTimeout(()=>runtime.promotionNotice='',1500);return true;}
        if(node.rowChoiceKey){runtime.checks[node.rowChoiceKey]=!runtime.checks[node.rowChoiceKey];runtime.onSelectionChange?.(scope);return true;}
		if(id==='5775:14183' && node.typeValue){if(runtime.questionType!==node.typeValue)runtime.typeDirty=true;runtime.questionType=node.typeValue;return true;}

		if(textOf(node)==='Options') {void open(optionScreens[runtime.questionType],false);return true;}
		if(label==='Create' && id==='5775:15386'){const field=nodes(cache.get(id)!).find(node=>node.control==='input'&&node.label==='Name');runtime.createKey(field?.inputKey?runtime.values[field.inputKey]:'');}
		if(label==='Rename' && id==='5775:15753'){const field=nodes(cache.get(id)!).find(node=>node.control==='input');runtime.renameKey(field?.inputKey?runtime.values[field.inputKey]:'');}
		if(label==='Delete' && ['5775:15553','5775:15895'].includes(id))runtime.deleteKeys();
		if(label==='Save' && id==='5775:14350' && runtime.editingOption){runtime.optionLabels[runtime.editingOption.key]=runtime.values['field:5775:14381'];runtime.optionHints[runtime.editingOption.key]=runtime.values['field:5775:14383']??'';runtime.formDirty=true;void open(page.state.designReturn??'5775:14305',false);return true;}
		if(label==='Assign' && id==='5775:11203'){runtime.autoAssign();void open(page.state.designReturn??'5775:10287',false);return true;}
		if(label==='Cancel' && page.state.designReturn){void open(page.state.designReturn,false);return true;}
		if(label==='Cancel' && page.state.designHistory?.length){history.back();return true;}
		if(/^Delete \d+ keys$/.test(label)){void open('5775:15895');return true;}
		if(label==='Select all'){runtime.selectAll(scope,false,!runtime.allSelected(scope));return true;}
		if(label==='Just my team' || label==='Just this tournament'){runtime.selectAll(scope,true);return true;}
		if(label==='Apply changes')runtime.apply(scope);
		if (id === '5775:10120' && node.control === 'button') {
			open(
				choices['5775:10128'] === '5775:10130' ? '5775:10144' : '5775:14699',
			);
			return true;
		}
		const target = destination(id, node);
		if(target && node.name==='TabBarItem'){void open(target,true,navbarDirection(id,target),true);return true;}
		if (target){if(target==='5775:10144')runtime.formTab='Questions';void open(target,node.name!=='Tab' && node.name!=='Segment');}
		return !!target;
	}
	onMount(() => {
		const orientation=()=>{stableHeight=0;keyboardInset=0;measure();};
		screen.orientation?.addEventListener('change',orientation);
		const keyboard = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {if(page.state.designReturn)void open(page.state.designReturn,false);else void open('catalog');}
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
		<p>{manifest.length} Figma screens and states · local mock data</p>
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
		class:home-page={['5775:9807','5775:9936'].includes(id)}
		style={`--keyboard-inset:${Math.max(0,keyboardInset-safeBottom) / scale}px`}
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
				{#if runtime.promotionNotice}<div class="design-notice" role="status">{runtime.promotionNotice}</div>{/if}
				<div class="design-motion-host" bind:this={motionHost} aria-hidden="true"></div>
				<div class="design-dock" inert={!!page.state.designReturn} class:responses-dock={runtime.formTab==='Responses' && ['5775:10144','5775:10200'].includes(id)}>{#each docks as dock(dock.key)}<NodeView node={dock.node} {reference} root={false} layout={dockLayout} {activate} {heightDelta} {choices} {choose}/>{/each}</div>
			</div>
		</div>
	</main>
{:else}
	<main class="design-catalog">
		<h1>Screen unavailable</h1>
		<Button onclick={() => open('catalog')}>Screens</Button>
	</main>
{/if}
