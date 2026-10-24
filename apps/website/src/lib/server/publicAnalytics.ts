import { z } from 'zod';
import { env } from '$env/dynamic/private';

const coverageSchema = z.object({
	reported: z.number().int().nonnegative(),
	expected: z.number().int().nonnegative(),
	complete: z.boolean()
});

export const publicMatchSchema = z.object({
	coverage: coverageSchema.optional(),
	prediction: z
		.object({
			blueWinning: z.number().finite().min(0).max(1),
			redWinning: z.number().finite().min(0).max(1)
		})
		.refine((p) => Math.abs(p.blueWinning + p.redWinning - 1) < 0.000001)
		.nullable(),
	roles: z.array(
		z.object({
			teamNumber: z.number().int().positive(),
			role: z.enum(['CYCLING', 'SCORING', 'FEEDING', 'DEFENDING', 'IMMOBILE'])
		})
	)
});

export const publicMatchMetricsSchema = z.object({
	teams: z.array(
		z.object({
			teamNumber: z.number().int().positive(),
			alliance: z.enum(['BLUE', 'RED']).nullable(),
			reports: z.number().int().positive(),
			points: z.number().finite().nullable(),
			auto: z.number().finite().nullable(),
			teleop: z.number().finite().nullable(),
			fuelOutput: z.number().finite().nullable(),
			fuelFed: z.number().finite().nullable(),
			defenseSeconds: z.number().finite().nullable()
		})
	)
});

export const metricsSchema = z.object({
	metrics: z
		.object({
			matches: z.number().int().positive(),
			points: z.number().finite(),
			auto: z.number().finite(),
			teleop: z.number().finite(),
			percentiles: z
				.object({
					points: z.number().finite().min(0).max(100).nullable(),
					auto: z.number().finite().min(0).max(100).nullable(),
					teleop: z.number().finite().min(0).max(100).nullable()
				})
				.optional()
		})
		.nullable()
});
export const photoSchema = z.object({
	photo: z
		.object({
			image: z
				.string()
				.url()
				.refine((value) => {
					const url = new URL(value);
					return (
						url.protocol === 'https:' &&
						!url.username &&
						!url.password &&
						(url.hostname === 'i.imgur.com' ||
							url.hostname === 'photos.smugmug.com' ||
							url.hostname.endsWith('.smugmug.com'))
					);
				}),
			source: z.string().regex(/^https:\/\/www\.thebluealliance\.com\/team\/\d+\/\d{4}$/)
		})
		.nullable()
});

export async function fetchPublic<T>(
	fetcher: typeof fetch,
	path: string,
	schema: z.ZodType<T>,
	timeoutMs = 20_000
): Promise<T> {
	if (!env.LOVAT_API_BASE) throw new Error('Public data unavailable');

	const response = await fetcher(`${env.LOVAT_API_BASE}/v1/public/${path}`, {
		credentials: 'omit',
		signal: AbortSignal.timeout(timeoutMs)
	});

	if (!response.ok) throw new Error('Public data unavailable');

	return schema.parse(await response.json());
}

export const teamSeriesSchema = z.object({
	matches: z.array(
		z.object({
			matchKey: z.string().nullable(),
			reports: z.number().int().nonnegative().default(1),
			elimination: z.boolean().default(false),
			reportedBroken: z.boolean().default(false),
			coverage: coverageSchema.nullable().default(null),
			eventKey: z.string(),
			eventName: z.string(),
			label: z.string(),
			points: z.number().finite().nullable(),
			auto: z.number().finite().nullable(),
			teleop: z.number().finite().nullable(),
			feeding: z.number().finite().nullable(),
			roles: z.array(z.enum(['CYCLING', 'SCORING', 'FEEDING', 'DEFENDING', 'IMMOBILE']))
		})
	)
});

export const leaderboardSchema = z.object({
	teams: z.array(
		z.object({
			number: z.number().int().positive(),
			name: z.string(),
			matches: z.number().int().positive(),
			points: z.number().finite(),
			auto: z.number().finite(),
			teleop: z.number().finite()
		})
	)
});

export const tournamentRankingSchema = z.object({
	teams: z.array(
		z.object({
			number: z.number().int().positive(),
			name: z.string(),
			matches: z.number().int().positive(),
			points: z.number().finite()
		})
	)
});
