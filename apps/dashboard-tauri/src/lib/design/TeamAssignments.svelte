<script lang="ts">
 import './assignments.css';
 import type { AssignmentTeam } from './assignments.ts';
 let {teams,people,onmove,onadd}:{people:string[];teams:AssignmentTeam[];onmove:(id:string,assignee:string)=>void;onadd:()=>void}=$props();
 const scouters=$derived([...new Set(['Jack S','Collin C',...people,...teams.map(team=>team.assignee).filter(name=>name!=='Unassigned')]),'Unassigned']);
 let dragging=$state<AssignmentTeam>(),point=$state<{x:number;y:number}>();
 function start(event:PointerEvent,team:AssignmentTeam){
   event.preventDefault();dragging=team;updatePoint(event);event.currentTarget instanceof HTMLElement && event.currentTarget.setPointerCapture(event.pointerId);
 }
 function updatePoint(event:PointerEvent){const box=(event.currentTarget as HTMLElement).closest('.design-frame')?.getBoundingClientRect();const scale=box?box.width/393:1;point={x:(event.clientX-(box?.left??0))/scale,y:(event.clientY-(box?.top??0))/scale};}
 function move(event:PointerEvent){
   if(!dragging)return;updatePoint(event);
   const body=(event.currentTarget as HTMLElement).closest('[data-layout-role="body"]');
   if(body){const box=body.getBoundingClientRect();if(event.clientY>box.bottom-36)body.scrollTop+=12;if(event.clientY<box.top+36)body.scrollTop-=12;}
 }
 function end(event:PointerEvent){
   const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-assignee]');
   if(dragging && target?.dataset.assignee)onmove(dragging.id,target.dataset.assignee);
   dragging=undefined;point=undefined;
 }
 function drop(event:DragEvent,assignee:string){event.preventDefault();const id=event.dataTransfer?.getData('text/plain');if(id)onmove(id,assignee);}
</script>
<div class="assignment-board">
 <button class="assignment-add" onclick={onadd}>＋ Add a scouter</button>
 {#each scouters as assignee}
  <section class="assignment-zone" data-assignee={assignee} aria-label={`${assignee} assignments`} ondragover={(event)=>event.preventDefault()} ondrop={(event)=>drop(event,assignee)}>
   <header><strong>{assignee}</strong><span>{teams.filter(team=>team.assignee===assignee).length} teams{assignee==='Unassigned'?'':' assigned'}</span></header>
   <div class="assignment-grid" role="list">
    {#each teams.filter(team=>team.assignee===assignee) as team(team.id)}
     <div class="assignment-team" class:dragging={dragging?.id===team.id} role="listitem" draggable="true" ondragstart={(event)=>{event.dataTransfer?.setData('text/plain',team.id);if(event.dataTransfer)event.dataTransfer.effectAllowed='move';}}>
      {#if team.logo}<img src={team.logo} alt=""/>{/if}
      <span class="assignment-team-name"><strong>{team.number}</strong><span>{team.name}</span></span>
      <button class="assignment-grip" aria-label={`Drag ${team.number} ${team.name}`} onpointerdown={(event)=>start(event,team)} onpointermove={move} onpointerup={end} onpointercancel={()=>{dragging=undefined;point=undefined;}}>⠿</button>
      <label class="assignment-move"><span class="sr-only">Assign {team.number} {team.name}</span><select aria-label={`Assign ${team.number} ${team.name}`} value={team.assignee} onchange={(event)=>onmove(team.id,event.currentTarget.value)}>{#each scouters as person}<option value={person}>{person}</option>{/each}</select></label>
     </div>
    {/each}
    {#if !teams.some(team=>team.assignee===assignee)}<p class="assignment-empty">Drop a team here</p>{/if}
   </div>
  </section>
 {/each}
</div>
{#if dragging && point}<div class="assignment-ghost" style={`left:${point.x+10}px;top:${point.y-24}px`}>{dragging.number} · {dragging.name}</div>{/if}
