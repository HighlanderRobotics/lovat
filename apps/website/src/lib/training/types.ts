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
			quantities: {
				action: string;
				score?: number;
				expected: number;
				actual: number;
				differences?: { time: number; expected: number; actual: number | null }[];
			}[];
			timeline: { matched: number; expected: number; actual: number };
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
