<script lang="ts">
 import './assignments.css';
 import { Checkbox } from '@highlanderrobotics/magnolia-svelte/v2';
 let {selected,onchange}:{selected:string[];onchange:(values:string[])=>void}=$props();
 let open=$state(false),query=$state('');
 const options=['Jack S','Collin C','Leo K'];
 function toggle(value:string){onchange(selected.includes(value)?selected.filter(item=>item!==value):[...selected,value]);}
</script>
<div class="scouter-picker">
 <label for="autoassign-scouters">Scouters</label>
 <div class="scouter-field">
  {#each selected as name}<button class="design-filter-token" aria-label={`Remove ${name}`} onclick={()=>toggle(name)}>{name} ×</button>{/each}
  <input id="autoassign-scouters" aria-label="Find scouters" placeholder="Add scouter" bind:value={query}/>
  <button class="scouter-arrow" aria-label="Choose scouters" aria-expanded={open} onclick={()=>open=!open}><img src="/design-assets/6dba2.svg" alt=""/></button>
 </div>
 {#if open}<div class="scouter-options" role="group" aria-label="Available scouters">{#each options.filter(name=>name.toLowerCase().includes(query.toLowerCase())) as name}<Checkbox label={name} checked={selected.includes(name)} onchange={()=>toggle(name)}/>{/each}</div>{/if}
</div>
