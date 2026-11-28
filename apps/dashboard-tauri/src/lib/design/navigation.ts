import type { Direction } from './pageMotion.ts';
import { searchBase } from './presentation.ts';

const tabs = [
 ['5775:9807','5775:9936'],
 ['5775:17119','5775:17404','5775:17466','5775:17528','5775:17593','5775:17658'],
 ['5775:10069'],
 ['5775:17181','5775:17374','5775:17384','5775:17394'],
 ['5775:17278'],
];

export function navbarLabel(frame:string):string|undefined {const index=tabs.findIndex(ids=>ids.includes(frame));return ['Home','Scouting','Forms','Picklists','Strategy'][index];}

export function navbarDirection(from:string,to:string):Direction {
 const current=tabs.findIndex(ids=>ids.includes(from));
 const target=tabs.findIndex(ids=>ids.includes(to));
 return current>=0 && target>=0 && target<current?'back':'forward';
}

/** Revisit an existing browser entry instead of adding an A → B → A loop. */
export function revisitDelta(history:string[],target:string):number {
 const key=searchBase[target]??target;
 const index=history.findLastIndex(id=>(searchBase[id]??id)===key);
 return index<0?0:index-history.length;
}
