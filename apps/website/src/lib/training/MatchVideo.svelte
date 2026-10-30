<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from 'magnolia-ui-svelte';
	import { createTrainingPlayback, type TrainingPlayer, type PlaybackState } from './playback';
	export let url: string;
	export let playEnabled = true;
	export let showPlay = true;
	export let offset = 0;
	export let duration = 163;
	export let postMatchSeconds = 15;
	export let onProgress: (seconds: number) => void = () => {};
	export let onPlaying: () => Promise<void>;
	export let onEnded: () => Promise<void>;
	export let onInterrupted: (playbackSeconds: number) => Promise<void>;
	export let onError: (message: string) => void;
	type Player = TrainingPlayer & { destroy(): void };
	type API = { Player: new (element: HTMLElement, options: Record<string, unknown>) => Player };
	let mount: HTMLDivElement, player: Player | undefined;
	let state: PlaybackState = {
		ready: false,
		started: false,
		ending: false,
		busy: false,
		finishFailed: false,
		interruptFailed: false
	};
	let playback: ReturnType<typeof createTrainingPlayback> | undefined;
	onMount(() => {
		let disposed = false;
		playback = createTrainingPlayback({
			offset,
			duration,
			postMatchSeconds,
			onPlaying,
			onEnded,
			onInterrupted,
			onError,
			onProgress,
			onState: (value) => {
				state = value;
			}
		});
		const win = window as Window & { YT?: API; onYouTubeIframeAPIReady?: () => void };
		const init = () => {
			if (disposed || !win.YT) return;
			const parsed = new URL(url),
				videoId =
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
						if (!disposed && player) playback?.ready(player);
					},
					onError: () => {
						if (!disposed) {
							onError('YouTube could not play this video. Check that embedding is allowed.');
							playback?.fail();
						}
					},
					onStateChange: ({ data }: { data: number }) => {
						if (!disposed) void playback?.changed(data);
					}
				}
			});
		};
		if (win.YT) init();
		else {
			win.onYouTubeIframeAPIReady = init;
			if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
				const script = document.createElement('script');
				script.src = 'https://www.youtube.com/iframe_api';
				script.onerror = () => {
					if (!disposed) onError('Could not load YouTube. Check your connection.');
				};
				document.head.append(script);
			}
		}
		const timer = setInterval(() => playback?.tick(), 250);
		return () => {
			disposed = true;
			clearInterval(timer);
			playback?.stop();
			player?.destroy();
		};
	});
</script>

<div class="player"><div bind:this={mount}></div></div>
{#if showPlay && !state.started && !state.ending}<div class="play-action">
		<Button
			disabled={!state.ready || state.busy || !playEnabled}
			on:click={() => playback?.play(playEnabled)}>{!state.ready ? 'Loading…' : 'Play'}</Button
		>
	</div>{/if}
{#if state.finishFailed}<div class="play-action">
		<Button disabled={state.busy} on:click={() => playback?.retryFinish()}
			>Retry finishing session</Button
		>
	</div>{/if}
{#if state.interruptFailed}<div class="play-action">
		<Button disabled={state.busy} on:click={() => playback?.retryInterrupt()}
			>Retry saving interruption</Button
		>
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
		position: absolute;
		right: 35px;
		bottom: 24px;
	}
</style>
