export type Video = {
	gameYear?: number;
	tournamentName?: string;
	matchType?: string;
	matchNumber?: number;
	uuid: string;
	matchKey: string;
	videoLink: string;
	teamNumber: number;
	startOffsetSeconds: number;
	durationSeconds: number;
	postMatchSeconds?: number;
	alliance: string;
};
export type Participant = {
	uuid: string;
	name: string | null;
	teamNumber: number;
	deviceName: string;
	ready: boolean;
	connected: boolean;
	status: string;
	reportUuid: string | null;
	score: {
		overallScore: number;
		breakdown: {
			rubricVersion?: string;
			quantities: {
				action: string;
				score?: number;
				allowance?: number;
				expected: number;
				actual: number;
				differences?: {
					time: number;
					expected: number;
					actual: number | null;
					allowance?: number;
				}[];
			}[];
			timeline: {
				matched: number;
				expected: number;
				actual: number;
				score?: number;
				toleranceSeconds?: number;
				differences?: {
					action: string;
					position: string;
					expectedTime: number | null;
					actualTime: number | null;
					deltaSeconds: number | null;
				}[];
			};
			fields: { field: string; correct: boolean; expected: unknown; actual: unknown }[];
		};
	} | null;
};
export type Session = {
	uuid: string;
	status: string;
	serverTime: number;
	startedAt: number | null;
	endedAt: number | null;
	video: Video;
	participants: Participant[];
};
export type Credentials = { uuid: string; browserToken: string; pairingToken: string };
