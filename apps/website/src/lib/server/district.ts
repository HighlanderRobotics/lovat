import { z } from 'zod';

export const districtSchema = z.object({
	key: z.string(),
	name: z.string(),
	abbreviation: z.string(),
	seasonYear: z.number().int(),
	tournaments: z.array(
		z.object({
			key: z.string(),
			week: z.number().int().nullable(),
			eventType: z.number().int().nullable(),
			name: z.string(),
			location: z.string().nullable(),
			startDate: z.iso.datetime().nullable(),
			endDate: z.iso.datetime().nullable()
		})
	),
	teamSeasons: z.array(
		z.object({
			teamNumber: z.number().int(),
			name: z.string(),
			city: z.string().nullable(),
			stateProvince: z.string().nullable()
		})
	)
});
