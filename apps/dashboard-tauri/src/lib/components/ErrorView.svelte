<script lang="ts">
	let {
		message = null,
		onRetry,
		retryLabel = 'Retry'
	}: { message?: string | null; onRetry?: () => void; retryLabel?: string } = $props();
</script>

<div class="error-view" role="alert">
	<div class="face">:(</div>
	<h2 class="headline-large">An {message ? '' : 'unknown '}error has occured.</h2>
	{#if message}<p class="body-large">{message}</p>{/if}
	{#if onRetry}<button class="btn btn-filled" onclick={onRetry}>{retryLabel}</button>{/if}
</div>

<style>
	.error-view {
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		justify-content: center;
		min-height: 50vh;
		max-width: 700px;
	}
	.face {
		font-size: 57px;
		line-height: 64px;
	}
	p {
		margin: 0 0 16px;
	}
	button {
		align-self: flex-start;
	}
</style>
