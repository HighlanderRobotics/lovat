<script lang="ts">
	import { Button } from '@highlanderrobotics/magnolia-svelte/v2';
	import NodeView from './DesignNode.svelte';
	import type { DesignNode } from './model.ts';
	import { textOf } from './model.ts';
	let {
		node,
		activate,
		editable = true,
		choices,
		choose,
		radioSelected,
	}: {
		node: DesignNode | string;
		activate: (node: DesignNode) => boolean;
		editable?: boolean;
		choices: Record<string, string>;
		choose: (group: string, value: string) => void;
		radioSelected?: boolean;
	} = $props();
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
		style={node.style}
		data-figma-node={node.id}
	/>
{:else if node.control === 'button'}
	<Button
		class="design-button"
		variant={node.variant}
		style={node.style}
		aria-label={node.label || 'Add'}
		data-figma-node={node.id}
		onclick={(event) => {
			if (activate(node as DesignNode)) event.stopPropagation();
		}}
	>
		{@render children(node.children)}
	</Button>
{:else if node.control === 'input' && editable}
	<input
		class="design-input"
		style={node.style}
		data-figma-node={node.id}
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
		style={node.style +
			(node.choiceGroup && choices[node.choiceGroup]
				? choices[node.choiceGroup] === (node.choiceValue ?? node.id)
					? ';background-image:none;background-color:#34323c;outline:1px solid #b59aff;outline-offset:-1px'
					: ';background-image:none;background-color:#262626;outline:1px solid #424242;outline-offset:-1px'
				: '')}
		data-figma-node={node.id}
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
