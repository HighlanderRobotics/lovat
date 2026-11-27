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
  if(/^5775:15(?:1\d\d|2[0-5]\d)$/.test(frame)) {
    for(const child of tree.children)if(typeof child!=='string' && child.tag==='p')child.style+=';left:50%;transform:translateX(-50%);text-align:center';
  }
  if(frame==='5775:14720') {
    const team=all.find(node=>node.id==='5775:14737');
    const source=all.find(node=>node.id==='5775:14740');
    if(team && source)team.children.push({tag:'div',id:'runtime:promote-analysts',name:'ListItem',style:source.style,children:[{tag:'p',name:'',style:'margin:0;font:inherit;color:#e6e6e6',children:['Promote Analysts']}]});
  }
}
