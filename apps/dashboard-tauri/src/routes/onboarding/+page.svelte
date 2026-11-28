<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import {
		editTeamEmail,
		getRegistrationStatus,
		getTeams,
		getTournaments,
		getUserProfile,
		joinTeamByCode,
		registerTeam,
		resendVerificationEmail,
		sendTeamCode,
		setNotOnTeam,
		setSourceTeams,
		setSourceTournamentKeys,
		setTeamWebsite,
		setUsername,
		type SourceTeamMode
	} from '#lib/api/endpoints.ts';
	import { auth } from '#lib/auth/index.ts';
	import Dialog from '#lib/components/Dialog.svelte';
	import ErrorView from '#lib/components/ErrorView.svelte';
	import Icon from '#lib/components/Icon.svelte';
	import SourceModeCards from '#lib/components/settings/SourceModeCards.svelte';
	import TeamMultiSelect from '#lib/components/settings/TeamMultiSelect.svelte';
	import TournamentMultiSelect from '#lib/components/settings/TournamentMultiSelect.svelte';
	import Spinner from '#lib/components/Spinner.svelte';
	import { websiteBaseUrl } from '#lib/config.ts';
	import type { Team } from '#lib/models/types.ts';
	import { clearAnalysisCaches } from '#lib/sourceSettings.ts';
	import { prefs } from '#lib/storage.ts';
	import { toast } from '#lib/toast.svelte.ts';
	import { currentTournament, tournamentLabel, type Tournament } from '#lib/tournament.svelte.ts';

	type Phase =
		| 'welcome'
		| 'loading'
		| 'username'
		| 'teamSelection'
		| 'registerTeamChoice'
		| 'teamEmail'
		| 'emailVerification'
		| 'teamWebsite'
		| 'teamVerification'
		| 'teamCode'
		| 'otherUserRegistering'
		| 'teamDataSettings'
		| 'specificTeams'
		| 'tournamentSettings'
		| 'atTournament'
		| 'error';

	let phase = $state<Phase>('loading');
	let team = $state<Team | null>(null);
	let teamEmail = $state<string | null>(null);
	let busy = $state(false);
	let error = $state<string | null>(null);

	function go(next: Phase) {
		error = null;
		busy = false;
		phase = next;
	}

	async function init() {
		try {
			if (await auth.isAuthenticated()) {
				const profile = await getUserProfile();
				if (profile.team) await toRegistrationStatus(null);
				else go('teamSelection');
			} else {
				go('welcome');
			}
		} catch {
			go('welcome');
		}
	}

	$effect(() => {
		untrack(init);
	});

	async function login() {
		phase = 'loading';
		try {
			await auth.login();
			await toRegistrationStatus(null);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Sign-in failed');
			go('welcome');
		}
	}

	/** Route to the step that matches the team's registration status. */
	async function toRegistrationStatus(t: Team | null) {
		team = t;
		phase = 'loading';
		try {
			const profile = await getUserProfile();
			team = t ?? profile.team ?? null;
			const status = team ? await getRegistrationStatus(team.number) : null;
			if (status?.teamEmail) teamEmail = status.teamEmail;
			if (profile.username == null) return go('username');
			if (!status) return go('teamSelection');
			switch (status.status) {
				case 'NOT_STARTED':
					return go('registerTeamChoice');
				case 'REGISTERED_OFF_TEAM':
					return go('teamCode');
				case 'PENDING_EMAIL_VERIFICATION':
					return go('emailVerification');
				case 'PENDING_WEBSITE':
					return go('teamWebsite');
				case 'PENDING_TEAM_VERIFICATION':
					return go('teamVerification');
				case 'REGISTERED_ON_TEAM':
					return go('teamDataSettings');
				case 'PENDING':
					return go('otherUserRegistering');
				default:
					return go('error');
			}
		} catch {
			go('error');
		}
	}

	async function attempt(fn: () => Promise<void>, message: string) {
		busy = true;
		error = null;
		try {
			await fn();
		} catch (e) {
			error = e instanceof Error && e.name === 'LovatAPIException' ? e.message : message;
		} finally {
			busy = false;
		}
	}

	function complete() {
		prefs.setInt('onboardingVersion', 1);
		void goto(currentTournament.value ? '/match_schedule' : '/team_lookup', { replace: true });
	}

	// ── Field state ──
	let username = $state('');
	let email = $state('');
	let website = $state('');
	let code = $state('');
	let sourceMode = $state<SourceTeamMode | null>(null);

	// ── Team search (server-side filter, paged) ──
	let teamFilter = $state('');
	let teamResults = $state<Team[]>([]);
	let teamTotal = $state<number | null>(null);
	let teamTimer: ReturnType<typeof setTimeout>;

	async function searchTeams(reset = true) {
		const skip = reset ? 0 : teamResults.length;
		const filter = teamFilter;
		const page = await getTeams({ take: 50, skip, filter });
		if (filter !== teamFilter) return;
		teamResults = reset ? page.teams : [...teamResults, ...page.teams];
		teamTotal = page.total;
	}

	$effect(() => {
		if (phase !== 'teamSelection') return;
		void teamFilter;
		clearTimeout(teamTimer);
		teamTimer = setTimeout(() => untrack(() => void searchTeams().catch(() => (teamTotal = 0))), 200);
	});

	// ── Tournaments ──
	let tournaments = $state<Tournament[] | null>(null);
	let sourceTournaments = $state(new Set<string>());
	let atFilter = $state('');

	$effect(() => {
		if (phase !== 'tournamentSettings' && phase !== 'atTournament') return;
		untrack(() => {
			if (tournaments) return;
			getTournaments()
				.then((r) => (tournaments = r.tournaments))
				.catch(() => (error = 'Error fetching tournaments'));
		});
	});

	// ── Dialogs ──
	let changingEmail = $state(false);
	let changedEmail = $state('');
	let lostCode = $state(false);
	let codeSentTo = $state<string | null>(null);
	let codeSendFailed = $state(false);
</script>

{#snippet header(title: string, back?: () => void)}
	<div class="header">
		{#if back}<button class="icon-btn" aria-label="Back" onclick={back}><Icon name="arrow_back" /></button>{/if}
		<h1 class="headline-small">{title}</h1>
	</div>
{/snippet}

{#snippet next(label: string, disabled: boolean, run: () => void)}
	<!-- Pinned to the viewport so long lists never push it off screen. -->
	<div class="actions">
		{#if error}<p class="error">{error}</p>{/if}
		<button class="btn btn-filled" disabled={disabled || busy} onclick={run}>{busy ? '…' : label}</button>
	</div>
{/snippet}

<div class="onboarding">
	{#if phase === 'loading'}
		<div class="center fill"><Spinner /></div>
	{:else if phase === 'error'}
		<ErrorView onRetry={() => toRegistrationStatus(team)} />
	{:else if phase === 'welcome'}
		<div class="welcome fill">
			<div class="brand">
				<span class="welcome-to">Welcome to</span>
				<span class="lovat">Lovat</span>
			</div>
			<button class="btn btn-filled btn-block" onclick={login}>Sign in</button>
		</div>
	{:else if phase === 'username'}
		<form class="step" onsubmit={(e) => (e.preventDefault(), username && attempt(async () => (await setUsername(username), go('teamSelection')), 'Error setting username'))}>
			{@render header('Choose a name')}
			<!-- svelte-ignore a11y_autofocus -->
			<label class="field"><span>Username</span><input class="input filled" bind:value={username} autofocus autocapitalize="words" /></label>
			{@render next('Next', !username, () => attempt(async () => (await setUsername(username), go('teamSelection')), 'Error setting username'))}
		</form>
	{:else if phase === 'teamSelection'}
		<div class="step fill">
			{@render header('Choose your team')}
			<!-- svelte-ignore a11y_autofocus -->
			<input class="input filled" placeholder="Search" bind:value={teamFilter} autofocus aria-label="Search teams" />
			<div class="results">
				{#if teamTotal === 0}
					<p class="title-large center" style="padding: 32px">No teams found</p>
				{:else if teamTotal === null}
					{#each [0, 1, 2, 3, 4, 5] as i (i)}<div class="skeleton" style="height: 56px; margin-bottom: 4px"></div>{/each}
				{:else}
					{#each teamResults as t (t.number)}
						<button class="list-item" onclick={() => toRegistrationStatus(t)}>
							<span class="grow"><span class="body-large">{t.name}</span><br /><span class="subtitle">{t.number}</span></span>
							<Icon name="chevron_right" />
						</button>
					{/each}
					{#if teamResults.length < teamTotal}
						<button class="btn btn-text btn-block" onclick={() => searchTeams(false)}>Load more</button>
					{/if}
				{/if}
			</div>
			<div class="actions"><button
				class="btn btn-tonal"
				disabled={busy}
				onclick={() =>
					attempt(async () => {
						await setNotOnTeam();
						team = null;
						go('teamDataSettings');
					}, 'Error setting not on team')}>I'm not on a team</button
			></div>
		</div>
	{:else if phase === 'registerTeamChoice'}
		<div class="step fill">
			{@render header('', () => ((team = null), go('teamSelection')))}
			<span class="grow"></span>
			<h2 class="headline-medium">Register<br />{team?.name}?</h2>
			<p>
				You are the first person on {team?.number} to sign up for Lovat. Would you like to register on behalf of your team? You should only
				do this if you're in charge of your team's scouting. You will only have to do this once.
			</p>
			<span class="grow"></span>
			<button class="btn btn-filled" onclick={() => go('teamEmail')}>Register {team?.number}</button>
			<button class="btn btn-text" onclick={() => ((team = null), go('teamDataSettings'))}>Not now</button>
		</div>
	{:else if phase === 'teamEmail'}
		{@const valid = /^[a-zA-Z0-9.]+@[a-zA-Z0-9]+\.[a-zA-Z]+/.test(email)}
		<div class="step">
			{@render header("Enter your team's email address", () => go('registerTeamChoice'))}
			<!-- svelte-ignore a11y_autofocus -->
			<label class="field"><span>Email</span><input class="input filled" type="email" bind:value={email} autofocus autocapitalize="none" />
				{#if email && !valid}<span class="error-text">Please enter a valid email</span>{/if}</label
			>
			{@render next('Next', !email, () =>
				attempt(async () => {
					await registerTeam(team!.number, email);
					teamEmail = email;
					go('emailVerification');
				}, 'Error setting email')
			)}
		</div>
	{:else if phase === 'emailVerification'}
		<div class="step fill">
			{@render header('', () => go('teamSelection'))}
			<span class="grow"></span>
			<h2 class="headline-medium">Check your team's inbox</h2>
			<p>We've sent an email to {teamEmail ?? 'your team'} with a link to verify that it belongs to your team.</p>
			<button class="btn btn-tonal" style="align-self: flex-start" onclick={() => ((changedEmail = ''), (changingEmail = true))}><Icon name="edit" /> Change address</button>
			<span class="grow"></span>
			{@render next("I've verified the email", false, () =>
				attempt(async () => {
					const status = await getRegistrationStatus(team!.number);
					if (status.status === 'PENDING_EMAIL_VERIFICATION') throw Object.assign(new Error("No, you haven't"), { name: 'LovatAPIException' });
					await toRegistrationStatus(team);
				}, "No, you haven't")
			)}
			<button
				class="btn btn-text"
				onclick={() =>
					attempt(async () => {
						await resendVerificationEmail();
						toast.show('Email resent');
					}, 'Error resending email')}>Resend email</button
			>
		</div>
	{:else if phase === 'teamWebsite'}
		<div class="step">
			{@render header("Enter your team's website")}
			<!-- svelte-ignore a11y_autofocus -->
			<label class="field"
				><span>Website</span><input class="input filled" type="url" bind:value={website} autofocus autocapitalize="none" /><span class="helper-text"
					>We'll use this to verify your team.</span
				></label
			>
			{@render next('Next', !website, () => attempt(async () => (await setTeamWebsite(website), await toRegistrationStatus(team)), 'Error setting website'))}
		</div>
	{:else if phase === 'teamVerification'}
		<div class="step fill center-col">
			<img src="/images/awaiting_verification.png" alt="" class="art" />
			<h2 class="headline-medium">Awaiting verification</h2>
			<p>Please wait while we verify your team. We'll send updates to {teamEmail}. If we don't verify you soon, get help at {websiteBaseUrl}/support/.</p>
		</div>
	{:else if phase === 'teamCode'}
		<div class="step">
			{@render header("Enter your team's code", () => go('teamSelection'))}
			<!-- svelte-ignore a11y_autofocus -->
			<label class="field"
				><span>Code</span><input
					class="input filled code"
					bind:value={code}
					oninput={() => (code = code.toUpperCase())}
					autofocus
					autocapitalize="characters"
					autocomplete="off"
					spellcheck="false"
				/></label
			>
			{@render next('Next', !code, () =>
				attempt(async () => {
					if (!(await joinTeamByCode(team!.number, code))) throw Object.assign(new Error('Invalid code'), { name: 'LovatAPIException' });
					await toRegistrationStatus(team);
				}, 'Error joining team')
			)}
			<button class="btn btn-text" onclick={() => ((codeSentTo = null), (codeSendFailed = false), (lostCode = true))}>Where do I find my team's code?</button>
		</div>
	{:else if phase === 'otherUserRegistering'}
		<div class="step fill">
			<span class="grow"></span>
			<h2 class="headline-medium">Another user is registering</h2>
			<p>Another user is currently registering this team. Please wait for them to finish.</p>
			<span class="grow"></span>
			<button class="btn btn-filled" onclick={() => go('teamSelection')}>Back</button>
		</div>
	{:else if phase === 'teamDataSettings'}
		<div class="step">
			{@render header('Where should we source your data?')}
			<SourceModeCards {team} bind:selected={sourceMode} />
			{@render next('Next', sourceMode === null, () => {
				if (sourceMode === 'SPECIFIC_TEAMS') return go('specificTeams');
				void attempt(async () => {
					await setSourceTeams(sourceMode!);
					clearAnalysisCaches();
					go('tournamentSettings');
				}, 'Error setting source teams');
			})}
		</div>
	{:else if phase === 'specificTeams'}
		<div class="step fill">
			<TeamMultiSelect
				submit={async (teams) => {
					await setSourceTeams('SPECIFIC_TEAMS', teams.map((t) => t.number));
					clearAnalysisCaches();
					go('tournamentSettings');
				}}
			/>
		</div>
	{:else if phase === 'tournamentSettings'}
		<div class="step">
			{@render header('Source tournaments')}
			<p style="margin: 0">Which tournaments should we source data from?</p>
			{#if tournaments}
				<TournamentMultiSelect {tournaments} bind:selected={sourceTournaments} />
				{@render next(sourceTournaments.size ? 'Next' : 'Use all', false, () =>
					attempt(async () => {
						await setSourceTournamentKeys(sourceTournaments.size ? [...sourceTournaments] : tournaments!.map((t) => t.key));
						clearAnalysisCaches();
						go('atTournament');
					}, 'Error setting source tournaments')
				)}
			{:else if !error}
				{#each [0, 1, 2, 3] as i (i)}<div class="skeleton" style="height: 56px"></div>{/each}
			{:else}
				<p class="error">{error}</p>
			{/if}
		</div>
	{:else if phase === 'atTournament'}
		<div class="step">
			{@render header('At tournament')}
			<p style="margin: 0">Which tournament are you at?</p>
			<input class="input filled" placeholder="Search" bind:value={atFilter} aria-label="Search tournaments" />
			<div class="results">
				{#each (tournaments ?? []).filter((t) => tournamentLabel(t).toLowerCase().includes(atFilter.toLowerCase())) as t (t.key)}
					<button
						class="list-item"
						onclick={() => {
							currentTournament.set(t);
							complete();
						}}><span class="grow body-large">{tournamentLabel(t)}</span><Icon name="chevron_right" /></button
					>
				{/each}
			</div>
			<div class="actions">
				{#if error}<p class="error">{error}</p>{/if}
				<button
					class="btn btn-tonal"
					onclick={() => {
						currentTournament.set(null);
						complete();
					}}>I'm not at a tournament</button
				>
			</div>
		</div>
	{/if}
</div>

<Dialog bind:open={changingEmail} title="Change team email">
	<label class="field"><span>Email</span><input class="input filled" type="email" bind:value={changedEmail} /></label>
	{#if error}<p class="error">{error}</p>{/if}
	{#snippet actions()}
		<button class="btn btn-text" disabled={busy} onclick={() => (changingEmail = false)}>Cancel</button>
		<button
			class="btn btn-text"
			disabled={busy || !changedEmail}
			onclick={() =>
				attempt(async () => {
					await editTeamEmail(changedEmail);
					changingEmail = false;
					await toRegistrationStatus(team);
				}, 'Error changing email')}>Submit</button
		>
	{/snippet}
</Dialog>

<Dialog bind:open={lostCode} title={codeSentTo ? 'Code sent' : codeSendFailed ? 'An error occured' : "Where do I find my team's code?"}>
	{#if codeSentTo}
		<p style="margin: 0">We sent your team's code to {codeSentTo}. If you're still unable to get access, please let us know.</p>
	{:else}
		<p style="margin: 0">
			{codeSendFailed
				? "We weren't able to send your team's code."
				: "Your team already uses Lovat and has a 6-character code used to invite members. You can try asking your scouting leadership for it, or we can send it to your team's email."}
		</p>
	{/if}
	{#snippet actions()}
		{#if codeSentTo || codeSendFailed}<a class="btn btn-text" href="{websiteBaseUrl}/support" target="_blank" rel="noreferrer">Get support</a>{/if}
		<button class="btn btn-text" onclick={() => (lostCode = false)}>{codeSentTo ? 'Done' : 'Cancel'}</button>
		{#if !codeSentTo}
			<button
				class="btn btn-filled"
				disabled={busy}
				onclick={async () => {
					busy = true;
					try {
						codeSentTo = await sendTeamCode(team!.number);
						codeSendFailed = false;
					} catch {
						codeSendFailed = true;
					} finally {
						busy = false;
					}
				}}>{busy ? 'Sending...' : codeSendFailed ? 'Try again' : 'Send us the code'}</button
			>
		{/if}
	{/snippet}
</Dialog>

<style>
	.onboarding {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		max-width: 560px;
		margin: 0 auto;
		padding: calc(24px + var(--safe-top)) 24px calc(24px + var(--safe-bottom));
	}
	.fill {
		flex: 1;
	}
	.step {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.header {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 40px;
	}
	.welcome {
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding-bottom: 50px;
	}
	.brand {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}
	.welcome-to {
		font-size: 20px;
		line-height: 1;
	}
	.lovat {
		font-size: clamp(64px, 25vw, 100px);
		line-height: 1;
		font-weight: 500;
	}
	.results {
		flex: 1;
		overflow-y: auto;
		max-height: 55vh;
		margin: 0 -24px;
	}
	.center-col {
		align-items: center;
		justify-content: center;
		text-align: center;
	}
	.art {
		max-width: 80%;
	}
	.code {
		font-family: 'Roboto Mono', monospace;
		letter-spacing: 4px;
	}
	.actions {
		position: sticky;
		bottom: 0;
		z-index: 5;
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin: 0 -24px;
		padding: 16px 24px calc(16px + var(--safe-bottom));
		background: linear-gradient(transparent, var(--surface) 24px);
	}
	.error {
		color: var(--error);
		margin: 0;
	}
	p {
		margin: 0;
	}
</style>
