export type TrainingPlayer = {
	playVideo(): void;
	pauseVideo(): void;
	seekTo(seconds: number, allowSeekAhead: boolean): void;
	getCurrentTime(): number;
};
export type PlaybackState = {
	ready: boolean;
	started: boolean;
	ending: boolean;
	busy: boolean;
	finishFailed: boolean;
	interruptFailed: boolean;
};
type Options = {
	offset: number;
	duration: number;
	postMatchSeconds: number;
	onPlaying: () => Promise<void>;
	onEnded: () => Promise<void>;
	onInterrupted: (playbackSeconds: number) => Promise<void>;
	onError: (message: string) => void;
	onState: (state: PlaybackState) => void;
	onProgress?: (seconds: number) => void;
	now?: () => number;
};

/** Playback time and report time are separate: the tail never starts another
 * match or extends the report. All mutations can be retried after reconnect. */
export function createTrainingPlayback(o: Options) {
	const state: PlaybackState = {
		ready: false,
		started: false,
		ending: false,
		busy: false,
		finishFailed: false,
		interruptFailed: false
	};
	let player: TrainingPlayer | undefined,
		disposed = false,
		playRequested = false,
		lastTime = 0,
		stallSince: number | null = null,
		interruptedSeconds = 0,
		startInterrupted = false;
	const now = o.now ?? Date.now;
	const emit = () => {
		if (!disposed) o.onState({ ...state });
	};
	async function finish() {
		if (disposed || state.busy) return;
		state.ending = true;
		state.busy = true;
		state.finishFailed = false;
		emit();
		try {
			await o.onEnded();
		} catch {
			if (!disposed) {
				state.finishFailed = true;
				o.onError('Could not finish the session. Reconnect and retry.');
			}
		} finally {
			state.busy = false;
			emit();
		}
	}
	async function interrupt() {
		if (disposed || !state.started || state.ending) return;
		const observed = player?.getCurrentTime() ?? o.offset;
		interruptedSeconds = Number.isFinite(observed)
			? Math.max(0, observed - o.offset)
			: Math.max(0, lastTime - o.offset);
		state.ending = true;
		player?.pauseVideo();
		await retryInterrupt();
	}
	async function retryInterrupt() {
		if (disposed || state.busy) return;
		state.busy = true;
		state.interruptFailed = false;
		emit();
		try {
			await o.onInterrupted(interruptedSeconds);
			if (!disposed)
				o.onError(
					interruptedSeconds >= o.duration
						? 'Post-match playback stopped. Your completed match is preserved.'
						: 'Playback was interrupted. Start a new session so every report uses the same timeline.'
				);
		} catch {
			if (!disposed) {
				state.interruptFailed = true;
				o.onError('Could not save the playback interruption. Reconnect and retry.');
			}
		} finally {
			state.busy = false;
			emit();
		}
	}
	return {
		ready(p: TrainingPlayer) {
			if (disposed) return;
			player = p;
			state.ready = true;
			player.pauseVideo();
			player.seekTo(o.offset, true);
			emit();
		},
		play(enabled: boolean) {
			if (disposed || !enabled || !player || !state.ready || state.busy || state.ending) return;
			playRequested = true;
			player.playVideo();
		},
		async changed(data: number) {
			if (disposed || !player) return;
			if (state.busy && !state.started && (data === 0 || data === 2)) startInterrupted = true;
			if (data === 1 && !state.started && !state.ending && !state.busy) {
				if (!playRequested) {
					player.pauseVideo();
					return;
				}
				state.busy = true;
				emit();
				try {
					await o.onPlaying();
					if (disposed) return;
					state.started = true;
					lastTime = player.getCurrentTime();
					stallSince = null;
					if (startInterrupted || lastTime > o.offset + 2) {
						state.busy = false;
						await interrupt();
					}
				} catch {
					if (!disposed) {
						state.started = true;
						state.busy = false;
						await interrupt();
					}
				} finally {
					state.busy = false;
					emit();
				}
			} else if (data === 2 && state.started && !state.ending) {
				await interrupt();
			} else if (data === 0 && state.started && !state.ending) {
				if (player.getCurrentTime() >= o.offset + o.duration + o.postMatchSeconds - 1)
					await finish();
				else await interrupt();
			}
		},
		tick() {
			if (disposed || !state.started || state.ending || !player) return;
			const current = player.getCurrentTime();
			if (current >= o.offset + o.duration + o.postMatchSeconds) {
				state.ending = true;
				player.pauseVideo();
				void finish();
				return;
			}
			if (!Number.isFinite(current) || current < lastTime - 0.5 || current > lastTime + 2) {
				void interrupt();
				return;
			}
			if (current <= lastTime) {
				stallSince ??= now();
				if (now() - stallSince > 1500) void interrupt();
			} else {
				stallSince = null;
			}
			lastTime = current;
			o.onProgress?.(Math.max(0, current - o.offset));
		},
		fail() {
			if (state.busy && !state.started) startInterrupted = true;
			if (state.started) void interrupt();
		},
		retryFinish: finish,
		retryInterrupt,
		stop() {
			disposed = true;
			state.ending = true;
			player = undefined;
		}
	};
}
