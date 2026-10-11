<script lang="ts">
	import { onMount, createEventDispatcher } from 'svelte';
	export let number: number;
	export let year: number;
	let metrics: { matches: number; points: number; auto: number; teleop: number } | null = null;
	const dispatch = createEventDispatcher<{ photo: { image: string; source: string } | null }>();
	let disposed = false;

	onMount(() => {
		const controller = new AbortController();

		void fetch(`/api/public/teams/${number}/${year}`, { signal: controller.signal })
			.then(async (response) => {
				if (!response.ok) return;

				const result = await response.json();

				if (!disposed) {
					metrics = result.metrics;
					dispatch('photo', result.photo);
				}
			})
			.catch(() => {
				/* Optional media and metrics do not block the team profile. */
			});

		return () => {
			disposed = true;
			controller.abort();
		};
	});
</script>

{#if metrics}
	<section class="overview" aria-label="Public scouting metrics">
		{#if metrics}<div class="metrics">
				<h2>Lovat scouting metrics</h2>
				<div class="values">
					{#each [['Points', metrics.points], ['Auto', metrics.auto], ['Teleop', metrics.teleop]] as [label, value]}<div
						>
							<strong>{Number(value).toFixed(1)}</strong><span>{label}</span>
						</div>{/each}
				</div>
				<span class="matches">{metrics.matches} matches</span>
			</div>{/if}
	</section>
{/if}

<style>
	.overview {
		display: flex;
		gap: 24px;
		margin: 28px 0;
		align-items: stretch;
	}
	.metrics {
		flex: 1;
		background: var(--secondary-container);
		border-radius: 7px;
		padding: 24px;
	}
	h2 {
		font-weight: 500;
		font-size: 20px;
		margin: 0 0 20px;
	}
	.values {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 16px;
	}
	.values > div {
		display: grid;
		gap: 8px;
		text-align: center;
	}
	strong {
		font-size: 28px;
		font-weight: 500;
	}
	span {
		font-size: 13px;
		color: var(--body);
	}
	.matches {
		display: block;
		margin-top: 20px;
		text-align: center;
	}
</style>
