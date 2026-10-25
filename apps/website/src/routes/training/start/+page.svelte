<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from 'magnolia-ui-svelte';
	import QRCode from 'qrcode';
	import Navbar from '$lib/Navbar.svelte';
	import MatchVideo from '$lib/training/MatchVideo.svelte';
	import TrainingBackdrop from '$lib/training/TrainingBackdrop.svelte';
	import TrainingRoster from '$lib/training/TrainingRoster.svelte';
	import TrainingResults from '$lib/training/TrainingResults.svelte';
	import type { Credentials, Participant, Session, Video } from '$lib/training/types';

	let step: 'start' | 'select' | 'session' | 'summary' = 'start';
	let videos: Video[] = [];
	let selected = '',
		error = '',
		busy = false,
		connected = false,
		qr = '';
	let credentials: Credentials | null = null;
	let session: Session | null = null;
	let socket: WebSocket | undefined;
	let reconnect: ReturnType<typeof setTimeout>;
	let disposed = false;
	let socketUrl = '';
	$: canQueue =
		!!session?.participants.length && session.participants.every((person) => person.connected);
	$: canStart =
		!!session?.participants.length &&
		session.participants.every((person) => person.ready && person.connected);
	$: stage =
		step === 'start'
			? 'start'
			: step === 'select'
				? 'select'
				: step === 'summary'
					? 'results'
					: session?.status === 'LOBBY'
						? 'lobby'
						: session?.status === 'ARMED'
							? 'pre'
							: session?.status === 'PLAYING'
								? 'playing'
								: 'post';

	function videoLabel(video: Video): string {
		const match = video.matchNumber
			? `${video.matchType === 'QUALIFICATION' ? 'Q' : 'Playoff '}${video.matchNumber}`
			: video.matchKey;
		return `${video.teamNumber} in ${match} at ${video.tournamentName ?? video.matchKey.split('_')[0]}`;
	}
	async function api(path: string, method = 'GET', body?: unknown) {
		const response = await fetch(`/training/api/${path}`, {
			method,
			signal: AbortSignal.timeout(15000),
			headers: {
				'Content-Type': 'application/json',
				Authorization: credentials ? `Bearer ${credentials.browserToken}` : ''
			},
			body: body === undefined ? undefined : JSON.stringify(body)
		});
		const data = response.status === 204 ? null : await response.json();
		if (!response.ok) throw new Error(data?.displayError ?? 'Could not update training.');
		return data;
	}
	async function perform(action: () => Promise<void>) {
		if (busy) return;
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
	function closeSocket() {
		clearTimeout(reconnect);
		if (socket) {
			socket.onclose = null;
			socket.onmessage = null;
			socket.close();
			socket = undefined;
		}
		connected = false;
	}
	function connect() {
		if (!credentials || disposed) return;
		closeSocket();
		const active = credentials;
		const next = new WebSocket(socketUrl);
		socket = next;
		next.onopen = () =>
			next.send(JSON.stringify({ sessionUuid: active.uuid, token: active.browserToken }));
		next.onmessage = ({ data }) => {
			if (disposed || socket !== next || credentials?.uuid !== active.uuid) return;
			try {
				const snapshot = JSON.parse(data) as Session;
				if (
					snapshot.uuid !== active.uuid ||
					!Array.isArray(snapshot.participants) ||
					!snapshot.video
				)
					return;
				session = snapshot;
				connected = true;
			} catch {
				error = 'Could not read the training session. Reconnect and try again.';
			}
		};
		next.onclose = ({ code }) => {
			if (disposed || socket !== next || credentials?.uuid !== active.uuid) return;
			connected = false;
			if (code !== 1008) reconnect = setTimeout(connect, 2000);
			else error = 'Session expired or unavailable. Start a new session.';
		};
		next.onerror = () => {
			if (socket === next) connected = false;
		};
	}
	async function control(action: string) {
		if (!credentials) throw new Error('Start a training session first.');
		const uuid = credentials.uuid;
		const updated = await api(`sessions/${uuid}/control`, 'POST', { action });
		if (credentials?.uuid === uuid) {
			session = updated;
			error = '';
		}
	}
	async function createSession() {
		const created = await api('sessions', 'POST', { videoUuid: selected });
		credentials = created;
		try {
			session = await api(`sessions/${created.uuid}`);
			qr = await QRCode.toDataURL(
				`lovat-collection://training/join?session=${created.uuid}&token=${created.pairingToken}`,
				{ width: 280, margin: 2 }
			);
			step = 'session';
			save();
			connect();
		} catch (e) {
			credentials = null;
			session = null;
			throw e;
		}
	}
	async function results() {
		if (!credentials) return;
		await api(`sessions/${credentials.uuid}/grade`, 'POST', {});
		session = await api(`sessions/${credentials.uuid}`);
		step = 'summary';
		save();
	}
	async function remove(person: Participant) {
		if (!credentials) return;
		await api(`sessions/${credentials.uuid}/participants/${person.uuid}`, 'DELETE');
		session = await api(`sessions/${credentials.uuid}`);
	}
	async function newSession() {
		if (credentials && session?.status !== 'ENDED' && session?.status !== 'INTERRUPTED')
			await control('interrupt');
		closeSocket();
		credentials = null;
		session = null;
		qr = '';
		error = '';
		step = 'select';
		sessionStorage.removeItem('lovat-training');
	}
	function back() {
		if (busy) return;
		if (step === 'select') step = 'start';
		else if (step === 'summary') {
			step = 'session';
			save();
		} else void perform(newSession);
	}
	onMount(() => {
		disposed = false;
		void perform(async () => {
			({ socketUrl } = await api('config'));
			videos = await api('videos?gameYear=2023');
			selected = videos[0]?.uuid ?? '';
			const stored = sessionStorage.getItem('lovat-training');
			if (stored) {
				try {
					const saved = JSON.parse(stored);
					if (!saved.credentials?.uuid || !saved.credentials?.browserToken)
						throw new Error('Invalid saved session.');
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
					connect();
				} catch {
					credentials = null;
					session = null;
					sessionStorage.removeItem('lovat-training');
					error = 'The previous session is unavailable. Start a new session.';
				}
			}
		});
		return () => {
			disposed = true;
			closeSocket();
		};
	});
</script>

<svelte:head
	><title>Training | Lovat</title><meta
		name="description"
		content="Practice scouting Charged Up with your team and compare reports."
	/></svelte:head
>

<div class="training-shell" class:results-page={stage === 'results'}>
	<TrainingBackdrop {stage} />
	{#if step === 'start'}<Navbar training />{/if}
	{#if step !== 'start' && stage !== 'pre' && stage !== 'playing'}
		<button class="back" on:click={back} disabled={busy}
			><img src="/assets/training/back.svg" width="18" height="18" alt="" />Back</button
		>
	{/if}
	{#if session && !connected}<p class="connection" role="status">Reconnecting…</p>{/if}
	<main>
		{#if step === 'start'}
			<h1 class="start-title">Lovat Training</h1>
			<div class="bottom-action start-action">
				<Button disabled={busy} on:click={() => (step = 'select')}>Start Practicing</Button>
			</div>
		{:else if step === 'select'}
			<section class="selection">
				<h1>Choose a match</h1>
				<div class="match-list" role="radiogroup" aria-label="Training match">
					{#each videos as video}<label class:selected={selected === video.uuid}
							><input
								type="radio"
								name="training-match"
								value={video.uuid}
								bind:group={selected}
							/><span>{videoLabel(video)}</span></label
						>{/each}
					{#if !videos.length}<p class="empty">
							{busy ? 'Loading matches…' : 'No Charged Up exercises are available yet.'}
						</p>{/if}
				</div>
			</section>
			<div class="bottom-action">
				<Button
					disabled={busy || !videos.some((video) => video.uuid === selected)}
					on:click={() => perform(createSession)}>Next</Button
				>
			</div>
		{:else if session}
			{#if step === 'summary'}
				<section class="results">
					<h1>Results</h1>
					<TrainingResults participants={session.participants} />
					<div class="results-actions">
						<Button variant="secondary" disabled={busy} on:click={() => perform(results)}
							>Refresh results</Button
						><Button disabled={busy} on:click={() => perform(newSession)}>New session</Button>
					</div>
				</section>
			{:else if session.status === 'LOBBY'}
				<section class="lobby">
					<div class="scouts">
						<h1>Scan the code</h1>
						<TrainingRoster
							participants={session.participants}
							onRemove={(person) => perform(() => remove(person))}
						/>{#if !session.participants.length}<p class="empty">
								Waiting for scouts to join in Collection.
							</p>{/if}
					</div>
					<img
						class="qr"
						src={qr}
						width="280"
						height="282"
						alt="Scan to join this training session in Lovat Collection"
					/>
				</section>
				<div class="bottom-action">
					<Button
						disabled={!canQueue || !connected || busy}
						on:click={() => perform(() => control('arm'))}>Next</Button
					>
				</div>
			{:else if session.status === 'ARMED' || session.status === 'PLAYING'}
				<section class="video-section" class:playing={session.status === 'PLAYING'}>
					<div class="video-frame">
						<MatchVideo
							url={session.video.videoLink}
							offset={session.video.startOffsetSeconds}
							duration={session.video.durationSeconds}
							playEnabled={canStart && connected}
							showPlay={session.status === 'ARMED'}
							onPlaying={() => control('play')}
							onEnded={() => control('end')}
							onInterrupted={() => control('interrupt')}
							onError={(message) => (error = message)}
						/>
					</div>
					{#if session.status === 'ARMED'}<div class="robot">
							<span class:blue={session.video.alliance === 'BLUE'}>{session.video.teamNumber}</span>
							<p>Pre-match</p>
						</div>{/if}
				</section>
			{:else if session.status === 'ENDED'}
				<section class="post-match">
					<h1>Submit your reports</h1>
					<TrainingRoster participants={session.participants} submitted columns={3} />
				</section>
				<div class="bottom-action">
					<Button disabled={busy} on:click={() => perform(results)}>View Results</Button>
				</div>
			{:else}<section class="interrupted">
					<h1>Session interrupted</h1>
					<p>Start a new session so everyone records the same timeline.</p>
					<Button disabled={busy} on:click={() => perform(newSession)}>New session</Button>
				</section>{/if}
		{/if}
		{#if error}<div class="error" role="alert">
				<p>{error}</p>
				{#if !credentials}<Button
						variant="secondary"
						disabled={busy}
						on:click={() => location.reload()}>Retry</Button
					>{:else}<Button variant="secondary" disabled={busy} on:click={() => perform(newSession)}
						>Start again</Button
					>{/if}
			</div>{/if}
	</main>
</div>

<style>
	.training-shell {
		position: relative;
		min-height: max(553px, 100svh);
		color: var(--on-background);
		background: linear-gradient(180deg, transparent, #1f1f1f 69.686%), #1f1f1f;
		font-family: Heebo, sans-serif;
		isolation: isolate;
	}
	.results-page {
		min-height: max(972px, 100svh);
	}
	main {
		position: relative;
		z-index: 1;
		min-height: inherit;
	}
	.training-shell:has(.start-title) main {
		min-height: max(488px, calc(100svh - 65px));
	}
	h1 {
		font-size: 40px;
		font-weight: 500;
		line-height: 50px;
		color: white;
		margin: 0;
	}
	.start-title {
		position: absolute;
		left: 61px;
		bottom: 45px;
		font-size: 60px;
	}
	.bottom-action {
		position: absolute;
		right: 35px;
		bottom: 24px;
	}
	.start-action {
		right: 28px;
	}
	.start-action :global(button) {
		width: 141px;
		height: 44px;
		padding-left: 0;
		padding-right: 0;
	}
	.back {
		position: absolute;
		top: 15px;
		left: 17px;
		z-index: 3;
		display: inline-flex;
		align-items: center;
		gap: 0;
		padding: 0;
		border: none;
		background: none;
		color: var(--on-background);
		font:
			500 14px Heebo,
			sans-serif;
		cursor: pointer;
	}
	.back:disabled {
		opacity: 0.5;
	}
	.connection {
		position: absolute;
		z-index: 3;
		top: 57px;
		right: 35px;
		font-size: 12px;
		color: #cac4d0;
	}
	.selection {
		position: absolute;
		left: 50px;
		bottom: 40px;
		width: min(558px, calc(100% - 100px));
	}
	.selection h1 {
		margin-bottom: 21px;
	}
	.match-list {
		height: 140px;
		border-radius: 7px;
		overflow-y: auto;
		background: var(--secondary-container);
	}
	.match-list label {
		display: flex;
		min-height: 39px;
		padding: 8px 14px;
		font-size: 16px;
		line-height: 23px;
		color: #ccc;
		cursor: pointer;
	}
	.match-list label.selected {
		color: #1f1f1f;
		background: var(--victory-purple);
		font-weight: 500;
	}
	.match-list input {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
	}
	.match-list label:focus-within {
		outline: 2px solid white;
		outline-offset: -2px;
	}
	.lobby {
		display: grid;
		grid-template-columns: minmax(0, 476px) 280px;
		gap: clamp(24px, 10.38vw, 108px);
		padding: 129px 70px 70px 69px;
	}
	.lobby h1 {
		margin-bottom: 14px;
	}
	.scouts {
		min-width: 0;
	}
	.qr {
		border-radius: 7px;
		background: white;
		margin-top: 2px;
	}
	.empty {
		font-size: 14px;
		padding: 12px 14px;
		color: #cac4d0;
	}
	.post-match {
		padding: 103px 101px 100px;
	}
	.post-match h1 {
		margin-bottom: 23px;
	}
	.post-match :global(.roster) {
		margin: 0 37px;
	}
	.results {
		padding: 155px 11.35% 60px;
	}
	.results h1 {
		margin-bottom: -15px;
	}
	.results-actions {
		display: flex;
		justify-content: flex-end;
		gap: 12px;
		margin-top: 24px;
	}
	.video-section {
		padding: 26px 127px 0 33px;
	}
	.video-section.playing {
		padding: 13px 54px 10px 51px;
	}
	.video-frame {
		aspect-ratio: 880 / 497;
	}
	.playing .video-frame {
		aspect-ratio: 935 / 530;
	}
	.video-frame :global(.player) {
		height: 100%;
		aspect-ratio: auto;
	}
	.robot {
		position: absolute;
		top: 16px;
		right: 35px;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
		font-size: 14px;
		color: #cac4d0;
	}
	.robot span {
		border-radius: 4px;
		padding: 3px 6px;
		font-size: 12px;
		line-height: 16px;
		letter-spacing: 0.5px;
		font-weight: 500;
		background: #d87f7f;
		color: #773636;
	}
	.robot span.blue {
		background: #7f8fd8;
		color: #364077;
	}
	.interrupted {
		padding: 129px 10%;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 20px;
	}
	.error {
		position: absolute;
		bottom: 80px;
		left: 35px;
		right: 35px;
		padding: 12px 16px;
		max-width: 700px;
		background: #563333;
		border-radius: 7px;
		display: flex;
		align-items: center;
		gap: 16px;
		font-size: 14px;
	}
	@media (min-width: 1300px) {
		.lobby {
			max-width: 1040px;
			margin: auto;
		}
		.video-section {
			max-width: 1300px;
			margin: auto;
		}
	}
	@media (max-width: 750px) {
		h1 {
			font-size: 32px;
			line-height: 42px;
		}
		.start-title {
			left: 24px;
			bottom: 104px;
			font-size: 44px;
		}
		.selection {
			left: 24px;
			bottom: 100px;
			width: calc(100% - 48px);
		}
		.bottom-action {
			right: 24px;
		}
		.lobby {
			display: flex;
			flex-direction: column-reverse;
			padding: 75px 36px 95px;
			gap: 24px;
		}
		.qr {
			align-self: center;
			max-width: 100%;
			height: auto;
		}
		.post-match {
			padding: 100px 36px;
		}
		.post-match :global(.roster) {
			margin: 0;
		}
		.results {
			padding: 100px 24px 60px;
		}
		.results-actions {
			flex-wrap: wrap;
		}
		.video-section,
		.video-section.playing {
			padding: 90px 16px 90px;
		}
	}
</style>
