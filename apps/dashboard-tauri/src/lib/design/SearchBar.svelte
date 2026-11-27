<script lang="ts">
 import {onMount} from 'svelte';
 let {value=$bindable(''),placeholder,onclose}:{value?:string;placeholder:string;onclose:()=>void}=$props();
 let input:HTMLInputElement;
 onMount(()=>input.focus({preventScroll:true}));
</script>
<div class="design-live-search">
 <input bind:this={input} bind:value aria-label={placeholder} {placeholder} onkeydown={(event)=>{if(event.key==='Escape'){event.stopPropagation();onclose();}}}/>
 <button aria-label="Close search" onclick={()=>{input.blur();onclose();}}>×</button>
</div>
