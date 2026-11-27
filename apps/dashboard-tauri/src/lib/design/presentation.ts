import type { DesignNode } from './model.ts';
import type { ScreenLayout } from './layout.ts';
export interface Dock { key:string;node:DesignNode }
export interface Presentation { page:DesignNode;docks:Dock[] }

/** Docked controls stay outside page remounts and page animations. */
export function presentation(scene:DesignNode, layout:ScreenLayout, reference=false):Presentation {
  if(reference)return {page:scene,docks:[]};
  const page=structuredClone(scene),docks:Dock[]=[];
  const counts={footer:0,nav:0};
  function extract(node:DesignNode){
    node.children=node.children.filter(child=>{
      if(typeof child==='string')return true;
      const kind=layout[child.id??'']?.kind;
      if(kind==='footer'||kind==='nav'){docks.push({key:`${kind}:${counts[kind]++}`,node:child});return false;}
      extract(child);return true;
    });
  }
  extract(page);return {page,docks};
}

export const searchBase:Record<string,string>={
  '5775:9936':'5775:9807','5775:16335':'5775:14810',
  '5775:16407':'5775:15277','5775:16455':'5775:15945',
  '5775:15033':'5775:15010','5775:17528':'5775:17119',
  '5775:17593':'5775:17404','5775:17658':'5775:17466',
};
export function isSearchChange(from:string,to:string){return (searchBase[from]??from)===(searchBase[to]??to);}
