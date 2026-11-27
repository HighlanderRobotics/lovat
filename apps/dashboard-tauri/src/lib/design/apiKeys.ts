import { textOf, type DesignNode } from './model.ts';
import { nodes } from './behaviors.ts';
export interface ApiKeyRecord {id:string;name:string;lastUsed:string;requests:string;initialSelected?:boolean}
export function apiKeysFromScene(scene:DesignNode):ApiKeyRecord[]{
 return nodes(scene).filter(node=>node.name==='TableRow').map((row,index)=>{
  const cells=row.children.filter((child):child is DesignNode=>typeof child!=='string');
  const name=textOf(cells.find(cell=>cell.name==='Name cell')??cells[1]);
  return {id:`key:${name||index}`,name,lastUsed:textOf(cells[2]),requests:textOf(cells[3]),initialSelected:nodes(row).some(node=>node.src==='/design-assets/554ed.svg')};
 });
}
