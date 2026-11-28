<script lang="ts">
	import { toast } from '#lib/toast.svelte.ts';
</script>

{#if toast.current}
	{@const t = toast.current}
	<div class="toast" class:error={t.tone === 'error'} role="status" aria-live="polite">
		<div class="text">
			<div>{t.message}</div>
			{#if t.detail}<div class="detail">{t.detail}</div>{/if}
		</div>
		{#if t.action}
			<button
				class="btn btn-text"
				onclick={() => {
					t.action?.run();
					toast.dismiss();
				}}>{t.action.label}</button
			>
		{/if}
	</div>
{/if}

<style>
	.toast {
		position: fixed;
		left: 50%;
		bottom: calc(16px + var(--safe-bottom));
		transform: translateX(-50%);
		z-index: 100;
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: min(344px, calc(100vw - 32px));
		max-width: calc(100vw - 32px);
		padding: 8px 8px 8px 16px;
		min-height: 48px;
		border-radius: 4px;
		background: #e8e0e5;
		color: #322f35;
		box-shadow: 0 3px 8px rgba(0, 0, 0, 0.4);
	}
	.toast.error {
		background: var(--error-container);
		color: var(--on-error-container);
	}
	.text {
		flex: 1;
	}
	.detail {
		font-size: 12px;
		opacity: 0.8;
	}
	.btn-text {
		color: #6750a4;
	}
</style>
