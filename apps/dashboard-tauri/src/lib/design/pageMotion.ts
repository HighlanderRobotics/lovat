export type Direction='forward'|'back';

/** Slide only page content. The persistent dock is never cloned or faded. */
export class PageMotion {
  private snapshot?:HTMLElement;
  private animations:Animation[]=[];
  private canvas?:HTMLElement;
  private frame?:HTMLElement;
  private host?:HTMLElement;
  private direction:Direction='forward';
  finish(){
    this.animations.forEach(animation=>animation.cancel());this.animations=[];
    this.snapshot?.remove();this.snapshot=undefined;
    this.frame?.style.removeProperty('--live-visibility');
    if(this.canvas){this.canvas.style.removeProperty('z-index');this.canvas.style.removeProperty('will-change');}
    if(this.host)this.host.style.removeProperty('z-index');
  }
  prepare(canvas:HTMLElement|undefined,host:HTMLElement|undefined,direction:Direction){
    this.finish();if(!canvas||!host||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    this.frame=canvas.parentElement!;this.host=host;this.direction=direction;
    const snapshot=canvas.cloneNode(true) as HTMLElement;
    snapshot.inert=true;snapshot.setAttribute('aria-hidden','true');
    for(const element of [snapshot,...snapshot.querySelectorAll('*')]){
      for(const name of ['id','data-figma-node','data-layout-role','data-frame','data-design-name'])element.removeAttribute(name);
      if(element instanceof HTMLInputElement && element.name)element.name=`transition:${element.name}`;
    }
    snapshot.style.visibility='visible';snapshot.style.transform='translateX(0)';
    host.style.zIndex=direction==='back'?'3':'1';host.append(snapshot);this.snapshot=snapshot;
    this.frame.style.setProperty('--live-visibility','hidden');
  }
  play(canvas:HTMLElement|undefined){
    if(!this.snapshot||!canvas){this.finish();return;}
    this.canvas=canvas;canvas.style.zIndex='2';canvas.style.willChange='transform';
    const backward=this.direction==='back';
    const options:KeyframeAnimationOptions={duration:170,easing:'cubic-bezier(.2,.8,.2,1)',fill:'both'};
    this.animations=[
      canvas.animate([{transform:`translateX(${backward?-25:100}%)`},{transform:'translateX(0)'}],options),
      this.snapshot.animate([{transform:'translateX(0)'},{transform:`translateX(${backward?100:-25}%)`}],options),
    ];
    this.frame!.dataset.navigationDirection=this.direction;
    this.frame?.style.removeProperty('--live-visibility');
    const current=this.animations;
    void Promise.all(current.map(animation=>animation.finished)).then(()=>{if(this.animations===current)this.finish();}).catch(()=>{});
  }
}
