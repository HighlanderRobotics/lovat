<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { getScoutReportsByLongMatchKey, type MinimalScoutReportInfo } from '#lib/api/endpoints.ts';
	import AppBar from '#lib/components/AppBar.svelte';
	import ErrorView from '#lib/components/ErrorView.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import Spinner from '#lib/components/Spinner.svelte';
	import { localizeTimestamp } from '#lib/format.ts';
	import { GameMatchIdentity } from '#lib/models/match.ts';

	const key = page.url.searchParams.get('key') ?? '';
	const team = page.url.searchParams.get('team') ?? '';
	const match = GameMatchIdentity.fromLongKey(key);

	let reports = $state<MinimalScoutReportInfo[] | null>(null);
	let error = $state<string | null>(null);

	async function load() {
		error = null;
		reports = null;
		try {
			reports = await getScoutReportsByLongMatchKey(key);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to get reports';
		}
	}

	$effect(() => {
		untrack(load);
	});

	function reportHref(r: MinimalScoutReportInfo) {
		const params = new URLSearchParams({
			uuid: r.uuid,
			team,
			match: key,
			scout: r.scout.name,
			canModify: String(r.canModify ?? true)
		});
		return `/scout_report?${params}`;
	}
</script>

<AppBar title="Data in {match.getShortLocalizedDescription()} for {team}" back />

{#if error}
	<ErrorView message={error} onRetry={load} />
{:else if !reports}
	<div class="center" style="flex: 1"><Spinner /></div>
{:else}
	<div class="list">
		{#each reports as report (report.uuid)}
			<a class="list-item" href={reportHref(report)}>
				<span class="grow">
					<span class="body-large">{report.scout.name}</span><br />
					<span class="subtitle">{localizeTimestamp(report.timestamp)}</span>
				</span>
				<Icon name="chevron_right" />
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
</style>
