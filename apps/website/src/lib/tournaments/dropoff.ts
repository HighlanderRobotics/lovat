export type RankedPoints = { rank: number; points: number };

export type ExponentialFit = {
	amplitude: number;
	rate: number;
	origin: number;
	end: number;
	rSquared: number | null;
};

export function predictExponential(fit: ExponentialFit, rank: number): number {
	return fit.amplitude * Math.exp(fit.rate * (rank - fit.origin));
}

// Fit y = a * exp(b * (rank - origin)) by least squares in points, including zeros.
// For each decay rate, the optimal amplitude has a closed-form solution.
export function exponentialFit(points: RankedPoints[]): ExponentialFit | null {
	const valid = points
		.filter(
			(point) => Number.isFinite(point.rank) && Number.isFinite(point.points) && point.points >= 0
		)
		.sort((a, b) => a.rank - b.rank);
	const ranks = [...new Set(valid.map((point) => point.rank))];

	if (ranks.length < 2) return null;

	const scale = Math.max(...valid.map((point) => point.points));
	if (scale === 0) return null;

	const origin = ranks[0];
	const end = ranks[ranks.length - 1];
	const span = end - origin;
	const gap = Math.min(...ranks.slice(1).map((rank, index) => rank - ranks[index]));
	const samples = valid.map((point) => ({ x: point.rank - origin, y: point.points / scale }));
	const mean = samples.reduce((sum, point) => sum + point.y, 0) / samples.length;
	const variation = samples.reduce((sum, point) => sum + (point.y - mean) ** 2, 0);

	const score = (rate: number) => {
		let numerator = 0;
		let denominator = 0;

		for (const point of samples) {
			const basis = Math.exp(rate * point.x);
			numerator += point.y * basis;
			denominator += basis * basis;
		}

		const amplitude = numerator / denominator;
		const error = samples.reduce(
			(sum, point) => sum + (point.y - amplitude * Math.exp(rate * point.x)) ** 2,
			0
		);

		return { rate, amplitude, error };
	};

	// Search a range of decay scales before refining the best interval.
	const rates = [0];
	for (let magnitude = 1e-6 / span; magnitude < 40 / gap; magnitude *= 2) rates.push(-magnitude);
	rates.push(-40 / gap);

	const candidates = rates.map(score);
	let bestIndex = 0;
	for (let index = 1; index < candidates.length; index++) {
		if (candidates[index].error < candidates[bestIndex].error) bestIndex = index;
	}

	let best = candidates[bestIndex];
	let lower = rates[Math.min(bestIndex + 1, rates.length - 1)];
	let upper = rates[Math.max(bestIndex - 1, 0)];
	const ratio = (Math.sqrt(5) - 1) / 2;
	let left = score(upper - ratio * (upper - lower));
	let right = score(lower + ratio * (upper - lower));

	for (let iteration = 0; iteration < 80; iteration++) {
		if (left.error < best.error) best = left;
		if (right.error < best.error) best = right;

		if (left.error < right.error) {
			upper = right.rate;
			right = left;
			left = score(upper - ratio * (upper - lower));
		} else {
			lower = left.rate;
			left = right;
			right = score(lower + ratio * (upper - lower));
		}
	}

	return {
		amplitude: best.amplitude * scale,
		rate: best.rate,
		origin,
		end,
		rSquared: variation > 1e-20 ? 1 - best.error / variation : null
	};
}

export function topCohorts<T extends RankedPoints>(ranked: T[]) {
	return Array.from({ length: 4 }, (_, index) => {
		const members = ranked.slice(index * 8, (index + 1) * 8);
		if (!members.length) return null;

		return {
			index,
			start: index * 8 + 1,
			end: index * 8 + members.length,
			average: members.reduce((sum, team) => sum + team.points, 0) / members.length
		};
	}).filter((cohort) => cohort !== null);
}
