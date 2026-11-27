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
  if(frame==='5775:10200')for(const node of all) {
    if(node.style.includes('height:39px') && node.style.includes('align-items:flex-end'))node.style+=';margin-left:auto;padding-right:0;min-width:96px;width:96px';
  }
  if(['5775:16503','5775:16811','5775:9807','5775:9936'].includes(frame))for(const node of all) {
    if(node.name==='Body')node.style+=';padding-left:16px;padding-right:16px';
    if(node.name==='MultiSelect')node.filterSelect=true;
    if(node.name.startsWith('Qualification ')){node.matchLevel='Quals';node.style+=';width:100%';}
    if(node.name.startsWith('Break '))node.style+=';width:100%';
  }
  if(['5775:14305','5775:14394'].includes(frame)) {
    for(const row of all) {
      const card=row.children.find(child=>typeof child!=='string' && child.name==='SelectableCard' && nodes(child).some(n=>n.name==='lucide/pencil')) as DesignNode|undefined;
      if(!card)continue;
      const parent=all.find(node=>node.children.includes(row));
      const target=parent?.children.length===1 && /height:53px/.test(parent.style)?parent:row;
      target.swipeKey=`option:${frame}:${textOf(card)}`;target.swipeLabel=textOf(card).split(' ').slice(0,3).join(' ');
      target.children=[card];card.passive=true;
    }
  }
  // Put dialogs above a real backdrop rather than blurring their own ancestors.
  const dialogs=all.filter(node=>node.name==='Dialog');
  if(dialogs.length) {
    for(const parent of all)parent.children=parent.children.filter(child=>typeof child==='string' || !dialogs.includes(child));
    tree.children.push({tag:'div',name:'DialogBackdrop',style:'position:fixed;inset:0;z-index:40;background:#0003;backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px)',children:[]});
    for(const dialog of dialogs){dialog.dialogSurface=true;dialog.style+=';position:fixed;left:50%;top:calc((100% - var(--keyboard-inset,0px))/2);transform:translate(-50%,-50%);width:358px;max-height:calc(100% - var(--keyboard-inset,0px) - 48px);overflow-y:auto;z-index:50';tree.children.push(dialog);}
  }
  if(/^5775:15(?:1\d\d|2[0-5]\d)$/.test(frame)) {
    for(const child of tree.children)if(typeof child!=='string') {
      if(child.tag==='p'){child.style=child.style.replace(/top:(\d+)px/,(_,top)=>`top:${Number(top)+34}px`);child.style+=';left:50%;transform:translateX(-50%);text-align:center;z-index:2';}
      if(child.name==='Avatar')child.style+=';left:calc(50% - 50px);top:72px;z-index:2';
    }
  }
  if(frame==='5775:14720') {
    const team=all.find(node=>node.id==='5775:14737');
    const source=all.find(node=>node.id==='5775:14740');
    if(team && source)team.children.push({tag:'div',id:'runtime:promote-analysts',name:'ListItem',style:source.style,children:[{tag:'p',name:'',style:'margin:0;font:inherit;color:#e6e6e6',children:['Promote Analysts']}]});
  }
}
