<script lang="ts">
	import { onMount } from 'svelte';
	export let number: number;
	export let year: number;
	let metrics: { matches: number; points: number; auto: number; teleop: number } | null = null;
	let photo: { image: string; source: string } | null = null;
	let disposed = false;

	onMount(() => {
		const controller = new AbortController();

		void fetch(`/api/public/teams/${number}/${year}`, { signal: controller.signal })
			.then(async (response) => {
				if (!response.ok) return;

				const result = await response.json();

				if (!disposed) {
					metrics = result.metrics;
					photo = result.photo;
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

{#if metrics || photo}
	<section class="overview" aria-label="Robot and public scouting metrics">
		{#if metrics}<div class="metrics">
				<h2>Scouting metrics</h2>
				<div class="values">
					{#each [['Points', metrics.points], ['Auto', metrics.auto], ['Teleop', metrics.teleop]] as [label, value]}<div
						>
							<strong>{Number(value).toFixed(1)}</strong><span>{label}</span>
						</div>{/each}
				</div>
				<span class="matches">{metrics.matches} matches</span>
			</div>{/if}
		{#if photo}<a
				class="robot-photo"
				href={photo.source}
				target="_blank"
				rel="noreferrer"
				aria-label={`Team ${number} robot photo on TBA`}
				><img
					src={photo.image}
					alt={`Team ${number}'s ${year} robot`}
					on:error={() => (photo = null)}
				/><span>TBA</span></a
			>{/if}
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
	.robot-photo {
		position: relative;
		width: 300px;
		max-width: 45%;
		display: flex;
		background: var(--secondary-container);
		border-radius: 7px;
		overflow: hidden;
	}
	img {
		width: 100%;
		height: 240px;
		object-fit: contain;
	}
	.robot-photo span {
		position: absolute;
		right: 8px;
		bottom: 8px;
		padding: 4px 8px;
		background: #181818bb;
		border-radius: 4px;
	}
	@media (max-width: 650px) {
		.overview {
			flex-direction: column;
		}
		.robot-photo {
			width: 100%;
			max-width: none;
		}
	}
</style>
