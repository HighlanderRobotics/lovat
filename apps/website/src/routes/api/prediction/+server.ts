import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { z } from 'zod';
import type { RequestHandler } from './$types';

const teamsSchema = z
	.object({
		blue: z.array(z.number().int().positive().max(2_147_483_647)).length(3),
		red: z.array(z.number().int().positive().max(2_147_483_647)).length(3)
	})
	.refine(({ blue, red }) => new Set([...blue, ...red]).size === 6);

const predictionSchema = z
	.object({
		blueWinning: z.number().finite().min(0).max(1),
		redWinning: z.number().finite().min(0).max(1)
	})
	.refine(({ blueWinning, redWinning }) => Math.abs(blueWinning + redWinning - 1) < 0.000001);

export const POST: RequestHandler = async ({ request, fetch, url }) => {
	const reply = (body: unknown, status = 200) =>
		json(body, {
			status,
			headers: { 'cache-control': 'private, no-store', vary: 'Authorization' }
		});

	if (request.headers.get('origin') !== url.origin) return reply({ error: 'Forbidden' }, 403);

	const authorization = request.headers.get('authorization');

	if (!authorization?.match(/^Bearer [A-Za-z0-9._~-]+$/))
		return reply({ error: 'Sign in required' }, 401);
	if (!env.LOVAT_API_BASE) return reply({ error: 'Predictions unavailable' }, 503);

	let teams: z.infer<typeof teamsSchema>;

	try {
		const body = await request.text();

		if (body.length > 2048) return reply({ error: 'Invalid teams' }, 400);

		teams = teamsSchema.parse(JSON.parse(body));
	} catch {
		return reply({ error: 'Invalid teams' }, 400);
	}

	const query = new URLSearchParams();

	for (const color of ['blue', 'red'] as const) {
		teams[color].forEach((team, index) => query.set(`${color}${index + 1}`, String(team)));
	}

	try {
		const response = await fetch(`${env.LOVAT_API_BASE}/v1/analysis/matchprediction?${query}`, {
			headers: { authorization },
			signal: AbortSignal.timeout(20_000)
		});

		if (response.status === 401 || response.status === 403)
			return reply({ error: 'Sign in required' }, 401);
		if (!response.ok) return reply({ error: 'Predictions unavailable' }, 503);

		const body = await response.text();

		if (body === 'not enough data') return reply({ prediction: null });

		const prediction = predictionSchema.safeParse(JSON.parse(body));

		if (!prediction.success) return reply({ prediction: null });

		// Return only probabilities, never the private alliance analysis payload.
		return reply({ prediction: prediction.data });
	} catch {
		return reply({ error: 'Predictions unavailable' }, 503);
	}
};
