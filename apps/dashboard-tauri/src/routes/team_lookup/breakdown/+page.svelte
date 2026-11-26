<script lang="ts">
	import { page } from '$app/state';
	import { breakdownDetailsQuery, type BreakdownDetailsReport } from '#lib/api/endpoints.ts';
	import { useQuery } from '#lib/api/query.svelte.ts';
	import AppBar from '#lib/components/AppBar.svelte';
	import ErrorView from '#lib/components/ErrorView.svelte';
	import LinearProgress from '#lib/components/LinearProgress.svelte';
	import { breakdowns, segmentName } from '#lib/metrics.ts';

	const team = Number(page.url.searchParams.get('team'));
	const path = page.url.searchParams.get('breakdown') ?? '';
	const breakdown = breakdowns.find((b) => b.path === path);
	const query = useQuery(() => breakdownDetailsQuery(team, path));

	interface MatchGroup {
		match: BreakdownDetailsReport['match'];
		reports: BreakdownDetailsReport[];
	}

	/** Group reports by segment, then by match, preserving server order. */
	const segments = $derived.by(() => {
		const out: { segmentPath: string; matches: MatchGroup[] }[] = [];
		for (const report of query.data ?? []) {
			let segment = out.find((s) => s.segmentPath === report.segmentPath);
			if (!segment) out.push((segment = { segmentPath: report.segmentPath, matches: [] }));
			const key = report.match.toMediumKey();
			const group = segment.matches.find((m) => m.match.toMediumKey() === key);
			if (group) group.reports.push(report);
			else segment.matches.push({ match: report.match, reports: [report] });
		}
		return out;
	});

	function source(group: MatchGroup) {
		const { reports } = group;
		const named = reports.find((r) => r.scouterName);
		if (reports.length > 1 && named) return `${named.scouterName} +${reports.length - 1}`;
		if (reports.length > 1) return `${reports.length} reports`;
		return reports[0]?.scouterName ?? String(reports[0]?.sourceTeam ?? 'Unknown');
	}
</script>

<AppBar title="{team} - {breakdown?.localizedName ?? path}" back backFallback="/team_lookup?team={team}" loading={query.isFetching && query.hasData} />

{#if query.error && !query.hasData}
	<ErrorView message={query.error} onRetry={query.refetch} />
{:else if !query.data}
	<LinearProgress />
{:else}
	<div class="page-body">
		{#each segments as segment, i (segment.segmentPath)}
			{#if i > 0}<hr class="divider" style="margin-top: 14px" />{/if}
			<h2 class="section-title">{segmentName(path, segment.segmentPath)}</h2>
			<div class="stack" style="gap: 7px; margin-top: 8px">
				{#each segment.matches as group (group.match.toMediumKey())}
					<div class="row" style="align-items: flex-start">
						<span class="grow">{group.match.getLocalizedDescription({ abbreviateName: true })}</span>
						<span style="text-align: end">{source(group)}</span>
					</div>
				{/each}
			</div>
		{/each}
	</div>
{/if}
