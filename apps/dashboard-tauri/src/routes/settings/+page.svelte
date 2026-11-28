<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { lovatAPI } from '#lib/api/client.ts';
	import {
		deleteAccount,
		editTeamEmail,
		getAnalysts,
		getSourceTeamSettings,
		getSourceTournamentKeys,
		getTeamCode,
		getTeamEmail,
		getTournaments,
		setSourceTeams,
		type Analyst,
		type SourceTeamMode
	} from '#lib/api/endpoints.ts';
	import { queryCache } from '#lib/api/query.svelte.ts';
	import { auth } from '#lib/auth/index.ts';
	import AppBar from '#lib/components/AppBar.svelte';
	import Dialog from '#lib/components/Dialog.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import TournamentPicker from '#lib/components/settings/TournamentPicker.svelte';
	import { appVersion, buildNumber, defaultApiBase } from '#lib/config.ts';
	import { session } from '#lib/session.svelte.ts';
	import { clearAnalysisCaches } from '#lib/sourceSettings.ts';
	import { prefs } from '#lib/storage.ts';
	import { toast } from '#lib/toast.svelte.ts';
	import { currentTournament, tournamentLabel } from '#lib/tournament.svelte.ts';

	// ── Team source ──
	let mode = $state<SourceTeamMode | null>(null);
	let sourceTeams = $state<number[] | null>(null);
	let teamError = $state<string | null>(null);

	async function loadTeamSource() {
		try {
			const s = await getSourceTeamSettings();
			mode = s.mode;
			sourceTeams = s.teams ?? null;
		} catch {
			teamError = 'Failed to load source teams';
		}
	}

	async function chooseMode(next: SourceTeamMode) {
		if (next === 'SPECIFIC_TEAMS') {
			void goto(`/settings/source_teams${sourceTeams ? `?teams=${sourceTeams.join(',')}` : ''}`);
			return;
		}
		mode = null;
		try {
			await setSourceTeams(next);
			clearAnalysisCaches();
			await loadTeamSource();
		} catch {
			teamError = 'Failed to save source team settings';
		}
	}

	// ── Tournament source ──
	let tournamentSourceText = $state<string | null>(null);
	let tournamentError = $state<string | null>(null);

	async function loadTournamentSource() {
		try {
			const [{ tournaments }, keys] = await Promise.all([getTournaments(), getSourceTournamentKeys()]);
			const selected = tournaments.filter((t) => keys.includes(t.key));
			tournamentSourceText =
				selected.length === 0 ? 'None' : selected.length === 1 ? tournamentLabel(selected[0]) : `${selected.length} tournaments`;
		} catch {
			tournamentError = 'Failed to load tournaments';
		}
	}

	// ── Team email (scouting leads) ──
	let email = $state<string | null>(null);
	let emailError = $state<string | null>(null);
	let changingEmail = $state(false);
	let newEmail = $state('');
	let emailSubmitting = $state(false);
	let emailSent = $state(false);
	let emailDialogError = $state<string | null>(null);

	async function loadEmail() {
		try {
			email = await getTeamEmail();
		} catch {
			emailError = 'Failed to load email';
		}
	}

	async function submitEmail() {
		emailSubmitting = true;
		emailDialogError = null;
		try {
			await editTeamEmail(newEmail);
			await loadEmail();
			emailSent = true;
		} catch (e) {
			emailDialogError = e instanceof Error ? e.message : 'Failed to update email';
		} finally {
			emailSubmitting = false;
		}
	}

	// ── Analysts & team code ──
	let analysts = $state<Analyst[] | null | undefined>(undefined);
	let code = $state<string | null>(null);
	let showCode = $state(false);

	// ── Reset ──
	let resetting = $state(false);
	let deleteAccountToo = $state(false);
	let resetBusy = $state(false);
	let resetError = $state<string | null>(null);

	async function reset() {
		resetBusy = true;
		resetError = null;
		try {
			if (deleteAccountToo) await deleteAccount();
			queryCache.clearAll();
			lovatAPI.cache.clear();
			localStorage.clear();
			await auth.logout();
			location.href = '/';
		} catch {
			resetError = 'Failed to delete configuration';
			resetBusy = false;
		}
	}

	function resetServer() {
		prefs.setString('api_base_url', defaultApiBase);
		lovatAPI.baseUrl = defaultApiBase;
		location.href = '/';
	}

	$effect(() => {
		untrack(() => {
			session.loadCached();
			void session.refresh().then((p) => {
				if (p?.role === 'SCOUTING_LEAD') void loadEmail();
			});
			void loadTeamSource();
			void loadTournamentSource();
			getAnalysts()
				.then((a) => (analysts = a))
				.catch(() => (analysts = null));
			getTeamCode()
				.then((c) => (code = c))
				.catch((e) => toast.error(`Error getting team code: ${e instanceof Error ? e.message : e}`));
		});
	});

	const thisTeam = $derived(session.profile?.team?.number ?? null);
	const isLead = $derived(session.isScoutingLead);
</script>

<AppBar title="Settings">
	{#snippet actions()}
		{#if code}
			<button class="icon-btn" title="View team code" aria-label="View team code" onclick={() => (showCode = true)}><Icon name="pin" /></button>
		{/if}
	{/snippet}
</AppBar>

<div class="page-body stack settings">
	<section class="stack">
		<span class="label-large">Use data from teams</span>
		{#if mode === null && !teamError}
			<div class="skeleton" style="width: 200px; height: 48px"></div>
		{:else if mode !== null}
			<div class="segmented" role="radiogroup">
				{#if thisTeam !== null}
					<button role="radio" aria-checked={mode === 'THIS_TEAM'} class:on={mode === 'THIS_TEAM'} onclick={() => chooseMode('THIS_TEAM')}>{thisTeam}</button>
				{/if}
				<button role="radio" aria-checked={mode === 'ALL_TEAMS'} class:on={mode === 'ALL_TEAMS'} onclick={() => chooseMode('ALL_TEAMS')}>All</button>
				<button role="radio" aria-checked={mode === 'SPECIFIC_TEAMS'} class:on={mode === 'SPECIFIC_TEAMS'} onclick={() => chooseMode('SPECIFIC_TEAMS')}>
					{sourceTeams ? `${sourceTeams.length} team${sourceTeams.length === 1 ? '' : 's'}` : 'Choose...'}
				</button>
			</div>
		{/if}
		{#if teamError}<p class="error"><Icon name="error" size={18} /> {teamError}</p>{/if}
	</section>

	<section class="stack">
		<span class="label-large">Use data from tournaments</span>
		{#if tournamentSourceText === null && !tournamentError}
			<div class="skeleton" style="height: 60px"></div>
		{:else if tournamentSourceText !== null}
			<div class="box"><span class="grow ellipsis">{tournamentSourceText}</span><a class="btn btn-text" href="/settings/source_tournaments">Change</a></div>
		{/if}
		{#if tournamentError}<p class="error"><Icon name="error" size={18} /> {tournamentError}</p>{/if}
	</section>

	<TournamentPicker />

	{#if isLead && currentTournament.value}
		<a class="btn btn-tonal" href="/settings/export"><Icon name="download" /> Export CSV</a>
	{/if}

	{#if isLead}
		<section class="stack">
			<span class="label-large">Team email</span>
			{#if email === null && !emailError}
				<div class="skeleton" style="width: 200px; height: 60px"></div>
			{:else if email !== null}
				<div class="box">
					<span class="grow ellipsis">{email}</span>
					<button class="btn btn-text" onclick={() => ((newEmail = ''), (emailSent = false), (emailDialogError = null), (changingEmail = true))}>Change</button>
				</div>
			{/if}
			{#if emailError}<p class="error"><Icon name="error" size={18} /> {emailError}</p>{/if}
		</section>
	{/if}

	{#if analysts}
		<section class="stack">
			<span class="label-large">Promote analysts</span>
			<div class="box">
				<span class="grow ellipsis">{analysts.length === 0 ? 'Nobody to promote' : analysts.length === 1 ? analysts[0].name : `${analysts.length} analysts`}</span>
				<a class="btn btn-text" href="/settings/analysts">Change</a>
			</div>
		</section>
	{/if}

	<button class="btn btn-danger" onclick={() => ((deleteAccountToo = false), (resetError = null), (resetting = true))}>Reset app</button>

	{#if lovatAPI.baseUrl !== defaultApiBase}
		<div class="box">
			<span class="grow"><span class="label-large">URL</span><br /><span class="ellipsis">{lovatAPI.baseUrl}</span></span>
			<button class="btn btn-filled" onclick={resetServer}>Reset</button>
		</div>
	{/if}

	<p class="version">Version {appVersion} • Build {buildNumber}</p>
</div>

<Dialog bind:open={showCode} title="Team code">
	<div class="code">{code}</div>
	<p style="margin: 0">Share this code with your team members to allow them to join.</p>
	{#snippet actions()}
		<button
			class="btn btn-tonal"
			onclick={async () => {
				await navigator.clipboard.writeText(code ?? '');
				toast.show('Copied to clipboard');
			}}><Icon name="content_copy" /> Copy</button
		>
		<button class="btn btn-text" onclick={() => (showCode = false)}>Done</button>
	{/snippet}
</Dialog>

<Dialog bind:open={changingEmail} title={emailSent ? "Check the team's inbox" : 'Change email'} dismissible={!emailSubmitting}>
	{#if emailSent}
		<p style="margin: 0">We've sent an email to your team with a link to verify that it belongs to your team.</p>
	{:else}
		<label class="field">
			<span>New Email</span>
			<input class="input filled" type="email" bind:value={newEmail} autocapitalize="none" />
			{#if emailDialogError}<span class="error-text">{emailDialogError}</span>{/if}
		</label>
	{/if}
	{#snippet actions()}
		{#if emailSent}
			<button class="btn btn-text" onclick={() => (changingEmail = false)}>OK</button>
		{:else}
			<button class="btn btn-text" disabled={emailSubmitting} onclick={() => (changingEmail = false)}>Cancel</button>
			<button class="btn btn-filled" disabled={emailSubmitting || !newEmail} onclick={submitEmail}>{emailSubmitting ? '…' : 'Update'}</button>
		{/if}
	{/snippet}
</Dialog>

<Dialog bind:open={resetting} title="Delete configuration?" dismissible={!resetBusy}>
	<p style="margin: 0">
		If you continue, you will erase all the data this app has saved and reset it to how it came when you first installed it. If you so
		choose, you can also delete your account.
	</p>
	<label class="row"><input type="checkbox" bind:checked={deleteAccountToo} /> Delete my account</label>
	{#if resetError}<p class="error">{resetError}</p>{/if}
	{#snippet actions()}
		<button class="btn btn-text" disabled={resetBusy} onclick={() => (resetting = false)}>Cancel</button>
		<button class="btn btn-danger" disabled={resetBusy} onclick={reset}>{resetBusy ? '…' : 'Delete'}</button>
	{/snippet}
</Dialog>

<style>
	.settings {
		gap: 20px;
	}
	.segmented {
		display: inline-flex;
		align-self: flex-start;
		border: 1px solid var(--outline);
		border-radius: 20px;
		overflow: hidden;
	}
	.segmented button {
		min-width: 72px;
		height: 40px;
		padding: 0 16px;
		border: none;
		border-right: 1px solid var(--outline);
		background: transparent;
		color: var(--on-surface);
		font-weight: 500;
		cursor: pointer;
	}
	.segmented button:last-child {
		border-right: none;
	}
	.segmented button.on {
		background: var(--secondary-container);
		color: var(--on-secondary-container);
	}
	.box {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 60px;
		padding: 0 6px 0 14px;
		border-radius: 10px;
		background: var(--surface-high);
	}
	.ellipsis {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		display: block;
	}
	.error {
		display: flex;
		align-items: center;
		gap: 5px;
		color: var(--error);
		margin: 0;
	}
	.code {
		font-family: 'Roboto Mono', monospace;
		font-size: 45px;
		letter-spacing: 6px;
		text-align: center;
		padding: 16px;
		border-radius: 10px;
		background: var(--primary-container);
		color: var(--on-primary-container);
	}
	.version {
		text-align: center;
		color: var(--on-surface-variant);
		font-size: 12px;
		margin: 8px 0 0;
	}
	input[type='checkbox'] {
		width: 18px;
		height: 18px;
		accent-color: var(--primary);
	}
</style>
