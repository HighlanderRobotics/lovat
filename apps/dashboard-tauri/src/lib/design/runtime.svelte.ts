import { apiKeysFromScene, type ApiKeyRecord } from './apiKeys.ts';
import { teamsFromScene, type AssignmentTeam } from './assignments.ts';
import { enhanceScene, nodes } from './behaviors.ts';
import { textOf, type DesignNode } from './model.ts';

export const DESIGN_RUNTIME = Symbol('design-runtime');
export type Choice = { kind: 'checkbox' | 'radio' | 'switch'; key: string; group: string; initial: boolean; label: string; all?: boolean };
const selectorScopes: Record<string, string> = {
  '17119':'rankings','17404':'rankings','17466':'rankings','17528':'rankings','17593':'rankings','17658':'rankings',
  '15010':'members','15033':'members','15059':'members','15083':'members',
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
  apiRecords = $state<ApiKeyRecord[]>();
  apiSelected = $state<Record<string,boolean>>({});
  apiLastAffected = $state(0);
  private apiSequence=0;
  assignmentItems = $state<AssignmentTeam[]>([]);
  selectedScouters = $state<string[]>(['Jack S','Collin C']);
  optionLabels = $state<Record<string,string>>({});
  editingOption = $state<{key:string;label:string}>();
  searchOpen = $state<Record<string,boolean>>({});
  collapsed = $state<Record<string,boolean>>({});
  filters = $state<Record<string,string>>({});
  deleted = $state<Record<string,boolean>>({});
  matchLevels = $state<string[]>(['Quals','Elims']);
  formTab = $state<string>();
  formDirty = $state(false);
  numbers = $state<Record<string,number>>({});
  scrolls:Record<string,number>={};
  values = $state<Record<string,string>>({});
  checks = $state<Record<string,boolean>>({});
  groups = $state<Record<string,string>>({});
  summaries = $state<Record<string,string>>({});
  questionType = $state('Rating');
  typeDirty = $state(false);
  // Scene IDs differ across search/confirmation states; semantic keys retain edits.
  choices = $state<Record<string, {key:string; label:string; initial:boolean}[]>>({});
  scope(frame:string) { return selectorScopes[frame.split(':').at(-1)!] ?? frame; }
  onSelectionChange?: (scope:string)=>void;
  count(scope:string) { if(scope==='api-keys' && this.apiRecords)return this.apiRecords.filter(record=>this.apiSelected[record.id]).length;return (this.choices[scope]??[]).filter(item=>this.checks[item.key]??item.initial).length; }
  checked(choice:Choice):boolean { return choice.all ? this.count(choice.group)===(this.choices[choice.group]?.length??0) : this.checks[choice.key] ?? choice.initial; }
  setChecked(choice:Choice, checked:boolean) { if(choice.kind==='switch')this.formDirty=true; if(choice.all)this.selectAll(choice.group,false,checked);else this.checks[choice.key]=checked;this.onSelectionChange?.(choice.group); }
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
  selectKey(id:string,checked:boolean){this.apiSelected[id]=checked;}
  selectAllKeys(checked:boolean){for(const record of this.apiRecords??[])this.apiSelected[record.id]=checked;}
  createKey(name:string){this.apiRecords=[...(this.apiRecords??[]),{id:`local:${++this.apiSequence}`,name:name.trim()||'New key',lastUsed:'Never',requests:'0'}];this.apiSelected={};this.values['search:api-keys']='';this.searchOpen['api-keys']=false;}
  renameKey(name:string){this.apiRecords=(this.apiRecords??[]).map(record=>this.apiSelected[record.id]?{...record,name:name.trim()||record.name}:record);}
  deleteKeys(){this.apiLastAffected=this.count('api-keys');this.apiRecords=(this.apiRecords??[]).filter(record=>!this.apiSelected[record.id]);this.apiSelected={};}
  moveTeam(id:string,assignee:string){this.assignmentItems=this.assignmentItems.map(team=>team.id===id?{...team,assignee}:team);this.formDirty=true;}
  autoAssign(){
    const limit=Math.max(1,Number(this.values['field:5775:11380']??10));
    const people=this.selectedScouters;
    this.assignmentItems=this.assignmentItems.map((team,index)=>({...team,assignee:people.length && index<limit*people.length?people[index%people.length]:'Unassigned'}));
    this.formDirty=true;
  }
  apply(scope:string) {
    const items=this.choices[scope]??[];
    const selected=scope==='at'?items.filter(item=>item.key===this.groups.at):items.filter(item=>this.checks[item.key]??item.initial);
    this.summaries[scope]=selected.length===items.length && scope!=='at'?'All':selected.length===1?selected[0].label:selected.length?`${selected.length} ${scope==='teams'?'teams':'tournaments'}`:'None';
  }
}

/** Add behavior to translated design data without modifying reference geometry. */
export function prepareScene(source:DesignNode, frame:string, runtime:DesignRuntime):DesignNode {
  const optionType=Object.entries(optionScreens).find(([,screen])=>screen===frame)?.[0];
  if(optionType)runtime.questionType=optionType;
  if(['5775:10287','5775:11203'].includes(frame) && !runtime.assignmentItems.length)runtime.assignmentItems=teamsFromScene(source);
  if(runtime.scope(frame)==='api-keys' && !runtime.apiRecords){runtime.apiRecords=apiKeysFromScene(source);for(const record of runtime.apiRecords)runtime.apiSelected[record.id]=!!record.initialSelected;}
  const tree=structuredClone(source);
  enhanceScene(tree,frame);
  if(nodes(tree).some(node=>node.formTabValue))runtime.formTab ??= ['5775:10144','5775:14466','5775:14514','5775:14562','5775:14630'].includes(frame)?'Questions':'Assignments';
  for(const node of nodes(tree)){if(node.numberKey)runtime.numbers[node.numberKey] ??= Number(textOf(node));if(node.filter)runtime.filters[node.filter.group] ??= node.filter.value;}
  const scope=runtime.scope(frame);
  if(scope==='api-keys')for(const node of nodes(tree))if(node.name==='Table'){node.apiTable=true;node.style+=';width:100%;max-width:100%';}
  let index=0;
  const choices: {key:string;label:string;initial:boolean}[]=[];
  function visit(node:DesignNode, parent?:DesignNode, table?:DesignNode) {
    if(parent && !parent.style.includes('flex-direction:column') && node.style.includes('flex:1 0 0'))node.inlineFlex=true;
    const label=textOf(node);
    if(node.name==='TableRow' || node.name==='TableHeader')table=node;
    if(node.name==='Input' && nodes(node).some(child=>child.control==='input'))node.style+=';flex:1 1 70px;min-width:70px';
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
      const rowName=table?textOf(nodes(table).find(child=>child.name==='Name cell')??table):'';
      const key=all?`${scope}:all`:scope==='api-keys'?`${scope}:${rowName}`:kind==='switch'?'question:required':`${scope}:${index++}`;
      const initial=kind==='switch'?markup.includes('/893af.svg'):markup.includes('/554ed.svg') || markup.includes('/2e4a4.svg');
      node.choice={kind,key,group:scope,initial,all,label:label || (all?'Select all keys':`Select ${textOf(table??node)}`)};
      if(!all)choices.push({key,label,initial});
      if(scope==='api-keys' && !all){runtime.checks[key] ??= initial;if(table)table.rowChoiceKey=key;}
      if(kind==='radio' && initial)runtime.groups[scope] ??= key;
    }
    node.searchScope=scope;
    if(node.searchBar)node.searchPlaceholder=scope==='at'||scope==='tournaments'?'Search tournaments':scope==='members'?'Search members':scope==='api-keys'?'Search API keys':scope==='analysts'?'Search users':'Search teams';
    node.searchable=!!node.searchRow || !!node.rankRow || ['ListItem','TableRow','SelectableCard'].includes(node.name) || node.id==='5494:3064' || node.name==='Checkbox' && !table && !parent?.searchRow && !!label || node.name.startsWith('Qualification ');
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
  if(choices.length && (!runtime.choices[scope] || scope==='api-keys' && !nodes(tree).some(node=>node.dialogSurface))){runtime.choices[scope]=choices;for(const item of choices)runtime.checks[item.key] ??= item.initial;}
  return tree;
}
