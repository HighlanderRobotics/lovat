<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { deleteScoutReport, getEventsForScoutReport, getScoutReportAnalysis } from '#lib/api/endpoints.ts';
	import AppBar from '#lib/components/AppBar.svelte';
	import AutoPathPlayer from '#lib/components/AutoPathPlayer.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import ErrorView from '#lib/components/ErrorView.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import NotesEditor from '#lib/components/NotesEditor.svelte';
	import Spinner from '#lib/components/Spinner.svelte';
	import Tabs from '#lib/components/Tabs.svelte';
	import ValueTile from '#lib/components/ValueTile.svelte';
	import { numToStringRounded } from '#lib/metrics.ts';
	import { GameMatchIdentity } from '#lib/models/match.ts';
	import {
		AutoClimbResult,
		EndgameClimbResult,
		accuracyBands,
		autoClimbNames,
		describeEvent,
		endgameClimbNames,
		feederTypeNames,
		type ScoutReportEvent,
		type SingleScoutReportAnalysis
	} from '#lib/models/scoutReport.ts';
	import { RobotRole, robotRoleIcons, robotRoleNames } from '#lib/models/types.ts';
	import { goBack } from '#lib/ui.svelte.ts';

	const params = page.url.searchParams;
	const uuid = params.get('uuid') ?? '';
	const team = params.get('team') ?? '';
	const match = GameMatchIdentity.fromLongKey(params.get('match') ?? '');
	const scout = params.get('scout') ?? '';
	const canModify = params.get('canModify') !== 'false';

	let analysis = $state<SingleScoutReportAnalysis | null>(null);
	let timeline = $state<ScoutReportEvent[] | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let tab = $state(0);
	let editingNotes = $state(false);
	let confirmDelete = $state(false);
	let deleting = $state(false);
	let deleteError = $state<string | null>(null);

	async function load() {
		error = null;
		loading = true;
		try {
			const [a, t] = await Promise.all([getScoutReportAnalysis(uuid), getEventsForScoutReport(uuid)]);
			analysis = a;
			timeline = t;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to get report';
		} finally {
			loading = false;
		}
	}

	async function remove() {
		deleting = true;
		deleteError = null;
		try {
			await deleteScoutReport(uuid);
			confirmDelete = false;
			goBack();
		} catch (e) {
			deleteError = e instanceof Error ? e.message : 'Failed to delete report';
		} finally {
			deleting = false;
		}
	}

	$effect(() => {
		untrack(load);
	});

	const title = `${team} in ${match.getShortLocalizedDescription()} - ${scout}`;
</script>

<AppBar {title} back loading={loading && analysis !== null}>
	{#snippet actions()}
		{#if canModify && analysis}
			<button class="icon-btn" aria-label="Delete report" title="Delete report" onclick={() => (confirmDelete = true)}>
				<Icon name="delete" />
			</button>
		{/if}
	{/snippet}
	{#snippet bottom()}
		{#if analysis}<Tabs tabs={['Overview', 'Timeline']} bind:selected={tab} />{/if}
	{/snippet}
</AppBar>

{#if error}
	<ErrorView message={error} onRetry={load} />
{:else if !analysis || !timeline}
	<div class="center" style="flex: 1"><Spinner /></div>
{:else if tab === 0}
	{@const a = analysis}
	<div class="page-body stack">
		{#if a.robotBrokeDescription !== null}
			<div class="warning">
				<div class="row"><Icon name="warning" fill /><strong>Robot broke</strong></div>
				{#if a.robotBrokeDescription.trim()}<p>{a.robotBrokeDescription}</p>{/if}
			</div>
		{/if}

		<h2 class="section-title">Score</h2>
		<div class="grid3">
			<ValueTile value={String(a.totalPoints)} label="Total" />
			<ValueTile value={String(a.totalPoints - a.autoScore)} label="Teleop" />
			<ValueTile value={String(a.autoScore)} label="Auto" />
		</div>

		<h2 class="section-title">Roles</h2>
		<div class="grid2">
			{#each a.robotRoles as role (role)}
				<div class="role"><Icon name={robotRoleIcons[role]} size={32} /><span class="title-large">{robotRoleNames[role]}</span></div>
			{/each}
		</div>

		<h2 class="section-title">Shooting</h2>
		<div class="grid3">
			<ValueTile value={String(a.fuelScore)} label="Fuel Scored" />
			<ValueTile value={a.accuracy === null ? '-' : (accuracyBands[a.accuracy] ?? '-')} label="% Accuracy" />
			<ValueTile value={String(a.scoringRate)} label="BPS" />
		</div>

		<h2 class="section-title">Auto</h2>
		<AutoPathPlayer paths={[{ path: a.autoPath, color: '#1e88e5' }]} />
		<ValueTile value={String(a.autoPathScore)} label="Path score" tone="colored" />
		<div class="grid2">
			<ValueTile value={a.autoClimb === AutoClimbResult.notAttempted ? 'None' : autoClimbNames[a.autoClimb]} label="Climb Result" />
			<ValueTile
				value={a.autoClimb === AutoClimbResult.notAttempted ? '--' : `${numToStringRounded(a.autoClimbStartTime)}s`}
				label="time to climb"
			/>
		</div>

		<h2 class="section-title">Driving &amp; Defense</h2>
		<div class="grid2">
			<ValueTile value="{numToStringRounded(a.campingDefenseTime)}s" label="Camping Defense" />
			<ValueTile value="{numToStringRounded(a.contactDefenseTime)}s" label="Contact Defense" />
		</div>
		<div class="grid-2-1">
			<ValueTile value="{a.defenseEffectiveness}/5" label="Defense Effectiveness" />
			<ValueTile value="{a.driverAbility}/5" label="Driver Ability" />
		</div>

		<h2 class="section-title">Feeding</h2>
		<div class="grid3">
			<ValueTile value={numToStringRounded(a.ballsPerFeed)} label="Balls/Feed" />
			<ValueTile value={String(a.ballsFed)} label="Balls Fed" />
			<ValueTile value={String(a.feedingRate)} label="BPS" />
		</div>

		{#if a.robotRoles.includes(RobotRole.feeding)}
			<h2 class="section-title">Feeder Types</h2>
			<div class="grid2">
				{#each a.feederType as type (type)}<div class="role"><span class="headline-small">{feederTypeNames[type]}</span></div>{/each}
			</div>
		{/if}

		<h2 class="section-title">Endgame</h2>
		<div class="grid2">
			<ValueTile value={a.climbResult === EndgameClimbResult.notAttempted ? 'None' : endgameClimbNames[a.climbResult]} label="Climb Result" />
			<ValueTile
				value={a.climbResult === EndgameClimbResult.notAttempted ? '--' : `${numToStringRounded(a.climbStartTime)}s`}
				label="time left"
			/>
		</div>

		{#if a.notes !== null}
			<div class="row notes-head">
				<h2 class="section-title grow">Notes</h2>
				{#if canModify}
					<button class="icon-btn" aria-label="Edit notes" onclick={() => (editingNotes = true)}><Icon name="edit" /></button>
				{/if}
			</div>
			<p class="notes">{a.notes}</p>
			<NotesEditor bind:open={editingNotes} {uuid} initialNotes={a.notes} onSubmitted={load} />
		{/if}
	</div>
{:else}
	<div class="timeline">
		{#each timeline as event, i (i)}
			<div class="event">
				<span class="time label-large">{numToStringRounded(event.timestamp / 1000)}s</span>
				<span>{describeEvent(event)}</span>
			</div>
		{/each}
	</div>
{/if}

<Dialog bind:open={confirmDelete} title="Delete report" dismissible={!deleting}>
	<p style="margin: 0">Are you sure you want to delete this report?</p>
	{#if deleteError}<p class="error">{deleteError}</p>{/if}
	{#snippet actions()}
		<button class="btn btn-text" onclick={() => (confirmDelete = false)} disabled={deleting}>Cancel</button>
		<button class="btn btn-text" onclick={remove} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete'}</button>
	{/snippet}
</Dialog>

<style>
	.grid3 {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}
	.grid2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.grid-2-1 {
		display: grid;
		grid-template-columns: 2fr 1fr;
		gap: 10px;
	}
	.role {
		height: 60px;
		border-radius: 10px;
		background: var(--surface-high);
		color: var(--on-surface-variant);
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 5px;
	}
	.warning {
		border-radius: 10px;
		padding: 10px;
		background: var(--warning-bg);
		color: var(--warning-fg);
	}
	.warning p {
		margin: 4px 0 0 31px;
	}
	.notes {
		margin: 0;
		white-space: pre-wrap;
	}
	.notes-head {
		align-items: flex-end;
	}
	.timeline {
		max-width: 900px;
		width: 100%;
		margin: 0 auto;
	}
	.event {
		display: flex;
		gap: 5px;
		padding: 5px 24px;
		border-bottom: 1px solid var(--surface-high);
	}
	.time {
		width: 40px;
		text-align: end;
		color: var(--primary);
		flex-shrink: 0;
	}
	.error {
		color: var(--error);
		margin: 0;
	}
</style>
