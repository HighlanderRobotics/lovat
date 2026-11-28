<script lang="ts">
	import { goto } from '$app/navigation';
	import { LovatAPIException } from '#lib/api/client.ts';
	import { getCachedMatches, getMatches, getTeamsAtTournament, type MatchScheduleMatch } from '#lib/api/endpoints.ts';
	import AppBar from '#lib/components/AppBar.svelte';
	import ErrorView from '#lib/components/ErrorView.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import MatchCard from '#lib/components/MatchCard.svelte';
	import TeamChipsInput from '#lib/components/TeamChipsInput.svelte';
	import type { GameMatchIdentity } from '#lib/models/match.ts';
	import type { Team } from '#lib/models/types.ts';
	import { session } from '#lib/session.svelte.ts';
	import { toast } from '#lib/toast.svelte.ts';
	import { currentTournament } from '#lib/tournament.svelte.ts';
	import { untrack } from 'svelte';

	type Completion = 'any' | 'upcoming' | 'finished';

	let teamsFilter = $state<Team[]>([]);
	let completion = $state<Completion>('any');
	let matches = $state<MatchScheduleMatch[] | null>(null);
	let nextMatch = $state<GameMatchIdentity | null>(null);
	let initialError = $state<string | null>(null);
	let missingTournament = $state<string | null>(null);
	let teamsInTournament = $state<Team[] | null>(null);
	let fetching = $state(false);
	let showTop = $state(false);

	function computeNextMatch(list: MatchScheduleMatch[]): GameMatchIdentity | null {
		if (teamsFilter.length || completion !== 'any' || list.length === 0) return nextMatch;
		const lastScoutedIndex = list.findLastIndex((m) => m.isScouted);
		if (lastScoutedIndex === -1) return list[0].identity;
		return lastScoutedIndex === list.length - 1 ? null : list[lastScoutedIndex + 1].identity;
	}

	async function fetchData() {
		const tournament = currentTournament.value;
		if (!tournament) {
			missingTournament = 'No tournament selected';
			return;
		}
		const teams = teamsFilter.length ? teamsFilter.map((t) => t.number) : undefined;
		fetching = true;
		const cached = getCachedMatches(tournament.key, teams);
		if (cached && matches === null && initialError === null) {
			matches = cached;
			nextMatch = computeNextMatch(cached);
		}
		try {
			const fresh = await getMatches(tournament.key, teams);
			matches = fresh;
			nextMatch = computeNextMatch(fresh);
			initialError = null;
		} catch (e) {
			if (e instanceof LovatAPIException && e.message === 'Tournament not found') {
				missingTournament = tournament.name;
			} else if (matches === null) {
				initialError = e instanceof LovatAPIException ? e.message : 'An unknown error occurred';
			}
		} finally {
			fetching = false;
		}
	}

	$effect(() => {
		const t = currentTournament.value;
		untrack(() => {
			session.loadCached();
			void session.refresh();
			void fetchData();
			if (t) {
				getTeamsAtTournament(t.key)
					.then((teams) => (teamsInTournament = teams))
					.catch((e: Error) => toast.error(`Error fetching teams: ${e.message}`));
			}
		});
	});

	const visible = $derived(
		(matches ?? []).filter((m) =>
			completion === 'finished' ? m.isFinished : completion === 'upcoming' ? !m.isFinished : true
		)
	);

	function toggle(value: Completion) {
		completion = completion === value ? 'any' : value;
	}

	function jumpToNext() {
		if (!nextMatch) return;
		document.getElementById(`match-${nextMatch.toMediumKey()}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	function onScroll() {
		showTop = window.scrollY > 1000;
	}
</script>

<svelte:window onscroll={onScroll} />

<AppBar title="Match Schedule" loading={fetching && matches !== null}>
	{#snippet actions()}
		{#if session.isScoutingLead && currentTournament.value}
			<button class="icon-btn" aria-label="Edit scouter schedule" title="Edit scouter schedule" onclick={() => goto('/edit_scout_schedule')}>
				<Icon name="edit" />
			</button>
		{/if}
	{/snippet}
	{#snippet bottom()}
		<div class="filters">
			<TeamChipsInput
				bind:value={teamsFilter}
				teams={teamsInTournament}
				onchange={() => {
					void fetchData();
				}}
			/>
			<div class="title-medium">Completion</div>
			<div class="row">
				<button class="chip" class:selected={completion === 'upcoming'} onclick={() => toggle('upcoming')}>Upcoming</button>
				<button class="chip" class:selected={completion === 'finished'} onclick={() => toggle('finished')}>Finished</button>
				<span class="grow"></span>
				{#if matches && nextMatch}
					<button class="next" onclick={jumpToNext}>
						<span class="label-medium">Up next</span>
						<span>{nextMatch.getShortLocalizedDescription()}</span>
					</button>
				{/if}
			</div>
		</div>
	{/snippet}
</AppBar>

{#if missingTournament}
	<div class="page-body stack">
		<h2 class="headline-medium">No schedule found for {missingTournament}</h2>
		<p>
			The Lovat team may have deleted the tournament in the process of removing test data. Open settings to select a
			tournament that exists.
		</p>
	</div>
{:else if initialError}
	<ErrorView
		message={initialError}
		onRetry={() => {
			initialError = null;
			void fetchData();
		}}
	/>
{:else if matches === null}
	<div class="page-body stack">
		{#each [0, 1, 2, 3] as i (i)}<div class="skeleton" style="height: 170px; border-radius: 8px"></div>{/each}
	</div>
{:else if matches.length === 0}
	<div class="page-body stack">
		<h2 class="headline-medium">No matches found for your tournament</h2>
		<p>Lovat sources match schedules from The&nbsp;Blue&nbsp;Alliance. Once posted, matches will be visible here.</p>
	</div>
{:else}
	<div class="page-body matches">
		{#each visible as match (match.identity.toMediumKey())}
			<div id="match-{match.identity.toMediumKey()}" class="anchor"><MatchCard {match} /></div>
		{/each}
	</div>
{/if}

{#if showTop}
	<button class="fab" aria-label="Jump to top" title="Jump to top" onclick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
		<Icon name="arrow_upward" />
	</button>
{/if}

<style>
	.filters {
		padding: 16px 24px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		max-width: 900px;
		margin: 0 auto;
		width: 100%;
	}
	.next {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 5px;
		border: none;
		background: none;
		cursor: pointer;
	}
	.matches {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}
	.anchor {
		scroll-margin-top: 260px;
	}
	.fab {
		position: fixed;
		right: 16px;
		bottom: calc(16px + var(--safe-bottom));
		width: 56px;
		height: 56px;
		border-radius: 16px;
		border: none;
		background: var(--primary-container);
		color: var(--on-primary-container);
		box-shadow: 0 3px 8px rgba(0, 0, 0, 0.4);
		cursor: pointer;
	}
	p {
		margin: 0;
	}
</style>
