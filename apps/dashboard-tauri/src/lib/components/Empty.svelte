<script lang="ts">
	import { EmptyState } from '@highlanderrobotics/magnolia-svelte/v2';
	let { image, title, body }: { image?: string; title: string; body?: string } =
		$props();
</script>

<EmptyState {title} body={body ?? ''}>
	{#snippet icon()}{#if image}<img
				src={image}
				alt=""
				width="48"
				height="48"
				style="object-fit:contain"
			/>{/if}{/snippet}
</EmptyState>
