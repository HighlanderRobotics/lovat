<script lang="ts">
	let { image, title, body }: { image?: string; title: string; body?: string } = $props();
</script>

<div class="empty">
	{#if image}<img src={image} alt="" width="250" />{/if}
	<h2 class="headline-medium">{title}</h2>
	{#if body}<p>{body}</p>{/if}
</div>

<style>
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 8px;
		padding: 48px 24px;
	}
	img {
		max-width: 70vw;
	}
	p {
		margin: 0;
	}
</style>
