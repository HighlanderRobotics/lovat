import { enhanceScene, nodes } from './behaviors.ts';
import { textOf, type DesignNode } from './model.ts';

export const DESIGN_RUNTIME = Symbol('design-runtime');
export type Choice = { kind: 'checkbox' | 'radio' | 'switch'; key: string; group: string; initial: boolean; label: string; all?: boolean };
const selectorScopes: Record<string, string> = {
  '14810':'at', '15990':'at', '16335':'at',
  '15277':'tournaments', '16059':'tournaments', '16407':'tournaments',
  '15945':'teams', '16104':'teams', '16455':'teams',
  '15322':'api-keys', '15386':'api-keys', '15445':'api-keys', '15503':'api-keys', '15553':'api-keys', '15604':'api-keys', '15653':'api-keys', '15712':'api-keys', '15753':'api-keys', '15812':'api-keys', '15863':'api-keys', '15895':'api-keys',
  '14879':'analysts', '14922':'analysts', '14968':'analysts',
};
export const optionScreens: Record<string,string> = {
  Rating:'5775:14235', Photo:'5775:14284', 'Single select':'5775:14305',
  'Multiple Select':'5775:14394', 'Short Answer Text':'5775:14265',
};

export class DesignRuntime {
  numbers = $state<Record<string,number>>({});
  scrolls:Record<string,number>={};
  values = $state<Record<string,string>>({});
  checks = $state<Record<string,boolean>>({});
  groups = $state<Record<string,string>>({});
  summaries = $state<Record<string,string>>({});
  questionType = $state('Rating');
  typeDirty = $state(false);
  // Scene IDs differ across search/confirmation states; semantic keys retain edits.
  choices: Record<string, {key:string; label:string; initial:boolean}[]> = {};
  scope(frame:string) { return selectorScopes[frame.split(':').at(-1)!] ?? frame; }
  onSelectionChange?: (scope:string)=>void;
  count(scope:string) { return (this.choices[scope]??[]).filter(item=>this.checks[item.key]??item.initial).length; }
  checked(choice:Choice):boolean { return choice.all ? this.count(choice.group)===(this.choices[choice.group]?.length??0) : this.checks[choice.key] ?? choice.initial; }
  setChecked(choice:Choice, checked:boolean) { if(choice.all)this.selectAll(choice.group,false,checked);else this.checks[choice.key]=checked;this.onSelectionChange?.(choice.group); }
  selectAll(scope:string, onlyFirst=false, checked=true) {
    for(const [index,item] of (this.choices[scope]??[]).entries())this.checks[item.key]=checked && (!onlyFirst || index===0);
  }
  buttonLabel(node:DesignNode) {
    const label=node.label ?? '';
    const count=this.count(node.searchScope??'');
    if(/^Promote \d+ Analysts?$/.test(label))return `Promote ${count} Analyst${count===1?'':'s'}`;
    if(node.searchScope==='api-keys' && /^Delete (key|\d+ keys)$/.test(label))return count===1?'Delete key':`Delete ${count} keys`;
    return label;
  }
  apply(scope:string) {
    const items=this.choices[scope]??[];
    const selected=scope==='at'?items.filter(item=>item.key===this.groups.at):items.filter(item=>this.checks[item.key]??item.initial);
    this.summaries[scope]=selected.length===items.length && scope!=='at'?'All':selected.map(item=>item.label).join(', ') || 'None';
  }
}

/** Add behavior to translated design data without modifying reference geometry. */
export function prepareScene(source:DesignNode, frame:string, runtime:DesignRuntime):DesignNode {
  const optionType=Object.entries(optionScreens).find(([,screen])=>screen===frame)?.[0];
  if(optionType)runtime.questionType=optionType;
  const tree=structuredClone(source);
  enhanceScene(tree,frame);
  for(const node of nodes(tree))if(node.numberKey)runtime.numbers[node.numberKey] ??= Number(textOf(node));
  const scope=runtime.scope(frame);
  let index=0;
  const choices: {key:string;label:string;initial:boolean}[]=[];
  function visit(node:DesignNode, parent?:DesignNode, table?:DesignNode) {
    const label=textOf(node);
    if(node.name==='TableRow' || node.name==='TableHeader')table=node;
    if(node.control==='input') {
      const placeholder=/^(Search\b|Filter by\b|Enter new\b|Add scout$)/i.test(node.label??'');
      node.inputKey=/^(Search\b|Filter by\b)/i.test(node.label??'')?`search:${scope}`:`field:${node.id}`;
      node.placeholder=placeholder?node.label:textOf(node);
      runtime.values[node.inputKey] ??= placeholder?'':node.value??'';
    }
    if(node.name==='Checkbox' || node.name==='Radio' || node.name==='Toggle') {
      const markup=JSON.stringify(node);
      const kind=node.name==='Checkbox'?(scope==='at'?'radio':'checkbox'):'switch';
      const all=scope==='api-keys' && table?.name==='TableHeader';
      const key=all?`${scope}:all`:kind==='switch'?'question:required':`${scope}:${index++}`;
      const initial=kind==='switch'?markup.includes('/893af.svg'):markup.includes('/554ed.svg') || markup.includes('/2e4a4.svg');
      node.choice={kind,key,group:scope,initial,all,label:label || (all?'Select all keys':`Select ${textOf(table??node)}`)};
      if(!all)choices.push({key,label,initial});
      if(scope==='api-keys' && !all){runtime.checks[key] ??= initial;if(table)table.rowChoiceKey=key;}
      if(kind==='radio' && initial)runtime.groups[scope] ??= key;
    }
    node.searchScope=scope;
    node.searchable=['ListItem','TableRow','SelectableCard','Checkbox'].includes(node.name) || node.name.startsWith('Qualification ');
    if(frame==='5775:14183' && node.name==='SelectableCard')node.typeValue=label;
    if(frame==='5775:14183' && node.label==='Save changes')node.typeSave=true;
    if(parent?.name==='ListItem' && ['At tournament','Team Source','Tournament Source'].some(prefix=>textOf(parent).startsWith(prefix))) {
      const prefix=textOf(parent).split(' ').slice(0,2).join(' ');
      const group=prefix==='At tournament'?'at':prefix==='Team Source'?'teams':'tournaments';
      function summary(child:DesignNode) {
        if(child.children.length===1 && typeof child.children[0]==='string' && child.children[0]!==prefix)child.summaryScope=group;
        for(const nested of child.children)if(typeof nested!=='string')summary(nested);
      }
      // This runs on the row's content wrapper, which contains its label/value.
      summary(node);
    }
    for(const child of node.children)if(typeof child!=='string')visit(child,node,table);
  }
  visit(tree);
  if(choices.length)runtime.choices[scope]=choices;
  return tree;
}
