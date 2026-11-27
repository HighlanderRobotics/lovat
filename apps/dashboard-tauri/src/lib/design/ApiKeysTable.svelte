<script lang="ts">
 import {Checkbox} from '@highlanderrobotics/magnolia-svelte/v2';
 import type {ApiKeyRecord} from './apiKeys.ts';
 import './apiKeys.css';
 let {records,selected,query,onselect,onall}:{records:ApiKeyRecord[];selected:Record<string,boolean>;query:string;onselect:(id:string,checked:boolean)=>void;onall:(checked:boolean)=>void}=$props();
 const filtered=$derived(records.filter(record=>`${record.name} ${record.lastUsed}`.toLowerCase().includes(query.toLowerCase())));
</script>
<div class="api-key-table" role="table" aria-label="API keys">
 <div class="api-key-row" role="row">
  <div class="api-check-cell" role="columnheader"><div class="api-check"><Checkbox label="Select all keys" disabled={!records.length} checked={!!records.length&&records.every(record=>selected[record.id])} onchange={(event)=>onall((event.currentTarget as HTMLInputElement).checked)}/></div></div>
  <div class="api-name" role="columnheader">Name</div><div class="api-last" role="columnheader">Last used ↓</div><div class="api-requests" role="columnheader">Requests</div>
 </div>
 {#each filtered as record(record.id)}
  <div class="api-key-row" role="row" data-design-name="TableRow" data-api-key={record.id}>
   <div class="api-check-cell" role="cell"><div class="api-check"><Checkbox label={`Select ${record.name}`} checked={!!selected[record.id]} onchange={(event)=>onselect(record.id,(event.currentTarget as HTMLInputElement).checked)}/></div></div>
   <div class="api-name" role="cell">{record.name}</div><div class="api-last" role="cell">{record.lastUsed}</div><div class="api-requests" role="cell">{record.requests}</div>
  </div>
 {/each}
 {#if !filtered.length}<p class="api-empty">{records.length?'No matching keys':'No API keys'}</p>{/if}
</div>
