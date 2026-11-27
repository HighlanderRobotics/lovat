import { frameStyle } from './model.ts';
export interface LayoutAnchor {
  kind:'body'|'header'|'footer'|'nav'|'flow'|'system';
  x?:number; y?:number; w?:number; h?:number;
  transitionName?:string; blockX?:number; blockY?:number; bottom?:number;
}
export type ScreenLayout = Record<string,LayoutAnchor>;

export function bodyFilter(style:string):string|undefined {
  return /(?:^|;)filter:([^;]+)/.exec(style)?.[1];
}

export function anchoredStyle(style:string, anchor:LayoutAnchor|undefined, delta:number,
  reference=false, root=false, filter?:string):string {
  if(reference)return style;
  let result=frameStyle(style,delta);
  if(root)result+=';overflow:visible';
  if(anchor){
    const left=(anchor.x??0)-(anchor.blockX??0);
    const top=(anchor.y??0)-(anchor.blockY??0);
    if(anchor.kind==='system')return result+';display:none';
    if(anchor.kind==='flow')result+=';height:auto;flex:0 0 auto;min-height:0;overflow:visible';
    else if(anchor.kind==='body'){
      result=result.replace(/(^|;)filter:[^;]+/g,'$1filter:none');
      result+=`;position:fixed;left:${left}px;top:${top}px;bottom:${anchor.bottom??0}px;width:${anchor.w}px;height:auto;min-height:0;overflow-y:auto;overflow-x:clip;justify-content:flex-start;scrollbar-width:none`;
    }else if(anchor.kind==='header')result+=`;position:fixed;left:${left}px;top:${top}px;width:${anchor.w}px;height:${anchor.h}px;z-index:10`;
    else result+=`;position:fixed;left:${left}px;top:auto;bottom:${anchor.kind==='nav'?0:anchor.bottom??26}px;width:${anchor.w}px;height:${anchor.h}px;z-index:10`;
  }
  if(anchor && ['body','header','footer','nav'].includes(anchor.kind))result+=`;view-transition-name:${anchor.transitionName??({'body':'page-content','header':'page-header','nav':'bottom-navigation'} as Record<string,string>)[anchor.kind]??'page-footer'}`;
  if(filter)result+=`;filter:${filter}`;
  return result;
}
