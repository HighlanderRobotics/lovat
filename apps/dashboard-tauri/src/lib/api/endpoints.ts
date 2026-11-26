// Every Lovat Server call the Dashboard makes. Paths, query strings, bodies
// and status handling mirror apps/dashboard/lib/reusable/lovat_api.
/* eslint-disable @typescript-eslint/no-explicit-any */

import { AutoPath } from '$lib/models/autoPath';
import { GameMatchIdentity, type Alliance, MatchType } from '$lib/models/match';
import {
	scoutReportAnalysisFromJson,
	scoutReportEventFromList,
	type ScoutReportEvent,
	type SingleScoutReportAnalysis
} from '$lib/models/scoutReport';
import {
	scoutFromJson,
	userProfileFromJson,
	type LovatUserProfile,
	type RegistrationStatus,
	type RegistrationStatusResponse,
	type Scout,
	type Team
} from '$lib/models/types';
import { prefs } from '$lib/storage';
import { currentTournament, tournamentFromJson, type Tournament } from '$lib/tournament.svelte';
import { LovatAPIException, apiErrorFromBody, lovatAPI as api, raise } from './client';
import type { CachedQuery } from './query.svelte';

function tournamentQuery() {
	const t = currentTournament.value;
	return t ? { tournamentKey: t.key } : {};
}

function cachedQuery<T>(
	key: unknown[],
	label: string,
	path: string,
	query: Record<string, string> | undefined,
	parse: (json: any) => T,
	fetchFn?: () => Promise<T>
): CachedQuery<T> {
	return {
		key,
		label,
		fn:
			fetchFn ??
			(async () => {
				const response = await api.get(path, query);
				if (response.status !== 200) raise(response, `Failed to get ${label}`);
				return parse(response.json());
			}),
		cached: () => api.cachedData(path, query, parse),
		cachedAt: () => api.cachedTimestamp(path, query)
	};
}

// ── Profile & account ────────────────────────────────────────────────────

export const profilePath = '/v1/manager/profile';

export function getCachedUserProfile(): LovatUserProfile | null {
	return api.cachedData(profilePath, undefined, userProfileFromJson);
}

export async function getUserProfile(): Promise<LovatUserProfile> {
	const response = await api.get(profilePath);
	if (response.status !== 200) throw new Error(`Failed to get user profile: ${response.status}`);
	return userProfileFromJson(response.json());
}

export async function setUsername(username: string) {
	const r = await api.post('/v1/manager/onboarding/username', { username });
	if (r.status !== 200) throw new Error('Failed to set username');
}

export async function deleteAccount() {
	const r = await api.delete('/v1/manager/user');
	if (r.status !== 200) throw new Error('Failed to delete account');
}

export async function getTeamCode(): Promise<string | null> {
	const r = await api.get('/v1/manager/code', { uuid: crypto.randomUUID() });
	if (r.status === 403) return null;
	if (r.status !== 200) throw new Error('Failed to get team code');
	return r.body;
}

export async function getTeamEmail(): Promise<string> {
	const r = await api.get('/v1/manager/settings/teamemail');
	if (r.status !== 200) raise(r, 'Failed to get team email');
	return r.body;
}

export async function editTeamEmail(email: string) {
	const r = await api.put('/v1/manager/settings/teamemail', undefined, { email });
	if (r.status !== 200) raise(r, 'Failed to edit team email');
}

export interface Analyst {
	id: string;
	name: string;
	email: string;
}

export async function getAnalysts(): Promise<Analyst[] | null> {
	const r = await api.get('/v1/manager/analysts');
	if (r.status === 403 || r.status === 404) return null;
	if (r.status !== 200) throw new Error('Failed to get analysts');
	return r.json<any[]>().map((a) => ({ id: a.id, name: a.username, email: a.email }));
}

export async function promoteAnalyst(id: string) {
	const r = await api.post('/v1/manager/upgradeuser', { user: id });
	if (r.status !== 200) throw new Error('Failed to promote analyst');
}

// ── Onboarding ───────────────────────────────────────────────────────────

export async function getRegistrationStatus(teamNumber: number): Promise<RegistrationStatusResponse> {
	const r = await api.get(`/v1/manager/registeredteams/${teamNumber}/registrationstatus`);
	if (r.status !== 200) throw new Error('Failed to get registration status');
	const data = r.json<any>();
	const status = data.status as RegistrationStatus;
	prefs.setString('cachedRegistrationStatus', status);
	return {
		status,
		teamEmail:
			status === 'PENDING_TEAM_VERIFICATION'
				? data.teamEmail
				: status === 'PENDING_EMAIL_VERIFICATION'
					? data.email
					: null
	};
}

export async function registerTeam(teamNumber: number, email: string) {
	const r = await api.post('/v1/manager/onboarding/team', { email, number: teamNumber });
	if (r.status !== 200) throw new Error('Failed to register team');
}

export async function joinTeamByCode(teamNumber: number, code: string): Promise<boolean> {
	const r = await api.post('/v1/manager/onboarding/teamcode', undefined, { code, team: teamNumber });
	if (r.status === 200) return true;
	if (r.status === 404) return false;
	throw new Error('Failed to join team');
}

export async function resendVerificationEmail() {
	const r = await api.post('/v1/manager/onboarding/resendverificationemail');
	if (r.status === 200) return;
	if (r.status === 429) throw new LovatAPIException('Too many emails. Please wait a few minutes.');
	throw new LovatAPIException('Failed to resend verification email');
}

export async function sendTeamCode(teamNumber: number): Promise<string> {
	const r = await api.post('/v1/manager/emailTeamCode', undefined, { teamNumber });
	if (r.status !== 200) throw new LovatAPIException('Failed to send team code');
	return r.json<any>().email;
}

export async function setNotOnTeam() {
	const r = await api.post('/v1/manager/noteam');
	if (r.status !== 200) raise(r, 'Failed to set not on team');
}

export async function setTeamWebsite(website: string) {
	const r = await api.post('/v1/manager/onboarding/teamwebsite', { website });
	if (r.status !== 200) throw new Error('Failed to set team website');
}

// ── Source data settings ─────────────────────────────────────────────────

export type SourceTeamMode = 'THIS_TEAM' | 'ALL_TEAMS' | 'SPECIFIC_TEAMS';

export async function getSourceTeamSettings(): Promise<{ mode: SourceTeamMode; teams?: number[] }> {
	const r = await api.get('/v1/manager/settings/teamsource');
	if (r.status !== 200) throw new Error('Failed to get source team settings');
	if (r.body === 'THIS_TEAM' || r.body === 'ALL_TEAMS') return { mode: r.body };
	return { mode: 'SPECIFIC_TEAMS', teams: r.json<number[]>() };
}

export async function setSourceTeams(mode: SourceTeamMode, teams?: number[]) {
	const r = await api.post('/v1/manager/settings/teamsource', { mode, teams: teams ?? null });
	if (r.status !== 200) throw new Error('Failed to set source teams');
}

export async function getSourceTournamentKeys(): Promise<string[]> {
	const r = await api.get('/v1/manager/settings/tournamentsource');
	if (r.status !== 200) throw new Error('Failed to get source tournament keys');
	return r.json<string[]>();
}

export async function setSourceTournamentKeys(tournaments: string[]) {
	const r = await api.post('/v1/manager/settings/tournamentsource', { tournaments });
	if (r.status !== 200) throw new Error('Failed to set source tournaments');
}

// ── Tournaments & teams ──────────────────────────────────────────────────

export async function getTournaments(opts: { take?: number; skip?: number; filter?: string } = {}) {
	const r = await api.get('/v1/manager/tournaments', { take: opts.take, skip: opts.skip, filter: opts.filter ?? '' });
	if (r.status !== 200) throw new Error('Failed to get tournaments');
	const json = r.json<any>();
	const tournaments: Tournament[] = json.tournaments.map(tournamentFromJson);
	const now = Date.now();
	const distance = (t: Tournament) => (t.date ? Math.abs(Math.trunc((t.date.getTime() - now) / 86_400_000)) : null);
	tournaments.sort((a, b) => {
		if (!!a.isParticipant !== !!b.isParticipant) return b.isParticipant ? 1 : -1;
		const da = distance(a);
		const db = distance(b);
		if (da === null && db === null) return 0;
		if (da === null) return 1;
		if (db === null) return -1;
		return da - db;
	});
	return { tournaments, total: json.count as number };
}

export async function getTeams(opts: { take?: number; skip?: number; filter?: string } = {}) {
	const r = await api.get('/v1/manager/teams', { take: opts.take, skip: opts.skip, filter: opts.filter ?? '' });
	if (r.status !== 200) throw new Error('Failed to get teams');
	const json = r.json<any>();
	return { teams: json.teams as Team[], total: json.count as number };
}

export async function getTeamsAtTournament(key: string): Promise<Team[]> {
	const r = await api.get(`/v1/manager/tournament/${key}/teams`);
	if (r.status !== 200) throw new Error('Failed to get teams at tournament');
	return r.json<any[]>().map((t) => ({ name: t.name, number: t.number }));
}

export interface UpcomingTeamTournament {
	key: string;
	name: string;
	city?: string | null;
	week?: number | null;
}

export async function getUpcomingTeamTournaments(): Promise<UpcomingTeamTournament[]> {
	const r = await api.get('/v1/manager/upcoming-entered-tournaments');
	if (r.status !== 200) throw new Error('Could not load entered tournaments');
	return r.json<any[]>().map((e) => ({ key: e.key, name: e.name, city: e.city, week: e.week }));
}

export interface TeamTournamentStatus {
	rankingPoints: number | null;
	rank: number | null;
	matchesPlayed: number | null;
	matchesTotal: number | null;
	team: Team;
}

export async function getTeamTournamentStatus(tournamentKey: string, team: number): Promise<TeamTournamentStatus | null> {
	const r = await api.get('/v1/manager/team-tournament-status', { tournamentKey, teamNumber: team });
	// The selected event may not include the signed-in user's team.
	if (r.status === 404) return null;
	if (r.status !== 200) throw new Error('Failed to get tournament status');
	const j = r.json<any>();
	return {
		rankingPoints: j.rankingPoints ?? null,
		rank: j.rank ?? null,
		matchesPlayed: j.matchesPlayed ?? null,
		matchesTotal: j.matchesTotal ?? null,
		team: { name: j.name, number: j.number }
	};
}

export interface TeamRanking {
	number: number;
	rank: number | null;
	rankingPoints: number | null;
	matchesPlayed: number | null;
	avatar?: string | null;
}

/** Events may not have rankings yet; keep unranked teams at the end. */
export function compareByRank(a: TeamRanking, b: TeamRanking) {
	if (a.rank == null) return b.rank == null ? 0 : 1;
	if (b.rank == null) return -1;
	return a.rank - b.rank;
}

const fallbackRankings = new Map<string, { created: number; request: Promise<TeamRanking[]> }>();

async function loadStatusRankings(key: string, teams: TeamRanking[]): Promise<TeamRanking[]> {
	const results = [...teams];
	let next = 0;
	const deadline = Date.now() + 20_000;
	const worker = async () => {
		while (next < teams.length && Date.now() < deadline) {
			const index = next++;
			const team = teams[index];
			try {
				const remaining = Math.min(5000, deadline - Date.now());
				const status = await Promise.race([
					getTeamTournamentStatus(key, team.number),
					new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), remaining))
				]);
				if (status) {
					results[index] = { ...team, rank: status.rank, rankingPoints: status.rankingPoints, matchesPlayed: status.matchesPlayed };
				}
			} catch {
				// A missing rank must not hide this team or the rest of the roster.
			}
		}
	};
	await Promise.all([worker(), worker(), worker(), worker()]);
	return results;
}

export async function getTeamRankings(key: string): Promise<TeamRanking[]> {
	const r = await api.get(`/v1/manager/tournament/${key}/rankedTeams`);
	if (r.status === 404) return [];
	if (r.status !== 200) throw new Error('Failed to get team rankings at tournament');
	const teams: TeamRanking[] = r.json<any[]>().map((t) => ({
		number: t.number,
		rank: t.rank ?? null,
		rankingPoints: t.rankingPoints ?? null,
		matchesPlayed: t.matchesPlayed ?? null,
		avatar: t.avatar ?? null
	}));
	if (teams.length === 0 || teams.some((t) => (t.rank ?? 0) > 0)) return teams;
	// Older backends provide ranks through the per-team status endpoint.
	const cacheKey = `${api.baseUrl}/${key}`;
	const existing = fallbackRankings.get(cacheKey);
	if (existing && Date.now() - existing.created < 60_000) return [...(await existing.request)];
	const request = loadStatusRankings(key, teams);
	fallbackRankings.set(cacheKey, { created: Date.now(), request });
	const result = await request;
	if (!result.some((t) => (t.rank ?? 0) > 0)) fallbackRankings.delete(cacheKey);
	return [...result];
}

// ── Match schedule ───────────────────────────────────────────────────────

export interface MatchScheduleScouterInfo {
	name: string;
	isScouted: boolean;
}

export interface MatchScheduleTeamInfo {
	teamNumber: number;
	alliance: Alliance;
	scouters: MatchScheduleScouterInfo[];
	externalReportCount: number;
}

export interface MatchScheduleMatch {
	identity: GameMatchIdentity;
	isScouted: boolean;
	isFinished: boolean;
	red: [MatchScheduleTeamInfo, MatchScheduleTeamInfo, MatchScheduleTeamInfo];
	blue: [MatchScheduleTeamInfo, MatchScheduleTeamInfo, MatchScheduleTeamInfo];
}

export const allTeamInfo = (m: MatchScheduleMatch) => [...m.red, ...m.blue];

function teamInfo(json: any, alliance: Alliance): MatchScheduleTeamInfo {
	return {
		teamNumber: json.number,
		alliance,
		scouters: json.scouters.map((s: any) => ({ name: s.name, isScouted: s.scouted })),
		externalReportCount: json.externalReports
	};
}

function matchFromJson(json: any, tournamentKey: string): MatchScheduleMatch {
	return {
		identity: new GameMatchIdentity(json.matchType as MatchType, json.matchNumber, tournamentKey),
		isScouted: json.scouted,
		isFinished: json.finished,
		red: [teamInfo(json.team1, 'red'), teamInfo(json.team2, 'red'), teamInfo(json.team3, 'red')],
		blue: [teamInfo(json.team4, 'blue'), teamInfo(json.team5, 'blue'), teamInfo(json.team6, 'blue')]
	};
}

/** Long match keys index robots 0-2 for red and 3-5 for blue. */
export function longMatchKey(match: MatchScheduleMatch, alliance: Alliance, index: number) {
	return `${match.identity.toMediumKey()}_${alliance === 'red' ? index : index + 3}`;
}

const matchesQuery = (teams?: number[]) => (teams ? { teams: JSON.stringify(teams) } : {});

export function getCachedMatches(tournamentKey: string, teams?: number[]) {
	return api.cachedData(`/v1/manager/matches/${tournamentKey}`, matchesQuery(teams), (json) =>
		(json as any[]).map((m) => matchFromJson(m, tournamentKey))
	);
}

export async function getMatches(tournamentKey: string, teams?: number[]): Promise<MatchScheduleMatch[]> {
	const r = await api.get(`/v1/manager/matches/${tournamentKey}`, matchesQuery(teams));
	if (r.status === 404) {
		throw new LovatAPIException(
			'No matches found. This is likely because the match schedule has not been posted on The Blue Alliance yet. Please try again later.'
		);
	}
	if (apiErrorFromBody(r.body).message === 'tournament not found when trying to insert tournament matches') {
		throw new LovatAPIException('Tournament not found');
	}
	if (r.status !== 200) raise(r, 'Failed to get match schedule');
	return r.json<any[]>().map((m) => matchFromJson(m, tournamentKey));
}

/** Live/upcoming matches first, falling back to the last completed one. */
export function selectHomeMatch(matches: Iterable<MatchScheduleMatch>, includeLastCompleted = true) {
	let last: MatchScheduleMatch | null = null;
	for (const match of matches) {
		if (!match.isFinished) return match;
		last = match;
	}
	return includeLastCompleted ? last : null;
}

// ── Scouters & schedule ──────────────────────────────────────────────────

export function getCachedScouts(archived = false): Scout[] | null {
	const result = api.cachedData('/v1/manager/scoutershift/scouters', { archived: String(archived) }, (json) =>
		(json as any[]).map(scoutFromJson)
	);
	result?.sort((a, b) => a.name.trim().localeCompare(b.name.trim()));
	return result;
}

export async function getScouts(archived = false): Promise<Scout[]> {
	const r = await api.get('/v1/manager/scoutershift/scouters', { archived: String(archived) });
	if (r.status !== 200) throw new Error('Failed to get scouts');
	const scouts = r.json<any[]>().map(scoutFromJson);
	scouts.sort((a, b) => a.name.trim().localeCompare(b.name.trim()));
	return scouts;
}

export async function addScouter(name: string): Promise<Scout> {
	const r = await api.post('/v1/manager/scouterdashboard', { name });
	if (r.status !== 201) raise(r, 'Failed to add scouter');
	return scoutFromJson(r.json());
}

export async function deleteScouter(id: string) {
	const r = await api.delete('/v1/manager/scouterdashboard', { scouterUuid: id });
	if (r.status !== 200) raise(r, 'Failed to delete scouter');
}

export async function renameScouter(id: string, newName: string) {
	const r = await api.put('/v1/manager/scoutername', { scouterUuid: id, newName });
	if (r.status !== 200) raise(r, 'Failed to rename scouter');
}

export async function archiveScouter(id: string) {
	const r = await api.post(`/v1/manager/archive/uuid/${id}`);
	if (r.status !== 200) throw new Error(`Failed to archive scouter ${r.status}`);
}

export async function unarchiveScouter(id: string) {
	const r = await api.post(`/v1/manager/unarchive/uuid/${id}`);
	if (r.status !== 200) throw new Error('Failed to unarchive scouter');
}

export interface ScouterOverview {
	totalMatches: number;
	missedMatches: number;
	scout: Scout;
	archived: boolean;
}

export function scouterOverviewsQuery(archived = false): CachedQuery<ScouterOverview[]> {
	const query = () => ({ ...tournamentQuery(), archived: String(archived) });
	const parse = (json: any) =>
		(json as any[]).map((e) => ({
			totalMatches: e.matchesScouted,
			missedMatches: e.missedMatches ?? 0,
			scout: { id: e.scouterUuid, name: e.scouterName },
			archived
		}));
	return {
		key: ['scouterOverviews', archived, currentTournament.value?.key ?? null],
		label: 'scouter overviews',
		fn: async () => {
			const r = await api.get('/v1/manager/scouterspage', query());
			if (r.status !== 200) raise(r, 'Failed to get scouter overviews');
			return parse(r.json());
		},
		cached: () => api.cachedData('/v1/manager/scouterspage', query(), parse),
		cachedAt: () => api.cachedTimestamp('/v1/manager/scouterspage', query())
	};
}

export interface ScouterReportInfo {
	matchIdentity: GameMatchIdentity;
	reportId: string;
	teamNumber: number;
}

export async function getScoutReportsByScouter(scouterUuid: string): Promise<ScouterReportInfo[]> {
	const r = await api.get('/v1/manager/scouterreports', { scouterUuid, ...tournamentQuery() });
	if (r.status !== 200) raise(r, 'Failed to get scout reports by scouter');
	return r.json<any[]>().map((e) => ({
		matchIdentity: GameMatchIdentity.fromLongKey(e.teamMatchData.key, e.teamMatchData.tournament.name),
		reportId: e.uuid,
		teamNumber: e.teamMatchData.teamNumber
	}));
}

export interface ScoutingShift {
	id?: string;
	start: number;
	end: number;
	/** Scouters for robots 1-6 (red 1-3, blue 1-3). */
	teams: [Scout[], Scout[], Scout[], Scout[], Scout[], Scout[]];
}

export interface ScoutSchedule {
	hash: string;
	shifts: ScoutingShift[];
}

function shiftFromJson(json: any): ScoutingShift {
	return {
		id: json.uuid,
		start: json.startMatchOrdinalNumber,
		end: json.endMatchOrdinalNumber,
		teams: [1, 2, 3, 4, 5, 6].map((n) => (json[`team${n}`] as any[]).map(scoutFromJson)) as ScoutingShift['teams']
	};
}

function shiftBody(shift: ScoutingShift) {
	const body: Record<string, unknown> = {
		startMatchOrdinalNumber: shift.start,
		endMatchOrdinalNumber: shift.end
	};
	shift.teams.forEach((scouts, i) => (body[`team${i + 1}`] = scouts.map((s) => s.id)));
	return body;
}

export function validateSchedule(schedule: ScoutSchedule): string | null {
	const { shifts } = schedule;
	for (let i = 0; i < shifts.length - 1; i++) {
		for (let j = i + 1; j < shifts.length; j++) {
			if (shifts[i].end >= shifts[j].start && shifts[i].start <= shifts[j].end) return 'Some shifts overlap.';
		}
	}
	if (shifts.some((s) => s.start < 0 || s.end < 0)) return 'Some match numbers are negative.';
	if (shifts.some((s) => s.end < s.start)) return "Some shifts don't have valid ranges.";
	return null;
}

/** Hash-derived hue that identifies a schedule version. */
export function scheduleVersionHue(hash: string) {
	let sum = 0;
	for (let i = 0; i < hash.length; i++) sum += hash.charCodeAt(i);
	return (sum * Math.E) % 360;
}

export function scouterScheduleQuery(tournamentKey: string): CachedQuery<ScoutSchedule> {
	const path = `/v1/manager/tournament/${tournamentKey}/scoutershifts`;
	return cachedQuery(['scouterSchedule', tournamentKey], 'scouter schedule', path, undefined, (json) => ({
		hash: json.hash,
		shifts: json.data.map(shiftFromJson)
	}));
}

export async function createScoutScheduleShift(shift: ScoutingShift) {
	const t = currentTournament.value;
	if (!t) throw new LovatAPIException('No tournament selected');
	const r = await api.post(`/v1/manager/tournament/${t.key}/scoutershifts`, shiftBody(shift));
	if (r.status !== 200) raise(r, 'Failed to create scouter schedule shift');
}

export async function updateScoutScheduleShift(shift: ScoutingShift) {
	const r = await api.post(`/v1/manager/scoutershifts/${shift.id}`, shiftBody(shift));
	if (r.status !== 200) raise(r, 'Failed to update scouter schedule shift');
}

export async function deleteScoutScheduleShift(id: string) {
	const r = await api.delete(`/v1/manager/scoutershifts/${id}`);
	if (r.status !== 200) throw new Error('Failed to delete scouter schedule shift');
}

// ── Scout reports ────────────────────────────────────────────────────────

export interface MinimalScoutReportInfo {
	uuid: string;
	scout: Scout;
	timestamp: Date;
	canModify: boolean | null;
}

export async function getScoutReportsByLongMatchKey(key: string): Promise<MinimalScoutReportInfo[]> {
	const r = await api.get(`/v1/analysis/scoutreports/match/${key}`);
	if (r.status !== 200) raise(r, 'Failed to get scout reports');
	return r.json<any[]>().map((e) => ({
		uuid: e.uuid,
		scout: { id: e.scouterUuid, name: e.scouter.name },
		canModify: e.canModify ?? null,
		timestamp: new Date(e.startTime)
	}));
}

export async function getScoutReportAnalysis(id: string): Promise<SingleScoutReportAnalysis> {
	const r = await api.get(`/v1/analysis/metrics/scoutreport/${id}`);
	if (r.status !== 200) raise(r, 'Failed to get scout report analysis');
	return scoutReportAnalysisFromJson(r.json());
}

export async function getEventsForScoutReport(id: string): Promise<ScoutReportEvent[]> {
	const r = await api.get(`/v1/analysis/timeline/scoutreport/${id}`);
	if (r.status !== 200) raise(r, 'Failed to get events for scout report');
	return r.json<number[][]>().map(scoutReportEventFromList);
}

export async function deleteScoutReport(id: string) {
	const r = await api.delete(`/v1/manager/scoutreports/${id}`);
	if (r.status !== 200) raise(r, 'Failed to delete scout report');
}

export async function uploadScoutReport(data: string) {
	const r = await api.post('/v1/manager/dashboard/scoutreport', JSON.parse(data));
	if (r.status !== 200) raise(r, 'Failed to upload scout report');
}

export async function updateNote(uuid: string, note: string) {
	const r = await api.put(`/v1/manager/notes/${uuid}`, { note });
	if (r.status !== 200) raise(r, 'Failed to update note');
}

// ── Team lookup analysis ─────────────────────────────────────────────────

export type CategoryMetrics = Record<string, unknown>;

export function categoryMetricsQuery(team: number): CachedQuery<CategoryMetrics> {
	const path = `/v1/analysis/category/team/${team}`;
	return cachedQuery(['categoryMetrics', team], 'category metrics', path, undefined, (j) => j, async () => {
		const r = await api.get(path);
		if (r.status !== 200) raise(r, 'Failed to get category metrics');
		try {
			return r.json<CategoryMetrics>();
		} catch {
			if (['TEAM_DOES_NOT_EXIST', 'NO_DATA_FOR_TEAM'].includes(r.body)) throw new LovatAPIException(r.body);
			throw new Error('Failed to get category metrics');
		}
	});
}

export type BreakdownMetrics = Record<string, Record<string, number>>;

export function breakdownMetricsQuery(team: number): CachedQuery<BreakdownMetrics> {
	const path = `/v1/analysis/breakdown/team/${team}`;
	return cachedQuery(['breakdownMetrics', team], 'breakdown metrics', path, undefined, (json) => {
		const out: BreakdownMetrics = {};
		for (const [b, segments] of Object.entries(json as Record<string, Record<string, number | null>>)) {
			out[b] = Object.fromEntries(Object.entries(segments ?? {}).map(([s, v]) => [s, v ?? 0]));
		}
		return out;
	});
}

export interface BreakdownDetailsReport {
	segmentPath: string;
	match: GameMatchIdentity;
	sourceTeam: number;
	scouterName: string | null;
}

export function breakdownDetailsQuery(team: number, breakdownPath: string): CachedQuery<BreakdownDetailsReport[]> {
	const path = `/v1/analysis/breakdown/team/${team}/${breakdownPath}`;
	return cachedQuery(['breakdownDetails', team, breakdownPath], 'breakdown details', path, undefined, (json) =>
		(json as any[]).map((r) => ({
			segmentPath: r.breakdown,
			match: GameMatchIdentity.fromLongKey(r.key, r.tournamentName),
			sourceTeam: r.sourceTeam,
			scouterName: r.scouter ?? null
		}))
	);
}

export interface MetricDataPoint {
	match: GameMatchIdentity;
	tournamentName: string;
	dataPoint: number | null;
}

export interface MetricDetails {
	result?: unknown;
	all?: unknown;
	difference?: number | null;
	hasResult: boolean;
	hasAll: boolean;
	hasDifference: boolean;
	array: MetricDataPoint[];
	paths: AutoPath[];
}

export function metricDetailsQuery(team: number, metricPath: string): CachedQuery<MetricDetails> {
	const path = `/v1/analysis/metric/${metricPath}/team/${team}`;
	return cachedQuery(['metricDetails', team, metricPath], 'metric details', path, undefined, (json: any) => ({
		result: json.result,
		all: json.all,
		difference: json.difference ?? null,
		hasResult: 'result' in json,
		hasAll: 'all' in json,
		hasDifference: 'difference' in json,
		array: (json.array ?? []).map((e: any) => ({
			match: GameMatchIdentity.fromLongKey(e.match, e.tournamentName),
			tournamentName: e.tournamentName ?? '',
			dataPoint: e.dataPoint ?? null
		})),
		paths: (json.paths ?? []).map((p: any) => AutoPath.fromMap(p))
	}));
}

export type NoteType = 'note' | 'breakDescription';

export interface Note {
	body: string;
	matchIdentity: GameMatchIdentity;
	author: string | null;
	uuid: string | null;
	type: NoteType;
}

function notesFromJoined(json: any): Note[] {
	const base = {
		matchIdentity: GameMatchIdentity.fromLongKey(json.match, json.tournamentName),
		author: json.scouterName ?? null,
		uuid: json.uuid ?? null
	};
	const notes: Note[] = [];
	if (typeof json.notes === 'string' && json.notes) notes.push({ ...base, body: json.notes, type: 'note' });
	if (typeof json.robotBrokeDescription === 'string' && json.robotBrokeDescription) {
		notes.push({ ...base, body: json.robotBrokeDescription, type: 'breakDescription' });
	}
	return notes;
}

export function notesQuery(team: number): CachedQuery<Note[]> {
	const path = `/v1/analysis/notes/team/${team}`;
	return cachedQuery(['notes', team], 'notes', path, undefined, (json) => (json as any[]).flatMap(notesFromJoined));
}

function flagQuery(paths: string[]) {
	return { ...tournamentQuery(), flags: JSON.stringify(paths) };
}

export function getCachedFlag(path: string, team: number): unknown {
	const flags = api.cachedData(`/v1/analysis/flag/team/${team}`, flagQuery([path]), (j) => j as unknown[]);
	return flags && flags.length ? flags[0] : undefined;
}

export async function getFlags(paths: string[], team: number): Promise<unknown[]> {
	const r = await api.get(`/v1/analysis/flag/team/${team}`, flagQuery(paths));
	if (r.status !== 200) throw new Error('Failed to get flags');
	return r.json<unknown[]>();
}

export async function getFlag(path: string, team: number) {
	return (await getFlags([path], team))[0];
}

// ── Alliance & match prediction ──────────────────────────────────────────

export interface AllianceTeam {
	team: number;
	role: number | null;
	averagePoints: number | null;
	paths: AutoPath[];
}

export interface AllianceAnalysis {
	teams: AllianceTeam[];
	totalPoints: number | null;
	l1StartTime: (number | null)[];
	l2StartTime: (number | null)[];
	l3StartTime: (number | null)[];
	totalFuelOutputted: number;
	totalBallThroughput: number;
}

function allianceFromJson(json: any): AllianceAnalysis {
	return {
		teams: json.teams.map((t: any) => ({
			team: t.team,
			role: t.role ?? null,
			averagePoints: t.averagePoints ?? null,
			paths: (t.paths ?? []).map((p: any) => AutoPath.fromMap(p))
		})),
		totalPoints: json.totalPoints ?? null,
		l1StartTime: json.l1StartTime,
		l2StartTime: json.l2StartTime,
		l3StartTime: json.l3StartTime,
		totalFuelOutputted: json.totalFuelOutputted,
		totalBallThroughput: json.totalBallThroughput
	};
}

export function allianceAnalysisQuery(teams: number[]): CachedQuery<AllianceAnalysis> {
	const query = { teamOne: String(teams[0]), teamTwo: String(teams[1]), teamThree: String(teams[2]) };
	return cachedQuery(['allianceAnalysis', ...teams], 'alliance analysis', '/v1/analysis/alliance', query, allianceFromJson);
}

export interface MatchPrediction {
	redWinning: number | null;
	blueWinning: number | null;
	redAlliance: AllianceAnalysis;
	blueAlliance: AllianceAnalysis;
}

export function matchPredictionQuery(red: number[], blue: number[]): CachedQuery<MatchPrediction> {
	const path = '/v1/analysis/matchprediction';
	const query = {
		red1: String(red[0]),
		red2: String(red[1]),
		red3: String(red[2]),
		blue1: String(blue[0]),
		blue2: String(blue[1]),
		blue3: String(blue[2])
	};
	const parse = (json: any): MatchPrediction => ({
		redWinning: json.redWinning ?? null,
		blueWinning: json.blueWinning ?? null,
		redAlliance: allianceFromJson(json.redAlliance),
		blueAlliance: allianceFromJson(json.blueAlliance)
	});
	return cachedQuery(['matchPrediction', ...red, ...blue], 'match prediction', path, query, parse, async () => {
		const r = await api.get(path, query);
		if (r.status !== 200) raise(r, 'Failed to get match prediction');
		if (r.body === 'not enough data') throw new LovatAPIException('Not enough data');
		return parse(r.json());
	});
}

// ── Picklists ────────────────────────────────────────────────────────────

export interface PicklistWeight {
	path: string;
	localizedName: string;
	value: number;
}

export interface PicklistBreakdownEntry {
	type: string;
	result: number;
}

export interface PicklistAnalysisTeam {
	teamNumber: number;
	result: number;
	zScoresWeighted: PicklistBreakdownEntry[];
	zScoresUnweighted: PicklistBreakdownEntry[];
	flags: PicklistBreakdownEntry[];
}

function picklistQuery(flags: string[], weights: PicklistWeight[]) {
	return {
		...tournamentQuery(),
		flags: JSON.stringify(flags),
		...Object.fromEntries(weights.map((w) => [w.path, String(w.value)]))
	};
}

function picklistTeamsFromJson(json: any): PicklistAnalysisTeam[] {
	const entries = (list: any[] | undefined) =>
		(list ?? []).map((e) => ({ type: e.type as string, result: (e.result as number | null) ?? 0 }));
	return json.teams.map((t: any) => ({
		teamNumber: t.team,
		result: t.result ?? 0,
		zScoresWeighted: entries(t.breakdown),
		zScoresUnweighted: entries(t.unweighted),
		flags: entries(t.flags)
	}));
}

export function picklistAnalysisQuery(flags: string[], weights: PicklistWeight[]): CachedQuery<PicklistAnalysisTeam[]> {
	const path = '/v1/analysis/picklist';
	return {
		key: ['picklistAnalysis', flags, weights.map((w) => [w.path, w.value]), currentTournament.value?.key ?? null],
		label: 'picklist analysis',
		fn: async () => {
			const r = await api.get(path, picklistQuery(flags, weights));
			if (r.status !== 200) raise(r, 'Failed to get picklist analysis');
			return picklistTeamsFromJson(r.json());
		},
		cached: () => api.cachedData(path, picklistQuery(flags, weights), picklistTeamsFromJson),
		cachedAt: () => api.cachedTimestamp(path, picklistQuery(flags, weights))
	};
}

function csvEscape(value: string) {
	return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function toCsv(rows: string[][]) {
	return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
}

export async function getPicklistCSV(flags: string[], weights: PicklistWeight[]) {
	const teams = await picklistAnalysisQuery(flags, weights).fn();
	if (teams.length === 0) return toCsv([['teamNumber', 'index']]);
	const columns = [
		'teamNumber',
		'index',
		...teams[0].zScoresUnweighted.map((e) => `${e.type}_unweighted`),
		...teams[0].zScoresWeighted.map((e) => `${e.type}_weighted`)
	];
	return toCsv([
		columns,
		...teams.map((t) => [
			String(t.teamNumber),
			String(t.result),
			...t.zScoresUnweighted.map((e) => String(e.result)),
			...t.zScoresWeighted.map((e) => String(e.result))
		])
	]);
}

export interface SharedPicklistMeta {
	id: string;
	title: string;
	author?: string | null;
}

export interface ConfiguredPicklist {
	id: string;
	title: string;
	weights: PicklistWeight[];
	author?: string | null;
}

function notOnTeam(r: { body: string }) {
	const error = apiErrorFromBody(r.body);
	return (
		error.code === 'TEAM_REQUIRED' ||
		error.message === 'Not authortized to get mutable picklists because your not on a team'
	);
}

export function sharedPicklistsQuery(): CachedQuery<SharedPicklistMeta[]> {
	const path = '/v1/manager/picklists';
	const parse = (json: any) =>
		(json as any[]).map((e) => ({ id: e.uuid, title: e.name, author: e.author?.username ?? null }));
	return cachedQuery(['sharedPicklists'], 'shared picklists', path, undefined, parse, async () => {
		const r = await api.get(path);
		if (r.status !== 200) {
			if (notOnTeam(r)) throw new LovatAPIException('Not on team');
			throw new Error('Failed to get shared picklists');
		}
		return parse(r.json());
	});
}

export async function getSharedPicklist(id: string, weightNames: Map<string, string>): Promise<ConfiguredPicklist> {
	const r = await api.get(`/v1/manager/picklists/${id}`);
	if (r.status !== 200) raise(r, 'Failed to get shared picklist');
	return configuredPicklistFromServer(r.json(), weightNames);
}

export function configuredPicklistFromServer(json: any, weightNames: Map<string, string>): ConfiguredPicklist {
	const weights: PicklistWeight[] = [];
	for (const [path, localizedName] of weightNames) {
		weights.push({ path, localizedName, value: typeof json[path] === 'number' ? json[path] : 0 });
	}
	return { id: json.uuid, title: json.name, weights, author: json.userName ?? null };
}

export async function sharePicklist(picklist: ConfiguredPicklist) {
	const r = await api.post('/v1/manager/picklists', {
		name: picklist.title,
		...Object.fromEntries(picklist.weights.map((w) => [w.path, w.value]))
	});
	if (r.status !== 200) raise(r, 'Failed to share picklist');
}

export async function deleteSharedPicklist(id: string) {
	const r = await api.delete(`/v1/manager/picklists/${id}`);
	if (r.status !== 200) throw new Error('Failed to delete shared picklist');
}

export interface MutablePicklistMeta {
	uuid: string;
	name: string;
	author?: string | null;
	tournamentKey?: string | null;
}

export interface MutablePicklist {
	uuid: string;
	name: string;
	teams: number[];
	tournamentKey?: string | null;
	author?: string | null;
}

export function mutablePicklistsQuery(): CachedQuery<MutablePicklistMeta[]> {
	const path = '/v1/manager/mutablepicklists';
	const parse = (json: any) =>
		(json as any[]).map((e) => ({
			uuid: e.uuid,
			name: e.name,
			author: e.author?.username ?? null,
			tournamentKey: e.tournamentKey ?? null
		}));
	return cachedQuery(['mutablePicklists'], 'mutable picklists', path, undefined, parse, async () => {
		const r = await api.get(path);
		if (r.status !== 200) {
			if (notOnTeam(r)) throw new LovatAPIException('Not on team');
			throw new Error('Failed to get mutable picklists');
		}
		return parse(r.json());
	});
}

function mutableFromJson(json: any): MutablePicklist {
	return {
		uuid: json.uuid,
		name: json.name,
		teams: json.teams,
		tournamentKey: json.tournamentKey ?? null,
		author: json.userName ?? null
	};
}

export function getCachedMutablePicklist(id: string) {
	return api.cachedData(`/v1/manager/mutablepicklists/${id}`, undefined, mutableFromJson);
}

export async function getMutablePicklist(id: string): Promise<MutablePicklist> {
	const r = await api.get(`/v1/manager/mutablepicklists/${id}`);
	if (r.status !== 200) raise(r, 'Failed to get mutable picklist');
	return mutableFromJson(r.json());
}

export async function createMutablePicklist(p: MutablePicklist) {
	const r = await api.post('/v1/manager/mutablepicklists', {
		uuid: p.uuid,
		name: p.name,
		teams: p.teams,
		tournamentKey: currentTournament.value?.key ?? null
	});
	if (r.status !== 200) raise(r, 'Failed to create mutable picklist');
}

export async function updateMutablePicklist(p: MutablePicklist) {
	const r = await api.put(`/v1/manager/mutablepicklists/${p.uuid}`, { name: p.name, teams: p.teams });
	if (r.status !== 200) raise(r, 'Failed to update mutable picklist');
}

export async function deleteMutablePicklist(id: string) {
	const r = await api.delete(`/v1/manager/mutablepicklists/${id}`);
	if (r.status !== 200) throw new Error('Failed to delete mutable picklist');
}

// ── CSV export ───────────────────────────────────────────────────────────

export type CSVExportFormat = 'csvplain' | 'reportcsv';
export type CSVExportFilter = '' | 'auto' | 'teleop';

export async function getCSVExport(tournamentKey: string, format: CSVExportFormat, filter: CSVExportFilter) {
	const query: Record<string, string> = { tournamentKey };
	if (filter) query[filter] = '';
	const r = await api.get(`/v1/analysis/${format}`, query);
	if (r.status !== 200) raise(r, 'Failed to get CSV export');
	return r.body;
}
