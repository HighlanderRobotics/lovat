export interface Team {
	name: string;
	number: number;
}

export interface Scout {
	name: string;
	id: string;
}

export function scoutFromJson(json: { name: string; uuid: string }): Scout {
	return { name: json.name, id: json.uuid };
}

export type UserRole = 'ANALYST' | 'SCOUTING_LEAD';

export const userRoleNames: Record<UserRole, string> = {
	ANALYST: 'Analyst',
	SCOUTING_LEAD: 'Scouting Lead'
};

export interface LovatUserProfile {
	email: string;
	username?: string | null;
	team?: Team | null;
	role?: UserRole | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function userProfileFromJson(json: any): LovatUserProfile {
	return {
		email: json.email,
		username: json.username,
		team: json.team ? { name: json.team.team.name, number: json.team.team.number } : null,
		role: json.role ?? null
	};
}

export enum RobotRole {
	cycling,
	scoring,
	feeding,
	defending,
	immobile
}

export const robotRoleNames = ['Cycling', 'Scoring', 'Feeding', 'Defending', 'Immobile'];
export const robotRoleIcons = ['loop', 'sports_score', 'conveyor_belt', 'shield', 'dangerous'];

export type RegistrationStatus =
	| 'NOT_STARTED'
	| 'PENDING'
	| 'PENDING_EMAIL_VERIFICATION'
	| 'PENDING_WEBSITE'
	| 'PENDING_TEAM_VERIFICATION'
	| 'REGISTERED_OFF_TEAM'
	| 'REGISTERED_ON_TEAM';

export const registrationIsPending = (s: RegistrationStatus) =>
	['PENDING', 'PENDING_EMAIL_VERIFICATION', 'PENDING_TEAM_VERIFICATION'].includes(s);

export const registrationIsOnTeam = (s: RegistrationStatus) =>
	['PENDING_EMAIL_VERIFICATION', 'PENDING_WEBSITE', 'PENDING_TEAM_VERIFICATION', 'REGISTERED_ON_TEAM'].includes(s);

export interface RegistrationStatusResponse {
	status: RegistrationStatus;
	teamEmail: string | null;
}
