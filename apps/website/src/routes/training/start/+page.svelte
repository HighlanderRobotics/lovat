<script lang="ts">
	import { onMount } from 'svelte';
	import { Button, Icon, Select, TextField } from 'magnolia-ui-svelte';
	import QRCode from 'qrcode';
	import MatchVideo from '$lib/training/MatchVideo.svelte';
	import type { Credentials, Participant, Session, Video } from '$lib/training/types';
	const labels: Record<string, string> = {
		robotRoles: 'Robot roles',
		mobility: 'Field traversal',
		autoClimb: 'Auto climb',
		endgameClimb: 'Endgame climb',
		intakeType: 'Intake',
		beached: 'Beached',
		scoresWhileMoving: 'Scores while moving'
	};
	function clock(seconds: number): string {
		return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
	}
	function describe(value: unknown): string {
		if (typeof value === 'boolean') return value ? 'Yes' : 'No';
		if (Array.isArray(value)) return value.map(describe).join(', ');
		return String(value ?? 'Not recorded')
			.toLowerCase()
			.replaceAll('_', ' ');
	}
	let step: 'start' | 'select' | 'session' | 'summary' = 'start';
	let videos: Video[] = [],
		selected = '',
		filter = '',
		error = '',
		busy = false,
		connected = false,
		qr = '';
	let credentials: Credentials | null = null;
	let session: Session | null = null;
	let socket: WebSocket | undefined, reconnect: ReturnType<typeof setTimeout>;
	let disposed = false;
	let socketUrl = '';
	$: options = videos.filter((v) =>
		`${v.matchKey} ${v.teamNumber}`.toLowerCase().includes(filter.toLowerCase())
	);
	$: canStart =
		!!session?.participants.length && session.participants.every((p) => p.ready && p.connected);
	async function api(path: string, method = 'GET', body?: unknown) {
		const response = await fetch(`/training/api/${path}`, {
			method,
			signal: AbortSignal.timeout(15000),
			headers: {
				'Content-Type': 'application/json',
				Authorization: credentials ? `Bearer ${credentials.browserToken}` : ''
			},
			body: body ? JSON.stringify(body) : undefined
		});
		const data = response.status === 204 ? null : await response.json();
		if (!response.ok) throw new Error(data?.displayError ?? 'Could not update training.');
		return data;
	}
	async function perform(action: () => Promise<void>) {
		error = '';
		busy = true;
		try {
			await action();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Could not connect.';
		} finally {
			busy = false;
		}
	}
	function save() {
		if (credentials)
			sessionStorage.setItem('lovat-training', JSON.stringify({ credentials, step }));
	}
	async function connect() {
		if (!credentials || disposed) return;
		if (socket) {
			socket.onclose = null;
			socket.onmessage = null;
			socket.close();
		}
		socket = new WebSocket(socketUrl);
		socket.onopen = () =>
			socket?.send(
				JSON.stringify({ sessionUuid: credentials!.uuid, token: credentials!.browserToken })
			);
		socket.onmessage = ({ data }) => {
			session = JSON.parse(data);
			connected = true;
		};
		socket.onclose = ({ code }) => {
			connected = false;
			if (!disposed && code !== 1008)
				reconnect = setTimeout(() => {
					void connect();
				}, 2000);
			else if (!disposed) error = 'Session expired or unavailable. Start a new session.';
		};
		socket.onerror = () => {
			connected = false;
		};
	}
	async function control(action: string) {
		const uuid = credentials!.uuid;
		const updated = await api(`sessions/${uuid}/control`, 'POST', { action });
		if (credentials?.uuid === uuid) {
			session = updated;
			error = '';
		}
	}
	async function createSession() {
		credentials = await api('sessions', 'POST', { videoUuid: selected });
		session = await api(`sessions/${credentials!.uuid}`);
		qr = await QRCode.toDataURL(
			`lovat-collection://training/join?session=${credentials!.uuid}&token=${credentials!.pairingToken}`,
			{ width: 280, margin: 2 }
		);
		step = 'session';
		save();
		await connect();
	}
	async function complete() {
		step = 'summary';
		save();
		await api(`sessions/${credentials!.uuid}/grade`, 'POST', {});
	}
	async function remove(participant: Participant) {
		await api(`sessions/${credentials!.uuid}/participants/${participant.uuid}`, 'DELETE');
		session = await api(`sessions/${credentials!.uuid}`);
	}
	function newSession() {
		if (credentials && session?.status !== 'ENDED') {
			void api(`sessions/${credentials.uuid}/control`, 'POST', { action: 'interrupt' }).catch(
				() => undefined
			);
		}
		if (socket) {
			socket.onclose = null;
			socket.onmessage = null;
			socket.close();
			socket = undefined;
		}
		connected = false;
		clearTimeout(reconnect);
		credentials = null;
		session = null;
		qr = '';
		error = '';
		step = 'select';
		sessionStorage.removeItem('lovat-training');
	}
	onMount(() => {
		disposed = false;
		void perform(async () => {
			({ socketUrl } = await api('config'));
			videos = await api('videos');
			selected = videos[0]?.uuid ?? '';
			const stored = sessionStorage.getItem('lovat-training');
			if (stored) {
				const saved = JSON.parse(stored);
				credentials = saved.credentials;
				session = await api(`sessions/${credentials!.uuid}`);
				step = saved.step === 'summary' ? 'summary' : 'session';
				if (session!.status === 'PLAYING') {
					await control('interrupt');
					error = 'Reloading interrupted playback. Start a new session.';
				}
				qr = await QRCode.toDataURL(
					`lovat-collection://training/join?session=${credentials!.uuid}&token=${credentials!.pairingToken}`,
					{ width: 280, margin: 2 }
				);
				await connect();
			}
		});
		return () => {
			disposed = true;
			clearTimeout(reconnect);
			socket?.close();
		};
	});
</script>

<svelte:head>
	<title>Training | Lovat</title>
	<meta name="description" content="Practice scouting a match with your team." />
</svelte:head>

<div class="training-shell">
	<header class="app-bar">
		<a href="/" aria-label="Back to Lovat"><Icon icon="arrow_back_ios" size={22} /></a>
		<h1>Training</h1>
		{#if session}<span class="connection">{connected ? 'Connected' : 'Reconnecting…'}</span>{/if}
	</header>

	<main class:wide={session !== null}>
		{#if step === 'start'}
			<section class="start">
				<Icon icon="school" size={48} color="var(--victory-purple)" />
				<h2>Scout training</h2>
				<p>
					Watch a match and practice scouting the same robot as your teammates. Compare your report
					with the answer key when you finish.
				</p>
				<div>
					<Button disabled={busy} on:click={() => (step = 'select')}>Start training</Button>
				</div>
			</section>
		{:else if step === 'select'}
			<section class="form-section">
				<h2>Select a match</h2>
				<p>Choose a training match. Everyone in the session will scout the same robot.</p>
				<div class="field">
					<label for="search">Search</label><TextField
						id="search"
						bind:value={filter}
						placeholder="Match key or team number"
					/>
				</div>
				<div class="field">
					<label for="match">Match</label><Select
						id="match"
						bind:value={selected}
						placeholder="Select a match"
						items={options.map((video) => ({
							value: video.uuid,
							label: `${video.matchKey} · ${video.teamNumber}`
						}))}
					/>
				</div>
				{#if !videos.length}<p class="message">
						No training matches are available. Refresh after an exercise has been added.
					</p>{/if}
				<div class="actions">
					<Button variant="secondary" on:click={() => (step = 'start')}>Back</Button><Button
						disabled={busy || !options.some((v) => v.uuid === selected)}
						on:click={() => perform(createSession)}>Next</Button
					>
				</div>
			</section>
		{:else if session}
			<div class="page-heading">
				<h2>
					{step === 'summary'
						? 'Session summary'
						: session.status === 'LOBBY'
							? 'Connect scouts'
							: 'Training session'}
				</h2>
				<p>
					{session.video.matchKey} · Scout <strong>{session.video.teamNumber}</strong> · {session
						.video.alliance === 'RED'
						? 'Red'
						: 'Blue'} alliance
				</p>
			</div>
			{#if step === 'summary'}
				{#each session.participants as person}
					<section class="report-summary">
						<div class="summary-heading">
							<div>
								<h3>{person.name ?? 'Unnamed scout'}</h3>
								<p>{person.teamNumber} · {person.deviceName}</p>
							</div>
							{#if person.score}<div class="score">
									{person.score.overallScore}<span> / 100</span>
								</div>{/if}
						</div>
						{#if person.score}
							<table>
								<thead><tr><th>Fuel</th><th>Reported</th><th>Answer key</th></tr></thead><tbody
									>{#each person.score.breakdown.quantities as quantity}<tr
											><td>{quantity.action === 'STOP_SCORING' ? 'Scored' : 'Fed'}</td><td
												>{quantity.actual}</td
											><td>{quantity.expected}</td></tr
										>{/each}</tbody
								>
							</table>
							{#each person.score.breakdown.quantities as quantity}
								{#each quantity.differences ?? [] as difference}
									<p class="timeline-result">
										{quantity.action === 'STOP_SCORING' ? 'Scoring' : 'Feeding'} at {clock(
											difference.time
										)}: {difference.actual === null ? 'missing' : `${difference.actual} reported`} · {difference.expected}
										expected
									</p>
								{/each}
							{/each}
							<p class="timeline-result">
								{person.score.breakdown.timeline.matched} timeline events matched · {person.score
									.breakdown.timeline.expected} expected · {person.score.breakdown.timeline.actual} recorded
							</p>
							<details>
								<summary>Post-match fields</summary>
								<div class="feedback">
									{#each person.score.breakdown.fields as field}<div>
											<Icon icon={field.correct ? 'check' : 'close'} size={18} /><span
												>{labels[field.field] ?? field.field}: {describe(
													field.actual
												)}{#if !field.correct}<span class="muted">
														· Expected {describe(field.expected)}</span
													>{/if}</span
											>
										</div>{/each}
								</div>
							</details>
						{:else}<p class="message">
								{person.reportUuid ? 'Grading pending' : 'Waiting for report submission'}
							</p>{/if}
					</section>
				{/each}
				<p class="help">
					Scouts can finish their reports and upload while this page is open. Results update
					automatically.
				</p>
				<div class="actions">
					<Button
						variant="secondary"
						disabled={busy}
						on:click={() =>
							perform(async () => {
								await api(`sessions/${credentials!.uuid}/grade`, 'POST', {});
							})}>Retry pending grades</Button
					><Button on:click={newSession}>New session</Button>
				</div>
			{:else if session.status === 'LOBBY'}
				<div class="lobby">
					<section class="qr-section">
						<div class="qr-image">
							<img src={qr} alt="Scan to join this training session in Lovat Collection" />
						</div>
						<h3>Scan to join</h3>
						<p>
							Scan with your phone camera. Select your scout in Collection and enter a device name.
						</p>
					</section>
					<section class="roster">
						<h3>Scouts ({session.participants.length})</h3>
						{#if !session.participants.length}<p class="empty">No scouts connected yet.</p>{/if}
						{#each session.participants as person}<div class="scout-row">
								<Icon icon="person" size={24} />
								<div class="scout-info">
									<strong>{person.name ?? 'Unnamed scout'}</strong>
									<p>{person.teamNumber} · {person.deviceName}</p>
								</div>
								<span class="scout-status"
									>{!person.connected ? 'Disconnected' : person.ready ? 'Ready' : 'Preparing'}</span
								><Button
									variant="text-only-secondary"
									on:click={() => perform(() => remove(person))}
									><span class="sr-only">Remove {person.name ?? 'scout'}</span><Icon
										icon="close"
										size={20}
									/></Button
								>
							</div>{/each}
						<p class="help">Choose a starting pose and tap Ready in Collection.</p>
						<div class="actions">
							<Button variant="secondary" on:click={newSession}>Back</Button><Button
								disabled={!canStart || !connected || busy}
								on:click={() => perform(() => control('arm'))}>Start session</Button
							>
						</div>
					</section>
				</div>
			{:else if session.status === 'ARMED' || session.status === 'PLAYING'}
				<section class="video-section">
					<MatchVideo
						url={session.video.videoLink}
						offset={session.video.startOffsetSeconds}
						duration={session.video.durationSeconds}
						onPlaying={() => control('play')}
						onEnded={() => control('end')}
						onInterrupted={() => control('interrupt')}
						onError={(message) => (error = message)}
					/>
					<p class="help">
						Keep this page open. Recording begins when the video plays. Pausing or seeking requires
						a new session.
					</p>
				</section>
			{:else if session.status === 'ENDED'}
				<section class="form-section">
					<Icon icon="check_circle" size={36} color="var(--victory-purple)" />
					<h2>Video complete</h2>
					<p>
						Finish the post-match fields in Collection and submit your report. You can view
						summaries while uploads arrive.
					</p>
					<div class="actions">
						<Button disabled={busy} on:click={() => perform(complete)}>Complete</Button>
					</div>
				</section>
			{:else}<section class="form-section">
					<h2>Session interrupted</h2>
					<p>Start a new session so everyone records the same timeline.</p>
					<div class="actions"><Button on:click={newSession}>New session</Button></div>
				</section>{/if}
		{/if}
		{#if error}<div class="error" role="alert">
				<Icon icon="error" size={20} />
				<p>{error}</p>
				{#if credentials}<Button variant="secondary" on:click={newSession}>Start again</Button>{/if}
			</div>{/if}
	</main>
</div>

<style>
	.training-shell {
		min-height: 100vh;
		background: var(--background);
		color: var(--on-background);
		font-family: Heebo, sans-serif;
	}
	.app-bar {
		height: 64px;
		padding: 0 24px;
		display: flex;
		align-items: center;
		gap: 18px;
		border-bottom: 1px solid var(--light-gray-faded);
	}
	.app-bar a {
		display: flex;
		color: var(--on-background);
		text-decoration: none;
	}
	.app-bar h1 {
		font-size: 24px;
		font-weight: 500;
	}
	.connection {
		margin-left: auto;
		color: var(--body);
		font-size: 14px;
	}
	main {
		max-width: 560px;
		margin: 0 auto;
		padding: 48px 24px;
	}
	main.wide {
		max-width: 1040px;
	}
	h2 {
		font-size: 28px;
		font-weight: 500;
		line-height: 36px;
	}
	h3 {
		font-size: 20px;
		font-weight: 500;
	}
	p {
		color: var(--body);
		font-size: 16px;
		line-height: 24px;
	}
	strong {
		font-weight: 500;
		color: var(--on-background);
	}
	.start {
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding-top: 48px;
	}
	.start p {
		margin-bottom: 8px;
	}
	.form-section {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 7px;
		margin-top: 8px;
	}
	.field :global(.input) {
		width: 100%;
	}
	label {
		font-size: 16px;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		margin-top: 24px;
	}
	.page-heading {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-bottom: 32px;
	}
	.lobby {
		display: grid;
		grid-template-columns: 280px minmax(0, 1fr);
		gap: 48px;
	}
	.qr-section {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.qr-image {
		background: white;
		padding: 8px;
		border-radius: 7px;
	}
	.qr-image img {
		width: 100%;
	}
	.qr-section p,
	.help {
		font-size: 14px;
		line-height: 21px;
	}
	.roster h3 {
		margin-bottom: 16px;
	}
	.scout-row {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 16px 0;
		border-bottom: 1px solid var(--light-gray-faded);
	}
	.scout-info {
		flex: 1;
		min-width: 0;
	}
	.scout-info p,
	.scout-status {
		font-size: 14px;
		color: var(--body);
	}
	.scout-status {
		white-space: nowrap;
	}
	.empty {
		background: var(--secondary-container);
		padding: 24px 16px;
		border-radius: 7px;
	}
	.help {
		margin-top: 20px;
	}
	.report-summary {
		padding: 24px;
		background: var(--secondary-container);
		border-radius: 7px;
		margin-bottom: 20px;
	}
	.summary-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
		margin-bottom: 20px;
	}
	.summary-heading p {
		font-size: 14px;
	}
	.score {
		font-size: 32px;
		color: var(--victory-purple);
		font-weight: 500;
		white-space: nowrap;
	}
	.score span {
		font-size: 16px;
		color: var(--body);
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 15px;
	}
	th,
	td {
		text-align: right;
		padding: 10px 0;
		border-bottom: 1px solid var(--light-gray);
	}
	th {
		color: var(--body);
		font-weight: 400;
	}
	th:first-child,
	td:first-child {
		text-align: left;
	}
	.timeline-result {
		font-size: 14px;
		margin: 16px 0;
	}
	summary {
		color: var(--victory-purple);
		cursor: pointer;
	}
	.feedback {
		margin-top: 16px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.feedback > div {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 14px;
	}
	.muted,
	.message {
		color: var(--body);
	}
	.error {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		padding: 16px;
		margin-top: 24px;
		border: 1px solid var(--danger);
		border-radius: 7px;
	}
	.error :global(.material-symbols-rounded) {
		color: var(--danger);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
	@media (max-width: 700px) {
		main {
			padding: 32px 20px;
		}
		.lobby {
			grid-template-columns: 1fr;
			gap: 32px;
		}
		.qr-section {
			max-width: 280px;
		}
		.app-bar {
			padding: 0 20px;
		}
		.report-summary {
			padding: 18px;
		}
	}
</style>
