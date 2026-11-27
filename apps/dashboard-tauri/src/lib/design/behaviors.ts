import { textOf, type DesignNode } from './model.ts';

export function nodes(root:DesignNode):DesignNode[] {
  return [root,...root.children.flatMap(child=>typeof child==='string'?[]:nodes(child))];
}

/** Behavioral annotations for reference nodes that are not native controls. */
export function enhanceScene(tree:DesignNode, frame:string) {
  const all=nodes(tree);
  for(const node of all) {
    if(node.name==='Back'){node.backAction=true;for(const child of nodes(node).slice(1))child.passive=true;}
    if(node.name==='Stepper') {
      const key=`step:${node.id}`;
      node.stepperKey=key;
      for(const child of node.children)if(typeof child!=='string') {
        if(child.name==='minus' || child.name==='plus') {
          child.step={key,delta:child.name==='plus'?1:-1};
          child.actionLabel=`${child.name==='plus'?'Increase':'Decrease'} ${textOf(node)==='1'?'minimum':'maximum'} value`;
        }
        if(child.name==='Value')for(const value of nodes(child))if(value.tag==='p')value.numberKey=key;
      }
    }
  }
  for(const icon of all.filter(node=>node.name==='lucide/search')){icon.searchTrigger=true;icon.style+=';z-index:12';}
  if(['5775:17119','5775:17404','5775:17466'].includes(frame)){const body=all.find(node=>node.name==='Body');for(const row of body?.children??[])if(typeof row!=='string' && /^\d+\s*[⁃-]/.test(textOf(row)))row.rankRow=true;}
  for(const wrapper of all)if(wrapper.style.includes('grid') && wrapper.children.some(child=>typeof child!=='string'&&child.name==='Checkbox')){wrapper.searchRow=true;wrapper.style+=';display:flex;width:100%;grid-template-columns:none;grid-template-rows:none';for(const child of wrapper.children)if(typeof child!=='string'&&child.name==='Checkbox')child.style+=';width:100%';}
  const steppers=all.filter(node=>node.name==='Stepper');
  if(steppers.length===2)for(const [index,stepper] of steppers.entries())for(const child of nodes(stepper))if(child.step){
    child.step.minKey=`step:${steppers[0].id}`;child.step.maxKey=`step:${steppers[1].id}`;
    if(frame==='5775:14394')child.actionLabel=`${child.step.delta>0?'Increase':'Decrease'} ${index===0?'minimum':'maximum'} selections`;
  }
  if(frame==='5775:10287'){const board=all.find(node=>node.id==='5775:10290');if(board)board.teamAssignments=true;}
  if(frame==='5775:11203'){const picker=all.find(node=>node.name==='MultiSelect');if(picker)picker.scouterSelect=true;}
  const searchIcon=all.find(node=>node.name==='lucide/search');
  for(const bar of all.filter(node=>node.name==='TopBar'))if(searchIcon || ['5775:17119','5775:17404','5775:17466'].includes(frame)) {
    bar.searchBar=true;
    bar.searchPlaceholder=frame==='5775:15010'?'Search members':frame==='5775:15322'?'Search API keys':/5775:(14810|15277)/.test(frame)?'Search tournaments':frame==='5775:14879'?'Search users':'Search teams';
  }
  for(const list of all.filter(node=>node.name==='TabList' && /Questions Assignments Responses/.test(textOf(node)))) {
    for(const tab of list.children)if(typeof tab!=='string'){tab.formTabValue=textOf(tab);for(const child of nodes(tab).slice(1))child.passive=true;}
    const body=all.find(node=>node.children.includes(list));
    if(body){for(const child of body.children)if(typeof child!=='string' && child!==list)child.hideForResponses=true;
      body.children.push({tag:'div',name:'ResponsesSummary',style:'padding:24px 12px;display:flex;flex-direction:column;gap:8px;width:100%;color:#e6e6e6',responseSummary:true,children:[{tag:'p',name:'',style:'font:500 20px/28px Roboto,sans-serif',children:['Responses']},{tag:'p',name:'',style:'font:400 15px/22px Roboto,sans-serif;color:#b7b7b7',children:['45 responses']}]});
    }
  }
  // Collapse each heading's following siblings up to the next heading.
  for(const parent of all) {
    let section:string|undefined;
    for(const child of parent.children)if(typeof child!=='string') {
      if(child.name==='Header' && nodes(child).some(n=>n.src==='/design-assets/427e3.svg')) {
        section=`section:${frame}:${textOf(child)}`;child.collapseKey=section;
        for(const descendant of nodes(child).slice(1))descendant.passive=true;
      }else if(section)child.collapseGroup=section;
    }
    const chips=parent.children.find(child=>typeof child!=='string' && child.name==='Chips') as DesignNode|undefined;
    if(chips) {
      const group=`schedule:${frame}`;
      for(const chip of chips.children)if(typeof chip!=='string' && chip.name==='Chip') {
        chip.filter={group,value:textOf(chip)};
        for(const descendant of nodes(chip).slice(1))descendant.passive=true;
      }
      for(const row of parent.children.slice(parent.children.indexOf(chips)+1))if(typeof row!=='string' && textOf(row) && row.name!=='Header') {
        const cards=nodes(row).filter(n=>n.name.startsWith('Qualification '));
        for(const item of cards.length?cards:[row])item.filterItem={group,status:chips.children.some(c=>typeof c!=='string' && textOf(c)==='Team')?(/Alliance-match/.test(textOf(item))?'Alliance-match':/Team-match/.test(textOf(item))?'Team-match':'Team'):/Unassigned|No assignment/i.test(textOf(item))?'Unassigned':nodes(item).some(n=>n.name==='lucide/circle-check')?'Submitted':'Assigned'};
      }
    }
  }
  if(frame==='5775:16149'){
    const body=all.find(node=>node.name==='Body');if(body)body.style+=';padding-top:12px;gap:12px';
    const container=all.find(node=>node.id==='5775:16153');if(container)container.style+=';flex:0 0 auto;height:auto';
    const action=all.find(node=>node.id==='5775:16166');if(action){action.leftAction=true;action.control='button';action.label='Promote Analysts';action.variant='secondary';action.style+=';justify-content:flex-start;opacity:1';}
  }
  if(frame==='5775:10200')for(const node of all) {
    if(node.style.includes('height:39px') && node.style.includes('align-items:flex-end'))node.style+=';margin-left:auto;padding-right:0;min-width:96px;width:96px';
  }
  if(['5775:16503','5775:16811','5775:9807','5775:9936'].includes(frame))for(const node of all) {
    if(node.name==='Body')node.style+=';padding-left:16px;padding-right:16px';
    if(node.name==='MultiSelect')node.filterSelect=true;
    if(node.name.startsWith('Qualification ')){node.matchLevel='Quals';node.style+=';width:100%';}
    if(node.name.startsWith('Break '))node.style+=';width:100%';
  }
  if(['5775:9807','5775:9936'].includes(frame)){const hero=all.find(node=>node.name==='image 7');if(hero){hero.style+=';width:100%;height:100%';}}
  if(['5775:14305','5775:14394'].includes(frame)) {
    for(const card of all.filter(node=>node.name==='SelectableCard' && nodes(node).some(child=>child.name==='lucide/pencil'))) {
      const parent=all.find(node=>node.children.includes(card));if(!parent)continue;
      let target:DesignNode;
      if(parent.children.every(child=>child===card || typeof child!=='string' && child.control==='button' && child.variant==='danger')) {
        const outer=all.find(node=>node.children.includes(parent));
        target=outer?.children.length===1 && /height:53px/.test(outer.style)?outer:parent;
      }else {
        target={tag:'div',id:`runtime:option:${card.id}`,name:'OptionRow',style:'width:100%;position:relative;flex-shrink:0',children:[card]};
        parent.children.splice(parent.children.indexOf(card),1,target);
      }
      const title=nodes(card).find(child=>child.tag==='p');const label=textOf(title??card);
      target.swipeKey=`option:${frame}:${card.id}`;target.swipeLabel=label;target.children=[card];card.passive=true;
      if(title)title.optionTextKey=target.swipeKey;
      for(const child of nodes(card))if(child.name==='lucide/pencil')child.editOption={key:target.swipeKey,label};
    }
  }
  if(frame==='5775:14394'){const title=all.find(node=>node.control==='input' && node.value?.startsWith('Have they'));if(title){title.value='What parts of their robot have broken?';title.label='Question title';title.children=[title.value];}}
  if(['5775:15010','5775:15033','5775:15059','5775:15083'].includes(frame))tree.children.push({
    tag:'div',id:'runtime:members-promote',name:'Button',control:'button',variant:'primary',label:'Promote Analysts',leftAction:true,
    style:'height:44px;width:341px;border-radius:8px;background:#b59aff;color:#1f1f1f',children:['Promote Analysts'],
  });
  // Put dialogs above a real backdrop rather than blurring their own ancestors.
  const dialogs=all.filter(node=>node.name==='Dialog');
  if(dialogs.length) {
    for(const parent of all)parent.children=parent.children.filter(child=>typeof child==='string' || !dialogs.includes(child));
    tree.children.push({tag:'div',name:'DialogBackdrop',style:'position:fixed;inset:0;z-index:40;background:#0003;backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px)',children:[]});
    for(const dialog of dialogs){dialog.dialogSurface=true;dialog.style+=';translate:none;rotate:none;scale:none;right:auto;bottom:auto;margin:0;box-sizing:border-box';dialog.style+=';position:fixed;left:50%;top:calc((100% - var(--keyboard-inset,0px))/2);transform:translate(-50%,-50%);width:min(358px,calc(100% - 32px));max-height:calc(100% - var(--keyboard-inset,0px) - 48px);overflow-y:auto;z-index:50';tree.children.push(dialog);}
  }
  if(/^5775:15(?:1\d\d|2[0-5]\d)$/.test(frame)) {
    for(const node of all)if(node.name==='TopBar'){node.profileBar=true;node.profileEdit=nodes(node).find(child=>child.name==='lucide/square-pen');node.profileEditIcon=node.profileEdit?nodes(node.profileEdit).find(child=>child.src)?.src:undefined;node.style+=';width:393px;height:44px;left:0;padding:0 4px;box-sizing:border-box';for(const child of node.children)if(typeof child!=='string' && child.name==='Bar')child.style+=';width:100%;height:44px;align-items:center';}
    for(const child of tree.children)if(typeof child!=='string') {
      if(child.tag==='p'){child.style=child.style.replace(/top:(\d+)px/,(_,top)=>`top:${Number(top)+34}px`);child.style+=';left:50%;transform:translateX(-50%);text-align:center;z-index:2';}
      if(child.name==='Avatar')child.style+=';left:calc(50% - 50px);top:72px;z-index:2';
    }
  }
}
