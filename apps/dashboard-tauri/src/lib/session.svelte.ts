import { getCachedUserProfile, getUserProfile } from '#lib/api/endpoints.ts';
import type { LovatUserProfile } from '#lib/models/types.ts';

/** The signed-in user's profile, shown from cache and refreshed on demand. */
class Session {
	profile = $state<LovatUserProfile | null>(null);
	error = $state<string | null>(null);
	private inflight: Promise<LovatUserProfile | null> | null = null;

	get isScoutingLead() {
		return this.profile?.role === 'SCOUTING_LEAD';
	}

	loadCached() {
		this.profile ??= getCachedUserProfile();
	}

	refresh(): Promise<LovatUserProfile | null> {
		this.inflight ??= getUserProfile()
			.then((p) => {
				this.profile = p;
				this.error = null;
				return p;
			})
			.catch((e: unknown) => {
				this.error = e instanceof Error ? e.message : String(e);
				return null;
			})
			.finally(() => {
				this.inflight = null;
			});
		return this.inflight;
	}
}

export const session = new Session();
