<script lang="ts">
	import { getCSVExport, type CSVExportFilter, type CSVExportFormat } from '#lib/api/endpoints.ts';
	import AppBar from '#lib/components/AppBar.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import { saveTextFile } from '#lib/download.ts';
	import { toast } from '#lib/toast.svelte.ts';
	import { currentTournament } from '#lib/tournament.svelte.ts';

	const formats: { value: CSVExportFormat; title: string; description: string }[] = [
		{ value: 'csvplain', title: 'By team', description: "Each row contains a team's aggregated statistics throughout the tournament." },
		{
			value: 'reportcsv',
			title: 'By scout report',
			description: "Each row contains data collected by one scouter about a specific team's performance during a match."
		}
	];
	const filters: { value: CSVExportFilter; title: string; description: string }[] = [
		{ value: '', title: "Don't filter", description: 'Total quantities over entire matches' },
		{ value: 'auto', title: 'Filter to Auto', description: 'Calculated only from auto data' },
		{ value: 'teleop', title: 'Filter to Teleop', description: 'Calculated only from teleop data' }
	];

	let format = $state<CSVExportFormat | null>(null);
	let filter = $state<CSVExportFilter | null>(null);
	let exporting = $state(false);
	let error = $state<string | null>(null);

	async function run() {
		const t = currentTournament.value;
		if (!t || format === null || filter === null) return;
		exporting = true;
		error = null;
		try {
			const csv = await getCSVExport(t.key, format, filter);
			if (await saveTextFile(`${t.name} data.csv`, csv)) toast.show('Export saved');
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to export data';
		} finally {
			exporting = false;
		}
	}
</script>

{#snippet picker<T>(options: { value: T; title: string; description: string }[], selected: T | null, choose: (v: T) => void)}
	<div class="picker" role="radiogroup">
		{#each options as o (o.title)}
			<button class="option" class:on={selected === o.value} role="radio" aria-checked={selected === o.value} onclick={() => choose(o.value)}>
				<span class="grow"><span class="title-medium">{o.title}</span><br /><span class="desc">{o.description}</span></span>
				{#if selected === o.value}<Icon name="check_circle" fill />{/if}
			</button>
		{/each}
	</div>
{/snippet}

<AppBar title="CSV Export" back backFallback="/settings" loading={exporting} />

<div class="page-body stack" style="gap: 14px">
	{#if !currentTournament.value}
		<p>No tournament selected</p>
	{:else}
		<p style="margin: 0">Download a file containing data collected at {currentTournament.value.name}, by all teams in your data set.</p>
		{@render picker(formats, format, (v) => (format = v))}
		{@render picker(filters, filter, (v) => (filter = v))}
		{#if error}<p style="color: var(--error); margin: 0">{error}</p>{/if}
		<button class="btn btn-filled" disabled={format === null || filter === null || exporting} onclick={run}><Icon name="download" /> Export</button>
	{/if}
</div>

<style>
	.picker {
		border-radius: 10px;
		overflow: hidden;
		background: var(--surface-high);
	}
	.option {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		padding: 12px 14px;
		border: none;
		border-bottom: 1px solid var(--surface);
		background: transparent;
		text-align: left;
		cursor: pointer;
	}
	.option:last-child {
		border-bottom: none;
	}
	.option.on {
		background: var(--primary-container);
		color: var(--on-primary-container);
	}
	.desc {
		color: var(--on-surface-variant);
		font-size: 13px;
	}
</style>
