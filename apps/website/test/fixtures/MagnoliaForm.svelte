<script lang="ts">
	import { MagnoliaUIRoot, Button, TextField } from '@highlanderrobotics/magnolia-svelte';
	let {
		submit,
		activate
	}: { submit: (data: FormData) => void; activate: (event: MouseEvent) => void } = $props();
</script>

<MagnoliaUIRoot theme="dark">
	<form
		onsubmit={(event) => {
			event.preventDefault();
			submit(new FormData(event.currentTarget));
		}}
	>
		<TextField label="Team" name="team" value="8033" required />
		<Button type="submit">Send report</Button>
		<Button onclick={activate}>Preview report</Button>
	</form>
</MagnoliaUIRoot>
