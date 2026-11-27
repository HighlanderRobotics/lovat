<script lang="ts">
	import { Button, TextField } from '@highlanderrobotics/magnolia-svelte/v2';
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
	const anchor = $derived(typeof node === 'string' ? undefined : layout[node.id ?? '']);
	const style = $derived(typeof node === 'string' ? '' : anchoredStyle(node.style, anchor, heightDelta, reference, root, extraFilter));
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
				: radioSelected}
		/>{/each}
{/snippet}

{#if typeof node === 'string'}{node}
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
		aria-label={node.label || 'Add'}
		data-figma-node={node.id}
		data-layout-role={anchor?.kind}
		onclick={(event) => {
			if (activate(node as DesignNode)) event.stopPropagation();
		}}
	>
		{@render children(node.children)}
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
		placeholder={node.children
			.filter((child) => typeof child === 'string')
			.join(' ')}
		value={node.value}
	/>
{:else}
	{@const active =
		interactiveNames.test(node.name) ||
		/^lucide\//.test(node.name) ||
		node.name === 'Icon' ||
		node.name === 'Action' ||
		node.name.startsWith('Qualification ') ||
		['Lovat', 'Teams', 'Matches'].includes(textOf(node))}
	<svelte:element
		this={node.tag}
		style={style +
			(node.choiceGroup && choices[node.choiceGroup]
				? choices[node.choiceGroup] === (node.choiceValue ?? node.id)
					? ';background-image:none;background-color:#34323c;outline:1px solid #b59aff;outline-offset:-1px'
					: ';background-image:none;background-color:#262626;outline:1px solid #424242;outline-offset:-1px'
				: '')}
		data-figma-node={node.id}
		data-layout-role={anchor?.kind}
		data-design-name={node.name}
		data-mock-selected={selected || undefined}
		role={node.choiceGroup ? 'radio' : active ? 'button' : undefined}
		tabindex={active ? 0 : undefined}
		aria-checked={node.choiceGroup
			? (choices[node.choiceGroup] ?? node.choiceDefault) ===
				(node.choiceValue ?? node.id)
			: undefined}
		aria-label={active
			? textOf(node) || node.name.replace('lucide/', '')
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
		{@render children(node.children)}
	</svelte:element>
{/if}
