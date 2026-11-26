import { prefs } from '$lib/storage';

export interface CacheEntry {
	body: string;
	etag?: string | null;
	ts: number;
}

const STORAGE_KEY = 'lovat_api_cache';

/**
 * ETag-aware response cache persisted to local storage. It matches the
 * Flutter `ResponseCache`: writes are debounced, malformed records are skipped,
 * and the authenticated client clears it whenever identity or server change.
 */
export class ResponseCache {
	private entries = new Map<string, CacheEntry>();
	private loaded = false;
	private flushTimer: ReturnType<typeof setTimeout> | null = null;
	private dirty = false;

	constructor(private now: () => number = () => Date.now()) {}

	load() {
		if (this.loaded) return;
		const raw = prefs.getJSON<Record<string, CacheEntry>>(STORAGE_KEY);
		if (raw && typeof raw === 'object') {
			for (const [key, value] of Object.entries(raw)) {
				if (value && typeof value.body === 'string' && typeof value.ts === 'number') {
					this.entries.set(key, value);
				}
			}
		}
		this.loaded = true;
	}

	get(key: string) {
		return this.entries.get(key);
	}

	put(key: string, body: string, etag?: string | null) {
		this.entries.set(key, { body, etag, ts: this.now() });
		this.markDirty();
	}

	remove(key: string) {
		if (this.entries.delete(key)) this.markDirty();
	}

	clear() {
		this.entries.clear();
		this.markDirty();
	}

	private markDirty() {
		this.dirty = true;
		if (this.flushTimer) clearTimeout(this.flushTimer);
		this.flushTimer = setTimeout(() => this.write(), 500);
	}

	private write() {
		if (!this.dirty) return;
		this.dirty = false;
		try {
			prefs.setJSON(STORAGE_KEY, Object.fromEntries(this.entries));
		} catch {
			// Storage quota exceeded: keep the in-memory copy only.
		}
	}

	flush() {
		if (this.flushTimer) clearTimeout(this.flushTimer);
		this.flushTimer = null;
		this.write();
	}
}
