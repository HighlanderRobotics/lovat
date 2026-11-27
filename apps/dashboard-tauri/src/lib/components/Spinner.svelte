<script lang="ts">
	import { Spinner } from '@highlanderrobotics/magnolia-svelte/v2';
	let { size = 40 }: { size?: number } = $props();
</script>

<Spinner size={size <= 20 ? 'small' : size <= 32 ? 'medium' : 'large'} />
