<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { DESIGN_RUNTIME, type DesignRuntime } from './runtime.svelte.ts';
	import { Button, TextField, TextArea, Checkbox, Radio, Switch, Slider } from '@highlanderrobotics/magnolia-svelte/v2';
	import ApiKeysTable from './ApiKeysTable.svelte';
	import TeamAssignments from './TeamAssignments.svelte';
	import ScouterPicker from './ScouterPicker.svelte';
	import SearchBar from './SearchBar.svelte';
	import SwipeOption from './SwipeOption.svelte';
	import FilterPills from './FilterPills.svelte';
	import NodeView from './DesignNode.svelte';
	import type { DesignNode } from './model.ts';
	import {questionSubtitle,questionIcons,type QuestionType} from './questions.ts';
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
	function apiText(node:DesignNode){return !reference && node.searchScope==='api-keys'?textOf(node).replace(/\b\d+(?= keys\b)/g,String(/Deleted/.test(textOf(node))?runtime.apiLastAffected:(runtime.count('api-keys')||runtime.apiLastAffected))):textOf(node);}
	function isHidden(node:DesignNode) {
		if(reference)return false;
		if(node.questionOptionalFor && runtime.required(node.questionOptionalFor))return true;
		if(node.optionHintKey && !(runtime.optionHints[node.optionHintKey]??textOf(node)))return true;
		if(node.promotionUser && runtime.promoted[node.promotionUser])return true;
		if(node.searchTrigger && runtime.searchOpen[node.searchScope??''])return true;
		if(node.hideForResponses && runtime.formTab==='Responses' || node.responseSummary && runtime.formTab!=='Responses')return true;
		if(node.collapseGroup && runtime.collapsed[node.collapseGroup])return true;
		if(node.swipeKey && runtime.deleted[node.swipeKey])return true;
		if(node.matchLevel && runtime.matchLevels.length && !runtime.matchLevels.includes(node.matchLevel))return true;
		if(node.filterItem){const value=runtime.filters[node.filterItem.group]??'All';const status=node.filterItem.status;if(!['All','Assigned','Submitted','Unassigned','Missing Submission'].includes(value) && value!==status)return true;if(value==='Assigned' && status==='Unassigned' || value==='Submitted' && status!=='Submitted' || value==='Unassigned' && status!=='Unassigned' || value==='Missing Submission' && status==='Submitted')return true;}
		return !!(node.searchable && runtime.values[`search:${node.searchScope}`] && !textOf(node).toLowerCase().includes(runtime.values[`search:${node.searchScope}`].toLowerCase()));
	}
	const hidden=$derived(typeof node!=='string' && isHidden(node));
	const anchor = $derived(typeof node === 'string' ? undefined : node.dialogSurface || node.inlineFlex && layout[node.id??'']?.kind==='flow'?undefined:layout[node.id ?? '']);
	const style = $derived(typeof node === 'string' ? '' : anchoredStyle(node.style, anchor, heightDelta, reference, root, extraFilter)+(hidden?';display:none':'')+(typeof node!=='string' && (/^Save (changes|assignments)$/.test(node.label??'') && (runtime.typeDirty || runtime.formDirty))?';opacity:1':''));
	const interactiveNames =
		/^(Tab|Chip|SelectableCard|ListItem|TableRow|MenuItem|SheetAction|ComboOption|NavItem|TabBarItem|Avatar|Checkbox|Radio|Segment|Toggle|Destination)$/;
	let selected = $state(false);
	function click(event: MouseEvent | KeyboardEvent, current: DesignNode) {
        if(current.name==='DialogBackdrop'){activate({...current,label:'Cancel'});event.stopPropagation();return;}
		if(current.disabled)return;
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
{:else if node.profileCopy}<p style={style}>{node.profileCopy.replaceAll('Collin C',runtime.activeMember)}</p>
{:else if node.profileRole}<p style={style}>{runtime.promoted[runtime.activeMember]?'Scouting Lead':'Analyst'}</p>
{:else if node.memberRole && node.memberName && runtime.promoted[node.memberName]}<p style={style}>Scouting Lead</p>
{:else if node.name==='Toast' && expired}
	<!-- Timed confirmations leave the current screen in place. -->
{:else if node.savedQuestions && !reference}
 <div class="saved-question-list" style={style}>{#each runtime.savedQuestions as question(question.id)}<button class="saved-question-card" onclick={()=>activate({tag:'div',name:'SavedQuestion',style:'',children:[],draftQuestionId:question.id})}>{#if question.kind}<img src={questionIcons[question.kind as QuestionType]} alt=""/>{/if}<span><strong>{question.title}</strong><small>{questionSubtitle(question.kind,question.required)}</small></span></button>{/each}</div>
{:else if node.name==='Text' && node.questionHeadingFor && !reference}
 <div style={style} class="design-question-heading">{@render children(node.children)}
  {#if runtime.values[`hint:${node.questionHeadingFor}`]}<p class="design-question-hint">{runtime.values[`hint:${node.questionHeadingFor}`]}</p>{/if}
  <p class="design-question-optional">{questionSubtitle(node.questionHeadingFor,runtime.required(node.questionHeadingFor))}</p>
 </div>
{:else if node.apiTable && !reference}
	<div style={style}><ApiKeysTable records={runtime.apiRecords??[]} selected={runtime.apiSelected} query={runtime.values['search:api-keys']??''} onselect={(id,checked)=>runtime.selectKey(id,checked)} onall={(checked)=>runtime.selectAllKeys(checked)}/></div>
{:else if node.navIcon && !reference}
 <span style={style+`;background-color:${runtime.currentTab===node.navIcon?'#b59aff':'#b7b7b7'};mask-image:url('${node.src}');mask-size:100% 100%;mask-repeat:no-repeat`} aria-hidden="true"></span>
{:else if node.typeIcon && !reference}
	<span data-icon={node.typeIcon} style={style+';display:block;width:24px;height:24px'}><span class="design-type-icon" style={`background-color:${radioSelected?'#b59aff':'#e6e6e6'};mask-image:url('${typeof node.children[0]!=='string' ? node.children[0]?.src : ''}')`}></span></span>
{:else if node.name==='Slider' && !reference}
	<div class="design-preview-slider"><Slider label="Rating" min={1} max={10} value={5} formatValue={(value)=>String(value)} style="width:100%"/></div>
{:else if node.name==='Drop zone' && !reference}
	<label class="design-photo-drop" style={style}><input type="file" accept="image/jpeg,image/png" multiple onchange={(event)=>{if(typeof node!=='string')runtime.values[`photos:${node.id}`]=Array.from(event.currentTarget.files??[]).map(file=>file.name).join(', ');}}/>{@render children(node.children)}{runtime.values[`photos:${node.id}`]??''}</label>
{:else if node.teamAssignments && !reference}
	<div style={style}><TeamAssignments teams={runtime.assignmentItems} people={runtime.selectedScouters} onmove={(id,assignee)=>runtime.moveTeam(id,assignee)} onadd={(name)=>{if(!runtime.selectedScouters.includes(name))runtime.selectedScouters=[...runtime.selectedScouters,name];}}/></div>
{:else if node.scouterSelect && !reference}
	<ScouterPicker selected={runtime.selectedScouters} onchange={(selected)=>runtime.selectedScouters=selected}/>
{:else if node.searchBar && runtime.searchOpen[node.searchScope??''] && !reference}
	<div style={style} data-layout-role="header" data-design-name="TopBar"><SearchBar placeholder={node.searchPlaceholder??'Search'} bind:value={runtime.values[`search:${node.searchScope}`]} onclose={()=>{if(typeof node!=='string'){runtime.searchOpen[node.searchScope??'']=false;runtime.values[`search:${node.searchScope}`]='';}}}/></div>
{:else if node.profileBar && !reference}
	<div class="design-profile-bar" data-design-name="TopBar" data-layout-role="header" data-figma-node={node.id} style={style+';display:flex;flex-direction:row;align-items:center;justify-content:space-between;padding:0 4px'}>
		<Button variant="tertiary" class="design-profile-action" aria-label="Back" onclick={()=>activate({...node as DesignNode,backAction:true})}><img src="/design-assets/0ccbb.svg" alt=""/></Button>
		{#if node.profileEdit}<Button variant="tertiary" class="design-profile-action" aria-label="Edit profile" onclick={()=>activate((node as DesignNode).profileEdit!)}><img src={node.profileEditIcon} alt=""/></Button>{:else}<span style="width:44px"></span>{/if}
	</div>
{:else if node.swipeKey && hidden}
	<!-- A deleted option releases its row space. -->
{:else if node.swipeKey && !reference}
	<div style={style} data-swipe-option={node.swipeKey}><SwipeOption label={runtime.optionLabels[node.swipeKey]??node.swipeLabel??'Option'} ondelete={()=>{if(typeof node!=='string' && node.swipeKey){runtime.deleted[node.swipeKey]=true;runtime.formDirty=true;}}}>{@render children(node.children)}</SwipeOption></div>
{:else if node.filterSelect && !reference}
	<FilterPills selected={runtime.matchLevels} onchange={(values)=>runtime.matchLevels=values}/>
{:else if node.choice && !reference}
	<div style={style} class="design-choice-row" class:preview-option-row={!!node.previewOption} class:compact={!textOf(node)} data-choice-kind={node.choice.kind} onclick={(event)=>event.stopPropagation()} onkeydown={(event)=>event.stopPropagation()} role="presentation" data-design-name={node.name} data-figma-node={node.id}>
		{#if node.choice.kind==='checkbox'}
			<Checkbox label={node.previewOption?(runtime.optionLabels[node.previewOption.key]??node.previewOption.label):node.choice.label} checked={runtime.checked(node.choice)} onchange={(event)=>runtime.setChecked((node as DesignNode).choice!, (event.currentTarget as HTMLInputElement).checked)} />
		{:else if node.choice.kind==='radio'}
			<Radio label={node.previewOption?(runtime.optionLabels[node.previewOption.key]??node.previewOption.label):node.choice.label} value={node.choice.key} name={node.choice.group} group={runtime.groups[node.choice.group]??null} onchange={()=>{if(typeof node!=='string' && node.choice)runtime.groups[node.choice.group]=node.choice.key;}} />
		{:else}
			<Switch label={node.previewOption?(runtime.optionLabels[node.previewOption.key]??node.previewOption.label):node.choice.label} checked={runtime.checked(node.choice)} onchange={(event)=>runtime.setChecked((node as DesignNode).choice!, (event.currentTarget as HTMLInputElement).checked)} />
		{/if}
        {#if node.previewOption && (runtime.optionHints[node.previewOption.key]??node.previewOption.hint)}<p class="preview-option-hint">{runtime.optionHints[node.previewOption.key]??node.previewOption.hint}</p>{/if}
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
		class={node.leftAction?"design-button design-left-action":"design-button"}
		variant={node.variant}
		style={style}
		aria-label={runtime.buttonLabel(node) || 'Add'}
		disabled={runtime.submission.status==='pending' || node.disabled || node.label==='Assign' && !runtime.selectedScouters.length || (node.typeSave && !runtime.typeDirty) || /^Promote \d+ Analysts?$/.test(node.label??'') && runtime.count(node.searchScope??'')===0}
		data-figma-node={node.id}
		data-layout-role={anchor?.kind}
		onclick={(event) => {
			if (activate(node as DesignNode)) event.stopPropagation();
		}}
	>
		{#if !reference && runtime.buttonLabel(node)!==node.label}{runtime.buttonLabel(node)}{:else}{@render children(node.children)}{/if}
	</Button>
{:else if node.control === 'input' && node.multiline && editable}
	<div class="design-textarea-host" class:description={node.label==='Description'}><TextArea label={node.label??'Notes'} value={node.inputKey?runtime.values[node.inputKey]:node.value} placeholder={node.placeholder??'Hint'} rows={4} style="width:100%" oninput={(event)=>{if(typeof node!=='string' && node.inputKey)runtime.values[node.inputKey]=event.currentTarget.value;}}/></div>
{:else if node.control === 'input' && editable}
	<TextField
		class="design-field-input"
		label={node.label ?? 'Value'}
		style={reference?style:'flex:1 1 0%;min-width:0;width:100%;position:relative'}
		data-figma-node={node.id}
		data-layout-role={anchor?.kind}
		type={node.inputType || 'text'}
		aria-label={node.label}
        error={node.inputKey?runtime.submission.errors[node.inputKey]:undefined}
		placeholder={node.placeholder ?? node.label}
		value={node.inputKey ? runtime.values[node.inputKey] : node.value}
		oninput={(event)=>{if(typeof node!=='string' && node.inputKey){runtime.values[node.inputKey]=(event.currentTarget as HTMLInputElement).value;runtime.submission.reset();if(node.inputKey.startsWith('field:'))runtime.formDirty=true;}}}
	/>
{:else}
	{@const active =
		!node.disabled && !node.passive && (node.name==='DialogBackdrop' || !!node.formTabValue || !!node.collapseKey || !!node.filter || !!node.step || !!node.backAction || interactiveNames.test(node.name) ||
		/^lucide\//.test(node.name) ||
		node.name === 'Icon' ||
		node.name === 'Action' ||
		node.name.startsWith('Qualification ') ||
		['Lovat', 'Teams', 'Matches'].includes(textOf(node)))}
	<svelte:element
		this={node.tag}
		inert={node.inert || undefined}
		aria-disabled={runtime.submission.status==='pending' || node.disabled || undefined}
		style={style + (node.navLabel?`;color:${runtime.currentTab===node.navLabel?'#b59aff':'#b7b7b7'}`:'') + (node.formTabValue?`;background:${runtime.formTab===node.formTabValue?'#3c3c3c':'transparent'}`:'') +
			(node.typeValue ? (runtime.questionType===node.typeValue ? ';background-image:none;background-color:#34323c;outline:1px solid #b59aff;outline-offset:-1px' : ';background-image:none;background-color:#262626;outline:1px solid #424242;outline-offset:-1px') : '') +
			(node.choiceGroup && choices[node.choiceGroup]
				? choices[node.choiceGroup] === (node.choiceValue ?? node.id)
					? ';background-image:none;background-color:#34323c;outline:1px solid #b59aff;outline-offset:-1px'
					: ';background-image:none;background-color:#262626;outline:1px solid #424242;outline-offset:-1px'
				: '')}
		data-figma-node={node.id}
		data-layout-role={anchor?.kind}
		data-design-name={node.name}
		data-filter-active={node.filter ? (runtime.filters[node.filter.group]??'All')===node.filter.value : undefined}
		data-collapse-open={node.collapseKey ? !runtime.collapsed[node.collapseKey] : undefined}
		data-stepper={node.stepperKey}
		data-toast={node.name==='Toast' || undefined}
		data-mock-selected={selected || undefined}
		aria-expanded={node.collapseKey ? !runtime.collapsed[node.collapseKey] : undefined}
		aria-pressed={node.filter ? (runtime.filters[node.filter.group]??'All')===node.filter.value : undefined}
		aria-modal={node.dialogSurface || undefined}
		role={node.dialogSurface ? 'dialog' : node.typeValue ? 'radio' : node.choiceGroup ? 'radio' : active ? 'button' : undefined}
		tabindex={active ? 0 : undefined}
		aria-checked={node.typeValue ? runtime.questionType===node.typeValue : node.choiceGroup
			? (choices[node.choiceGroup] ?? node.choiceDefault) ===
				(node.choiceValue ?? node.id)
			: undefined}
		aria-label={node.dialogSurface ? apiText(node) : active
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
		{#if !reference && node.searchScope==='api-keys' && node.children.length===1 && typeof node.children[0]==='string' && /\b\d+ keys\b/.test(node.children[0])}{apiText(node)}{:else if node.optionHintKey}{runtime.optionHints[node.optionHintKey]??textOf(node)}{:else if node.optionTextKey}{runtime.optionLabels[node.optionTextKey]??textOf(node)}{:else if node.numberKey}{runtime.numbers[node.numberKey]}{:else if node.summaryScope && runtime.summaries[node.summaryScope]}{runtime.summaries[node.summaryScope]}{:else}{@render children(node.children)}{/if}
	</svelte:element>
{/if}
