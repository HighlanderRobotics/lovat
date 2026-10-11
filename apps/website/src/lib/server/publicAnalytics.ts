import { z } from 'zod';
import { env } from '$env/dynamic/private';

export const publicMatchSchema = z.object({
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

export const metricsSchema = z.object({
	metrics: z
		.object({
			matches: z.number().int().positive(),
			points: z.number().finite(),
			auto: z.number().finite(),
			teleop: z.number().finite()
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
	schema: z.ZodType<T>
): Promise<T> {
	if (!env.LOVAT_API_BASE) throw new Error('Public data unavailable');

	const response = await fetcher(`${env.LOVAT_API_BASE}/v1/public/${path}`, {
		credentials: 'omit',
		signal: AbortSignal.timeout(20_000)
	});

	if (!response.ok) throw new Error('Public data unavailable');

	return schema.parse(await response.json());
}
