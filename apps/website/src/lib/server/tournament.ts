import { z } from 'zod';

const time = z.iso.datetime().nullable();
const alliance = z.enum(['RED', 'BLUE']);

export const tournamentSchema = z.object({
	key: z.string(),
	name: z.string(),
	seasonYear: z.number().int().nullable(),
	district: z.object({ key: z.string(), name: z.string() }).nullable(),
	week: z.number().int().nullable(),
	playoffType: z.number().int().nullable(),
	allianceSelections: z
		.array(
			z.object({
				teams: z.array(z.number().int()),
				backup: z.object({ in: z.number().int(), out: z.number().int() }).nullable()
			})
		)
		.nullable(),
	awards: z
		.array(
			z.object({
				type: z.number().int(),
				name: z.string(),
				recipients: z.array(
					z.object({ teamNumber: z.number().int().nullable(), name: z.string().nullable() })
				)
			})
		)
		.nullable(),
	location: z.string().nullable(),
	startDate: time,
	endDate: time,
	timezone: z.string().nullable(),
	officialDataUpdatedAt: time,
	teams: z.array(
		z.object({
			team: z.object({
				number: z.number().int(),
				name: z.string(),
				avatar: z
					.string()
					.regex(/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/)
					.nullable()
			})
		})
	),
	matches: z.array(
		z.object({
			key: z.string(),
			competitionLevel: z.enum([
				'QUALIFICATION',
				'EIGHTHFINAL',
				'QUARTERFINAL',
				'SEMIFINAL',
				'FINAL'
			]),
			setNumber: z.number().int(),
			matchNumber: z.number().int(),
			displayOrder: z.number().int().nullable(),
			scheduledTime: time,
			predictedTime: time,
			actualTime: time,
			status: z.enum(['SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED']),
			winningAlliance: alliance.nullable(),
			alliances: z.array(z.object({ color: alliance, score: z.number().nullable() })),
			teamSlots: z.array(
				z.object({
					teamNumber: z.number().int(),
					alliance: alliance.nullable(),
					station: z.number().int().nullable(),
					surrogate: z.boolean().nullable(),
					disqualified: z.boolean().nullable()
				})
			)
		})
	),
	gaps: z.array(
		z.object({
			afterMatchKey: z.string(),
			beforeMatchKey: z.string(),
			type: z.enum(['LUNCH', 'OVERNIGHT', 'PLAYOFF_TRANSITION', 'DELAY', 'BREAK']),
			timingSource: z.enum(['ACTUAL', 'SCHEDULED', 'PREDICTED']),
			startTime: z.iso.datetime(),
			endTime: z.iso.datetime()
		})
	)
});
