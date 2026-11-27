<script lang="ts">
  import type { Snippet } from 'svelte';
  let {label,children,ondelete}:{label:string;children:Snippet;ondelete:()=>void}=$props();
  let offset=$state(0);
  let dragging=$state(false);
  let startX=0,startY=0,initial=0;
  function start(event:PointerEvent){if(event.button!==0)return;startX=event.clientX;startY=event.clientY;initial=offset;dragging=false;}
  function move(event:PointerEvent){
    if(!event.buttons && event.pointerType==='mouse')return;
    const dx=event.clientX-startX,dy=event.clientY-startY;
    if(!dragging && Math.abs(dx)>10 && Math.abs(dx)>Math.abs(dy)){dragging=true;event.currentTarget instanceof HTMLElement && event.currentTarget.setPointerCapture(event.pointerId);}
    if(dragging){event.preventDefault();offset=Math.max(0,Math.min(76,initial-dx));}
  }
  function end(){if(dragging)offset=offset>32?76:0;}
</script>
<div class="design-swipe" role="group" aria-label={`${label} option`} onpointerdown={start} onpointermove={move} onpointerup={end} onpointercancel={()=>{offset=0;dragging=false;}}>
  <button class="design-swipe-delete" aria-label={`Delete ${label} option`} tabindex={offset?0:-1} onclick={ondelete}>Delete</button>
  <div class="design-swipe-front" style={`transform:translateX(-${offset}px);transition:${dragging?'none':'transform 160ms ease-out'}`}>
    {@render children()}
  </div>
  <button class="design-swipe-accessible" aria-label={`Show delete action for ${label}`} onclick={()=>offset=76}>Show delete</button>
</div>
