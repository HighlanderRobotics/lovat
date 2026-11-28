<script lang="ts">
	import { Button } from '@highlanderrobotics/magnolia-svelte/v2';
	let {
		splash = false,
		label = 'Loading page',
		error,
		onretry,
		oncancel,
	}: {
		splash?: boolean;
		label?: string;
		error?: string;
		onretry?: () => void;
		oncancel?: () => void;
	} = $props();
	let width = $state(393);
</script>

<div
	class="design-loading-layer"
	class:splash
	role={error ? 'alert' : 'status'}
	aria-label={error
		? 'Page could not be loaded'
		: splash
			? 'Starting Lovat Dashboard'
			: label}
	aria-busy={!error}
	bind:clientWidth={width}
>
	{#if error}
		<div class="design-load-error">
			<h2>Couldn’t load this page</h2>
			<p>{error}</p>
			<Button onclick={onretry}>Try again</Button>{#if oncancel}<Button
					variant="tertiary"
					onclick={oncancel}>Stay here</Button
				>{/if}
		</div>
	{:else if splash}
		<div
			class="design-splash-art"
			style={`transform:scale(${Math.min(width / 408, 1)})`}
		>
			<img src="/design-assets/166a7.svg" alt="Lovat" />
		</div>
	{:else}
		<div class="design-skeleton" aria-hidden="true">
			<div class="skeleton-heading"></div>
			<div class="skeleton-tabs"></div>
			{#each [0, 1, 2, 3] as row}<div class="skeleton-card">
					<span></span><span></span>
				</div>{/each}
		</div>
	{/if}
</div>

<style>
	.design-loading-layer {
		position: fixed;
		inset: 0;
		z-index: 100;
		background: #1f1f1f;
		color: #e6e6e6;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		font:
			400 15px/22px Roboto,
			sans-serif;
	}
	.design-splash-art {
		width: 408px;
		height: 222px;
		flex: none;
		transform-origin: center;
	}
	.design-splash-art img {
		max-width: none;
		display: block;
	}
	.design-skeleton {
		align-self: stretch;
		width: 100%;
		max-width: 393px;
		padding: calc(env(safe-area-inset-top, 0px) + 24px) 26px 26px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.skeleton-heading,
	.skeleton-tabs,
	.skeleton-card {
		border-radius: 10px;
		background: #292929;
		animation: pulse 1.2s ease-in-out infinite alternate;
	}
	.skeleton-heading {
		height: 32px;
		width: 65%;
	}
	.skeleton-tabs {
		height: 36px;
		margin: 12px 0;
	}
	.skeleton-card {
		height: 94px;
		padding: 18px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.skeleton-card span {
		height: 12px;
		width: 75%;
		border-radius: 4px;
		background: #3c3c3c;
	}
	.skeleton-card span + span {
		width: 45%;
	}
	.design-load-error {
		max-width: 360px;
		padding: 26px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.design-load-error h2 {
		font:
			500 20px/28px Roboto,
			sans-serif;
	}
	.design-load-error p {
		margin: 0;
	}
	@keyframes pulse {
		to {
			opacity: 0.55;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.skeleton-heading,
		.skeleton-tabs,
		.skeleton-card {
			animation: none;
		}
	}
</style>
