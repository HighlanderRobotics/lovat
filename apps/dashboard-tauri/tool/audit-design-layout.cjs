const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root,'src/lib/design/manifest.json')));
const all = [];
function visit(node, ancestors=[]) {
  if (typeof node === 'string') return;
  all.push({node,ancestors});
  for (const child of node.children) visit(child,[...ancestors,node]);
}
function hasButton(node) {
  return typeof node !== 'string' && (node.control === 'button' || node.children.some(hasButton));
}
(async()=>{
  const browser=await chromium.launch();
  const page=await browser.newPage({viewport:{width:393,height:852}});
  const layouts={};
  for (const frame of manifest) {
    all.length=0;
    const tree=JSON.parse(fs.readFileSync(path.join(root,`src/lib/design/scenes/${frame.id.replace(':','-')}.json`)));
    visit(tree);
    await page.goto(`http://127.0.0.1:1430/design/${frame.id.replace(':','-')}?reference=1`);
    await page.locator('.design-frame [data-figma-node]').first().waitFor();
    await page.evaluate(()=>document.fonts.ready);
    const bounds=await page.locator('.design-frame [data-figma-node]').evaluateAll(elements=>{
      const origin=document.querySelector('.design-frame').getBoundingClientRect();
      const values={};
      for (const element of elements) {
        const id=element.getAttribute('data-figma-node');
        if (values[id]) continue;
        const r=element.getBoundingClientRect();
        values[id]={x:r.x-origin.x,y:r.y-origin.y,w:r.width,h:r.height};
      }
      return values;
    });
    const bodies=all.filter(x=>x.node.name==='Body'&&bounds[x.node.id]).sort((a,b)=>bounds[b.node.id].h*bounds[b.node.id].w-bounds[a.node.id].h*bounds[a.node.id].w);
    const nav=all.find(x=>x.node.name==='TabBar');
    const header=all.find(x=>x.node.name==='TopBar');
    const system=all.find(x=>/^status bar$/i.test(x.node.name));
    const inset=system&&bounds[system.node.id]?.y===0?bounds[system.node.id].h:0;
    const contains=(entry,target)=>target&&(entry.node===target.node||all.find(x=>x.node===target.node)?.ancestors.includes(entry.node));
    const fallback=all.filter(x=>x.node!==tree&&x.node.id&&bounds[x.node.id]?.y>=(header?bounds[header.node.id].y+bounds[header.node.id].h-1:0)&&bounds[x.node.id]?.h>180&&!contains(x,header)&&!contains(x,nav)&&x.node.children.filter(c=>typeof c!=='string').length>1).sort((a,b)=>bounds[b.node.id].w*bounds[b.node.id].h-bounds[a.node.id].w*bounds[a.node.id].h)[0];
    const body=bodies[0]??fallback;
    const footer=body?[...body.node.children].reverse().find(n=>typeof n!=='string'&&n.id&&hasButton(n)&&bounds[n.id]&&bounds[n.id].y>=frame.height*.65&&frame.height-bounds[n.id].y-bounds[n.id].h<=120):undefined;
    const footers=footer?[footer]:!body?all.filter(x=>x.node.control==='button'&&x.node.id&&bounds[x.node.id]?.y>=frame.height*.7&&frame.height-bounds[x.node.id].y-bounds[x.node.id].h<=120&&!x.ancestors.some(a=>/Popover|Dialog/.test(a.name))).map(x=>x.node):[];
    const roles={};
    const box=(node,kind)=>{
      const entry=all.find(x=>x.node===node);
      const block=[...entry.ancestors].reverse().find(n=>n.id!==body?.node.id&&/(?:^|;)(?:filter|transform|translate):/.test(n.style));
      const b=bounds[node.id];
      roles[node.id]={kind,...b,y:b.y-inset,blockX:bounds[block?.id]?.x??0,blockY:Math.max(0,(bounds[block?.id]?.y??0)-inset)};
    };
    if(body)box(body.node,'body');
    if(system)roles[system.node.id]={kind:'system'};
    if(header)box(header.node,'header');
    if(frame.id==='5775:10069'){const search=all.find(x=>x.node.name==='Search wrap');if(search)box(search.node,'header');}
    if(nav)box(nav.node,'nav');
    for(const [i,item] of footers.entries()){box(item,'footer');roles[item.id].bottom=Math.max(0,frame.height-bounds[item.id].y-bounds[item.id].h);roles[item.id].transitionName='footer-'+i;}
    if(body)roles[body.node.id].bottom=footer?bounds[footer.id].h+roles[footer.id].bottom:nav?bounds[nav.node.id].h:0;
    for (const {node,ancestors} of all) {
      if (!node.id||roles[node.id]||!body||!ancestors.includes(body.node)||node.name==='Text'||node.name==='SelectableCard') continue;
      if (footer&&(node===footer||ancestors.includes(footer)))continue;
      if (node.style.includes('flex-direction:column')&&(node.style.includes('flex:1 0 0')||/height:(?:[3-9]\d\d|\d{4})px/.test(node.style)))roles[node.id]={kind:'flow'};
    }
    layouts[frame.id]=roles;
  }
  fs.writeFileSync(path.join(root,'src/lib/design/layouts.json'),JSON.stringify(layouts,null,2)+'\n');
  console.log({screens:Object.keys(layouts).length,footers:Object.values(layouts).filter(r=>Object.values(r).some(x=>x.kind==='footer')).length});
  await browser.close();
})();
