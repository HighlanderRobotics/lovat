<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from 'magnolia-ui-svelte';
	export let url: string;
	export let offset = 0;
	export let duration = 163;
	export let onPlaying: () => Promise<void>;
	export let onEnded: () => Promise<void>;
	export let onInterrupted: () => Promise<void>;
	export let onError: (message: string) => void;
	type Player = {
		playVideo(): void;
		pauseVideo(): void;
		getCurrentTime(): number;
		destroy(): void;
	};
	type API = { Player: new (element: HTMLElement, options: Record<string, unknown>) => Player };
	let mount: HTMLDivElement;
	let ready = false,
		started = false,
		ending = false;
	let player: Player | undefined;
	let busy = false;
	let finishFailed = false;
	async function finish() {
		ending = true;
		finishFailed = false;
		try {
			await onEnded();
		} catch {
			finishFailed = true;
			onError('Could not finish the session. Reconnect and retry.');
		}
	}
	let timer: ReturnType<typeof setInterval>;
	let lastTime = 0;
	let stallSince = 0;
	const interrupt = async () => {
		if (!started || ending) return;
		ending = true;
		player?.pauseVideo();
		await onInterrupted().catch(() => undefined);
		onError(
			'Playback was interrupted. Start a new session so every report uses the same timeline.'
		);
	};
	onMount(() => {
		let disposed = false;
		const win = window as Window & { YT?: API; onYouTubeIframeAPIReady?: () => void };
		const init = () => {
			if (disposed || !win.YT) return;
			const parsed = new URL(url);
			const videoId =
				parsed.hostname === 'youtu.be' ? parsed.pathname.slice(1) : parsed.searchParams.get('v');
			if (!videoId || !/^[\w-]{11}$/.test(videoId)) {
				onError('This exercise needs a valid YouTube video link.');
				return;
			}
			player = new win.YT.Player(mount, {
				width: '100%',
				height: '100%',
				videoId,
				playerVars: {
					controls: 0,
					disablekb: 1,
					playsinline: 1,
					start: offset,
					origin: window.location.origin,
					rel: 0
				},
				events: {
					onReady: () => {
						ready = true;
					},
					onError: () => {
						onError('YouTube could not play this video. Check that embedding is allowed.');
						void interrupt();
					},
					onStateChange: async ({ data }: { data: number }) => {
						if (disposed) return;
						if (data === 1 && !started && !ending && !busy) {
							busy = true;
							try {
								await onPlaying();
								started = true;
								lastTime = player?.getCurrentTime() ?? offset;
							} catch {
								ending = true;
								player?.pauseVideo();
								onError('Could not start recording. Start a new session.');
							} finally {
								busy = false;
							}
						} else if (data === 2 && started && !ending) {
							void interrupt();
						} else if (data === 0 && started && !ending) {
							if ((player?.getCurrentTime() ?? 0) >= offset + duration - 1) {
								ending = true;
								void finish();
							} else {
								void interrupt();
							}
						}
					}
				}
			});
			timer = setInterval(() => {
				if (!started || ending || !player) return;
				const current = player.getCurrentTime();
				if (current >= offset + duration) {
					ending = true;
					player.pauseVideo();
					void finish();
					return;
				}
				if (current < lastTime - 0.5 || current > lastTime + 2) {
					void interrupt();
					return;
				}
				if (current <= lastTime) {
					stallSince ||= Date.now();
					if (Date.now() - stallSince > 1500) void interrupt();
				} else {
					stallSince = 0;
				}
				lastTime = current;
			}, 250);
		};
		if (win.YT) init();
		else {
			win.onYouTubeIframeAPIReady = init;
			if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
				const script = document.createElement('script');
				script.src = 'https://www.youtube.com/iframe_api';
				script.onerror = () => onError('Could not load YouTube. Check your connection.');
				document.head.append(script);
			}
		}
		return () => {
			disposed = true;
			ending = true;
			clearInterval(timer);
			player?.destroy();
		};
	});
</script>

<div class="player"><div bind:this={mount}></div></div>
{#if !started && !ending}
	<div class="play-action">
		<Button disabled={!ready || busy} on:click={() => player?.playVideo()}
			>{ready ? 'Play video' : 'Loading video…'}</Button
		>
	</div>
{/if}
{#if finishFailed}<div class="play-action">
		<Button on:click={() => finish()}>Retry finishing session</Button>
	</div>{/if}

<style>
	.player {
		width: 100%;
		aspect-ratio: 16/9;
		background: var(--secondary-container);
		border-radius: 7px;
		overflow: hidden;
	}
	.play-action {
		margin-top: 20px;
	}
</style>
