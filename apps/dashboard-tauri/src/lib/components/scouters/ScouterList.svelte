<script lang="ts">
	import { scouterOverviewsQuery } from '#lib/api/endpoints.ts';
	import { useQuery } from '#lib/api/query.svelte.ts';
	import { currentTournament } from '#lib/tournament.svelte.ts';
	import Empty from '../Empty.svelte';
	import ErrorView from '../ErrorView.svelte';
	import Icon from '../Icon.svelte';

	let { archived, filter, refreshKey = 0 }: { archived: boolean; filter: string; refreshKey?: number } = $props();
	const query = useQuery(() => {
		void refreshKey;
		return scouterOverviewsQuery(archived);
	});

	const filtered = $derived((query.data ?? []).filter((s) => s.scout.name.toLowerCase().includes(filter.toLowerCase())));

	function subtitle(total: number, missed: number) {
		const scouted = `${total} match${total === 1 ? '' : 'es'} scouted`;
		return currentTournament.value ? `${scouted}, ${missed} missed` : scouted;
	}
</script>

{#if query.error && !query.hasData}
	<ErrorView message={query.error} onRetry={query.refetch} />
{:else if !query.data}
	<div class="page-body stack">{#each [0, 1, 2, 3, 4] as i (i)}<div class="skeleton" style="height: 56px"></div>{/each}</div>
{:else if query.data.length === 0}
	<Empty image="/images/no_scouters.png" title={archived ? 'No archived scouters found' : 'No scouters found'} body={archived ? undefined : 'Tap + to create one.'} />
{:else if filtered.length === 0}
	<Empty image="/images/no_scouters.png" title="No results found" />
{:else}
	<div class="list">
		{#each filtered as overview (overview.scout.id)}
			<a
				class="list-item"
				href="/scouters/detail?id={overview.scout.id}&name={encodeURIComponent(overview.scout.name)}&archived={archived}"
			>
				<span class="monogram title-medium">{overview.scout.name.slice(0, 1).toUpperCase()}</span>
				<span class="grow">
					<span class="body-large">{overview.scout.name}</span><br />
					<span class="subtitle">{subtitle(overview.totalMatches, overview.missedMatches)}</span>
				</span>
				<Icon name="arrow_right" />
			</a>
		{/each}
	</div>
{/if}

<style>
	.list {
		max-width: 900px;
		width: 100%;
		margin: 0 auto;
	}
	.monogram {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: var(--primary-container);
		color: var(--on-primary-container);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
</style>
