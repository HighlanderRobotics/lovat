<script lang="ts">
	let { values = $bindable(), labels }: { values: string[]; labels: string[] } = $props();
</script>

{#each labels as label, i (i)}
	<label class="field">
		<span>{label}</span>
		<input
			class="input filled"
			inputmode="numeric"
			bind:value={values[i]}
			oninput={() => (values[i] = values[i].replace(/\D/g, ''))}
		/>
	</label>
{/each}
