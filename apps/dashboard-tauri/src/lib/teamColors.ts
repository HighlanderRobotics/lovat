// Primary brand colors from the public FRC Colors API, cached for an hour.

const cache = new Map<string, { created: number; result: Promise<string | null> }>();

export function teamPrimaryColor(team: string): Promise<string | null> {
	if (!/^\d+$/.test(team)) return Promise.resolve(null);
	const existing = cache.get(team);
	if (existing && Date.now() - existing.created < 3_600_000) return existing.result;
	if (cache.size >= 512) cache.delete(cache.keys().next().value!);
	const result = (async () => {
		try {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), 5000);
			const response = await fetch(`https://api.frc-colors.com/v1/team/${team}`, { signal: controller.signal });
			clearTimeout(timer);
			if (!response.ok) return null;
			const json = await response.json();
			const hex = json?.primaryHex;
			return typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : null;
		} catch {
			return null;
		}
	})();
	cache.set(team, { created: Date.now(), result });
	return result;
}
