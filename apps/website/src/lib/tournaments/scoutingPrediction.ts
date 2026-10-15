import { browser } from '$app/environment';
import { scoutingSession } from '$lib/scoutingSession';

type Prediction = { blueWinning: number; redWinning: number } | null;

const cache = new Map<string, Promise<Prediction>>();
let currentRevision = -1;
let active = 0;
const queue: (() => void)[] = [];

if (browser) {
	scoutingSession.subscribe(({ revision }) => {
		cache.clear();
		currentRevision = revision;
	});
}

export async function getPrediction(
	revision: number,
	blue: number[],
	red: number[],
	token: () => Promise<string>
) {
	if (revision !== currentRevision) {
		cache.clear();
		currentRevision = revision;
	}

	const key = JSON.stringify([
		revision,
		[...blue].sort((a, b) => a - b),
		[...red].sort((a, b) => a - b)
	]);
	const existing = cache.get(key);

	if (existing) return existing;

	const result = (async () => {
		if (active >= 2) await new Promise<void>((resolve) => queue.push(resolve));

		active++;

		try {
			if (currentRevision !== revision) return null;

			const authorization = `Bearer ${await token()}`;

			if (currentRevision !== revision) return null;

			const response = await fetch('/api/prediction', {
				method: 'POST',
				headers: { authorization, 'content-type': 'application/json' },
				body: JSON.stringify({ blue, red }),
				signal: AbortSignal.timeout(25_000)
			});

			if (!response.ok) throw new Error('Prediction unavailable');

			const result: { prediction: Prediction } = await response.json();

			return result.prediction;
		} finally {
			active--;
			queue.shift()?.();
		}
	})();

	if (cache.size >= 500) cache.delete(cache.keys().next().value!);

	cache.set(key, result);
	result.catch(() => {
		if (cache.get(key) === result) cache.delete(key);
	});

	return result;
}
