export type PublicAnalysis = {
	coverage?: { reported: number; expected: number; complete: boolean };
	prediction: { blueWinning: number; redWinning: number } | null;
	roles: { teamNumber: number; role: string }[];
};

const cache = new Map<string, { expires: number; result: Promise<PublicAnalysis> }>();
let active = 0;
const queue: (() => void)[] = [];

export function publicAnalysis(key: string): Promise<PublicAnalysis> {
	const existing = cache.get(key);

	if (existing && existing.expires > Date.now()) return existing.result;

	const result = (async () => {
		if (active >= 2) await new Promise<void>((resolve) => queue.push(resolve));
		else active++;

		try {
			const response = await fetch(`/api/public/matches/${encodeURIComponent(key)}`, {
				signal: AbortSignal.timeout(25_000)
			});

			if (!response.ok) throw new Error('Prediction unavailable');

			return (await response.json()) as PublicAnalysis;
		} finally {
			const next = queue.shift();

			if (next) next();
			else active--;
		}
	})();

	if (cache.size >= 500) cache.delete(cache.keys().next().value!);

	const entry = { expires: Date.now() + 60_000, result };

	cache.set(key, entry);
	result.catch(() => {
		if (cache.get(key) === entry) cache.delete(key);
	});

	return result;
}
