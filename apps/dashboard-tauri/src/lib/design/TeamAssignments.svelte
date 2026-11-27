<script lang="ts">
 import './assignments.css';
 import { slide } from 'svelte/transition';
 import type { AssignmentTeam } from './assignments.ts';
 let {teams,people,onmove,onadd}:{people:string[];teams:AssignmentTeam[];onmove:(id:string,assignee:string)=>void;onadd:(name:string)=>void}=$props();
 const scouters=$derived([...new Set(['Jack S','Collin C',...people,...teams.map(team=>team.assignee).filter(name=>name!=='Unassigned')]),'Unassigned']);
 let adding=$state(false),hovering=$state<string>(),nativeDragging=$state(false);
 function clear(){dragging=undefined;point=undefined;hovering=undefined;nativeDragging=false;}
 function hover(event:PointerEvent){hovering=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-assignee]')?.dataset.assignee;}
 let dragging=$state<AssignmentTeam>(),point=$state<{x:number;y:number}>();
 function start(event:PointerEvent,team:AssignmentTeam){
   event.preventDefault();dragging=team;updatePoint(event);event.currentTarget instanceof HTMLElement && event.currentTarget.setPointerCapture(event.pointerId);
 }
 function updatePoint(event:PointerEvent){const box=(event.currentTarget as HTMLElement).closest('.design-frame')?.getBoundingClientRect();const scale=box?box.width/393:1;point={x:(event.clientX-(box?.left??0))/scale,y:(event.clientY-(box?.top??0))/scale};}
 function move(event:PointerEvent){
   if(!dragging)return;updatePoint(event);hover(event);
   const body=(event.currentTarget as HTMLElement).closest('[data-layout-role="body"]');
   if(body){const box=body.getBoundingClientRect();if(event.clientY>box.bottom-36)body.scrollTop+=12;if(event.clientY<box.top+36)body.scrollTop-=12;}
 }
 function end(event:PointerEvent){
   const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-assignee]');
   if(dragging && target?.dataset.assignee)onmove(dragging.id,target.dataset.assignee);
   clear();
 }
 function drop(event:DragEvent,assignee:string){event.preventDefault();const id=event.dataTransfer?.getData('text/plain');if(id)onmove(id,assignee);clear();}
</script>
<div class="assignment-board" class:is-dragging={!!dragging || nativeDragging}>
 <button class="assignment-add" aria-expanded={adding} onclick={()=>adding=!adding}>＋ Add scouter</button>
 {#if adding}<div class="assignment-scouter-options" role="group" aria-label="Add scouter">{#each ['Jack S','Collin C','Leo K','Ted E','Cassie C'].filter(name=>!scouters.includes(name)) as name}<button onclick={()=>{onadd(name);adding=false;}}>{name}</button>{/each}</div>{/if}
 {#each scouters as assignee}
  <section class="assignment-zone" class:drop-target={hovering===assignee && dragging?.assignee!==assignee} data-assignee={assignee} aria-label={`${assignee} assignments`} ondragover={(event)=>{event.preventDefault();hovering=assignee;}} ondragleave={(event)=>{if(!event.currentTarget.contains(event.relatedTarget as Node))hovering=undefined;}} ondrop={(event)=>drop(event,assignee)}>
   <header><strong>{assignee}</strong><span>{teams.filter(team=>team.assignee===assignee).length} teams{assignee==='Unassigned'?'':' assigned'}</span></header>
   <div class="assignment-grid" role="list">
    {#each teams.filter(team=>team.assignee===assignee) as team(team.id)}
     <div class="assignment-team" class:dragging={dragging?.id===team.id} role="listitem" draggable="true" ondragend={clear} ondragstart={(event)=>{nativeDragging=true;dragging=team;event.dataTransfer?.setData('text/plain',team.id);if(event.dataTransfer)event.dataTransfer.effectAllowed='move';}}>
      {#if team.logo}<img src={team.logo} alt=""/>{/if}
      <span class="assignment-team-name"><strong>{team.number}</strong><span>{team.name}</span></span>
      <button class="assignment-grip" aria-label={`Drag ${team.number} ${team.name}`} onpointerdown={(event)=>start(event,team)} onpointermove={move} onpointerup={end} onpointercancel={clear}>⠿</button>
      <label class="assignment-move"><span class="sr-only">Assign {team.number} {team.name}</span><select aria-label={`Assign ${team.number} ${team.name}`} value={team.assignee} onchange={(event)=>onmove(team.id,event.currentTarget.value)}>{#each scouters as person}<option value={person}>{person}</option>{/each}</select></label>
     </div>
    {/each}
    {#if hovering===assignee && dragging?.assignee!==assignee}<div class="assignment-landing" transition:slide={{duration:140}} role="status">Drop here to assign to {assignee}</div>{/if}
    {#if !teams.some(team=>team.assignee===assignee)}<p class="assignment-empty">Drop a team here</p>{/if}
   </div>
  </section>
 {/each}
</div>
{#if dragging && point}<div class="assignment-ghost" style={`left:${point.x+10}px;top:${point.y-24}px`}>{dragging.number} · {dragging.name}</div>{/if}
