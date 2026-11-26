// Stale-while-revalidate queries, ported from the Flutter StaleRefreshBuilder.
// A query shows in-memory data, then persisted data, while it refetches. If
// the refetch fails with data on screen, the data stays and a toast offers a
// retry.

import { untrack } from 'svelte';
import { toast } from '#lib/toast.svelte.ts';

export interface CachedQuery<T> {
	key: unknown[];
	label: string;
	fn: () => Promise<T>;
	cached?: () => T | null;
	cachedAt?: () => number | null;
}

interface MemoryEntry {
	data: unknown;
	ts: number;
}

class QueryCache {
	private entries = new Map<string, MemoryEntry>();
	private keyOf(key: unknown[]) {
		return JSON.stringify(key);
	}
	read<T>(key: unknown[]) {
		return this.entries.get(this.keyOf(key)) as { data: T; ts: number } | undefined;
	}
	write(key: unknown[], data: unknown, ts = Date.now()) {
		this.entries.set(this.keyOf(key), { data, ts });
	}
	invalidate(key: unknown[]) {
		this.entries.delete(this.keyOf(key));
	}
	clearAll() {
		this.entries.clear();
	}
}

export const queryCache = new QueryCache();

export function formatRelative(ms: number): string {
	const minutes = Math.floor(ms / 60_000);
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
	const days = Math.floor(hours / 24);
	return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

export class QueryState<T> {
	data = $state<T | null>(null);
	error = $state<string | null>(null);
	isFetching = $state(false);
	private activeKey = '';
	private cachedAt: number | null = null;
	private query: CachedQuery<T> | null = null;

	get hasData() {
		return this.data !== null;
	}

	/** Start (or restart, when the key changed) fetching `query`. */
	run(query: CachedQuery<T>) {
		const keyString = JSON.stringify(query.key);
		if (keyString !== this.activeKey) {
			this.data = null;
			this.error = null;
			this.cachedAt = null;
		}
		this.query = query;
		this.activeKey = keyString;
		void this.fetch(query, keyString);
	}

	refetch = () => {
		if (!this.query) return;
		this.error = null;
		void this.fetch(this.query, this.activeKey);
	};

	private async fetch(query: CachedQuery<T>, keyString: string) {
		const memory = queryCache.read<T>(query.key);
		if (memory && this.data === null && this.error === null) {
			this.data = memory.data;
			this.cachedAt = memory.ts;
		} else if (!memory && this.data === null && this.error === null && query.cached) {
			const persisted = query.cached();
			if (persisted !== null) {
				const ts = query.cachedAt?.() ?? Date.now();
				queryCache.write(query.key, persisted, ts);
				this.data = persisted;
				this.cachedAt = ts;
			}
		}
		this.isFetching = true;
		try {
			const result = await query.fn();
			if (keyString !== this.activeKey) return;
			queryCache.write(query.key, result);
			this.data = result;
			this.error = null;
			this.cachedAt = Date.now();
		} catch (error) {
			if (keyString !== this.activeKey) return;
			this.error = errorMessage(error);
			if (this.data !== null) {
				toast.show(`Failed to get ${query.label}.`, {
					detail: this.cachedAt ? `Showing data from ${formatRelative(Date.now() - this.cachedAt)}` : undefined,
					action: { label: 'Retry', run: this.refetch }
				});
			}
		} finally {
			if (keyString === this.activeKey) this.isFetching = false;
		}
	}
}

/**
 * Reactive query bound to a component. It refetches whenever `getQuery`'s
 * reactive inputs change, and clears shown data only when the key differs.
 */
export function useQuery<T>(getQuery: () => CachedQuery<T> | null): QueryState<T> {
	const state = new QueryState<T>();
	$effect(() => {
		const query = getQuery();
		// Only the query's inputs are dependencies, not the state it writes.
		if (query) untrack(() => state.run(query));
	});
	return state;
}
