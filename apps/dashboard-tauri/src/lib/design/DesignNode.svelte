<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { DESIGN_RUNTIME, type DesignRuntime } from './runtime.svelte.ts';
	import { Button, TextField, Checkbox, Radio, Switch } from '@highlanderrobotics/magnolia-svelte/v2';
	import NodeView from './DesignNode.svelte';
	import type { DesignNode } from './model.ts';
	import { textOf } from './model.ts';
	import { anchoredStyle, bodyFilter, type ScreenLayout } from './layout.ts';
	let {
		node,
		activate,
		editable = true,
		choices,
		choose,
		radioSelected,
		heightDelta = 0, layout = {}, reference = false, root = true, extraFilter,
	}: {
		node: DesignNode | string;
		activate: (node: DesignNode) => boolean;
		editable?: boolean;
		choices: Record<string, string>;
		choose: (group: string, value: string) => void;
		radioSelected?: boolean;
		heightDelta?: number; layout?: ScreenLayout; reference?: boolean; root?: boolean; extraFilter?: string;
	} = $props();
	const runtime=getContext<DesignRuntime>(DESIGN_RUNTIME);
	let expired=$state(false);
	onMount(()=>{if(typeof node!=='string' && node.name==='Toast' && !reference){const timer=setTimeout(()=>expired=true,1500);return ()=>clearTimeout(timer);}});
	const hidden=$derived(typeof node!=='string' && node.searchable && runtime.values[`search:${node.searchScope}`] && !textOf(node).toLowerCase().includes(runtime.values[`search:${node.searchScope}`].toLowerCase()));
	const anchor = $derived(typeof node === 'string' ? undefined : layout[node.id ?? '']);
	const style = $derived(typeof node === 'string' ? '' : anchoredStyle(node.style, anchor, heightDelta, reference, root, extraFilter)+(hidden?';display:none':'')+(typeof node!=='string' && node.typeSave && runtime.typeDirty?';opacity:1':''));
	const interactiveNames =
		/^(Tab|Chip|SelectableCard|ListItem|TableRow|MenuItem|SheetAction|ComboOption|NavItem|TabBarItem|Avatar|Checkbox|Radio|Segment|Toggle|Destination)$/;
	let selected = $state(false);
	function click(event: MouseEvent | KeyboardEvent, current: DesignNode) {
		if (current.choiceGroup && current.id) {
			choose(current.choiceGroup, current.choiceValue ?? current.id);
			event.stopPropagation();
		} else if (activate(current)) event.stopPropagation();
		else if (
			['Checkbox', 'Radio', 'SelectableCard', 'Chip'].includes(current.name)
		) {
			selected = !selected;
			event.stopPropagation();
		}
	}
</script>

{#snippet children(items: (DesignNode | string)[])}
	{#each items as child}<NodeView
			node={child}
			{activate}
			{editable}
			{choices}
			{choose}
			{heightDelta}
			{layout} {reference} root={false}
			extraFilter={!reference && anchor?.kind === 'body' && typeof node !== 'string' ? bodyFilter(node.style) : undefined}
			radioSelected={typeof node !== 'string' &&
			node.choiceGroup &&
			choices[node.choiceGroup]
				? choices[node.choiceGroup] === (node.choiceValue ?? node.id)
				: typeof node !== 'string' && node.typeValue ? runtime.questionType===node.typeValue : radioSelected}
		/>{/each}
{/snippet}

{#if typeof node === 'string'}{node}
{:else if node.name==='Toast' && expired}
	<!-- Timed confirmations leave the current screen in place. -->
{:else if node.choice && !reference}
	<div style={style} class="design-choice-row" class:compact={!textOf(node)} data-choice-kind={node.choice.kind} onclick={(event)=>event.stopPropagation()} onkeydown={(event)=>event.stopPropagation()} role="presentation" data-design-name={node.name} data-figma-node={node.id}>
		{#if node.choice.kind==='checkbox'}
			<Checkbox label={node.choice.label} checked={runtime.checked(node.choice)} onchange={(event)=>runtime.setChecked((node as DesignNode).choice!, (event.currentTarget as HTMLInputElement).checked)} />
		{:else if node.choice.kind==='radio'}
			<Radio label={node.choice.label} value={node.choice.key} name={node.choice.group} bind:group={runtime.groups[node.choice.group]} />
		{:else}
			<Switch label={node.choice.label} checked={runtime.checked(node.choice)} onchange={(event)=>runtime.setChecked((node as DesignNode).choice!, (event.currentTarget as HTMLInputElement).checked)} />
		{/if}
	</div>
{:else if node.tag === 'img'}
	<img
		src={radioSelected === undefined ||
		!node.src?.match(/(4a61c|a8497|83187|0343f)\.svg$/)
			? node.src
			: radioSelected
				? '/design-assets/83187.svg'
				: '/design-assets/4a61c.svg'}
		alt=""
		style={style}
		data-figma-node={node.id}
		data-layout-role={anchor?.kind}
	/>
{:else if node.control === 'button'}
	<Button
		class="design-button"
		variant={node.variant}
		style={style}
		aria-label={runtime.buttonLabel(node) || 'Add'}
		disabled={(node.typeSave && !runtime.typeDirty) || /^Promote \d+ Analysts?$/.test(node.label??'') && runtime.count(node.searchScope??'')===0}
		data-figma-node={node.id}
		data-layout-role={anchor?.kind}
		onclick={(event) => {
			if (activate(node as DesignNode)) event.stopPropagation();
		}}
	>
		{#if !reference && runtime.buttonLabel(node)!==node.label}{runtime.buttonLabel(node)}{:else}{@render children(node.children)}{/if}
	</Button>
{:else if node.control === 'input' && editable}
	<TextField
		class="design-field-input"
		label={node.label ?? 'Value'}
		style={style}
		data-figma-node={node.id}
		data-layout-role={anchor?.kind}
		type={node.inputType || 'text'}
		aria-label={node.label}
		placeholder={node.placeholder ?? node.label}
		value={node.inputKey ? runtime.values[node.inputKey] : node.value}
		oninput={(event)=>{if(typeof node!=='string' && node.inputKey)runtime.values[node.inputKey]=(event.currentTarget as HTMLInputElement).value;}}
	/>
{:else}
	{@const active =
		!node.passive && (!!node.step || !!node.backAction || interactiveNames.test(node.name) ||
		/^lucide\//.test(node.name) ||
		node.name === 'Icon' ||
		node.name === 'Action' ||
		node.name.startsWith('Qualification ') ||
		['Lovat', 'Teams', 'Matches'].includes(textOf(node)))}
	<svelte:element
		this={node.tag}
		style={style +
			(node.typeValue ? (runtime.questionType===node.typeValue ? ';background-image:none;background-color:#34323c;outline:1px solid #b59aff;outline-offset:-1px' : ';background-image:none;background-color:#262626;outline:1px solid #424242;outline-offset:-1px') : '') +
			(node.choiceGroup && choices[node.choiceGroup]
				? choices[node.choiceGroup] === (node.choiceValue ?? node.id)
					? ';background-image:none;background-color:#34323c;outline:1px solid #b59aff;outline-offset:-1px'
					: ';background-image:none;background-color:#262626;outline:1px solid #424242;outline-offset:-1px'
				: '')}
		data-figma-node={node.id}
		data-layout-role={anchor?.kind}
		data-design-name={node.name}
		data-stepper={node.stepperKey}
		data-toast={node.name==='Toast' || undefined}
		data-mock-selected={selected || undefined}
		role={node.typeValue ? 'radio' : node.choiceGroup ? 'radio' : active ? 'button' : undefined}
		tabindex={active ? 0 : undefined}
		aria-checked={node.typeValue ? runtime.questionType===node.typeValue : node.choiceGroup
			? (choices[node.choiceGroup] ?? node.choiceDefault) ===
				(node.choiceValue ?? node.id)
			: undefined}
		aria-label={active
			? node.actionLabel || (node.backAction?'Back':textOf(node)) || node.name.replace('lucide/', '')
			: undefined}
		onclick={active
			? (event: MouseEvent) => click(event, node as DesignNode)
			: undefined}
		oncontextmenu={node.name === 'SelectableCard'
			? (event: MouseEvent) => {
					if (
						node.name === 'SelectableCard' &&
						node.id?.startsWith('5775:101')
					) {
						event.preventDefault();
						activate({ ...node, name: 'Question selection' } as DesignNode);
					}
				}
			: undefined}
		onkeydown={active
			? (event: KeyboardEvent) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						click(event, node as DesignNode);
					}
				}
			: undefined}
	>
		{#if node.numberKey}{runtime.numbers[node.numberKey]}{:else if node.summaryScope && runtime.summaries[node.summaryScope]}{runtime.summaries[node.summaryScope]}{:else}{@render children(node.children)}{/if}
	</svelte:element>
{/if}
