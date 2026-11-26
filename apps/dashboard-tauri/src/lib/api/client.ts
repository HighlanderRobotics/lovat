import { auth } from '$lib/auth';
import { appVersion, buildNumber, defaultApiBase, isTauri, operatingSystem, webAuth } from '$lib/config';
import { prefs } from '$lib/storage';
import { ResponseCache } from './cache';
import { queryCache } from './query.svelte';

export class LovatAPIException extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'LovatAPIException';
	}
}

export interface ApiError {
	code?: string;
	message?: string;
}

/** Accept shared JSON errors and plain-text errors from older servers. */
export function apiErrorFromBody(body: string | null | undefined): ApiError {
	if (body == null) return {};
	try {
		const value = JSON.parse(body);
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			const message = value.displayError ?? value.message ?? value.error;
			return {
				code: typeof value.code === 'string' ? value.code : undefined,
				message: typeof message === 'string' ? message : undefined
			};
		}
	} catch {
		return { message: body };
	}
	return {};
}

export interface ApiResponse {
	status: number;
	body: string;
	headers: Headers;
	ok: boolean;
	json<T = unknown>(): T;
}

type Query = Record<string, string | number | boolean | null | undefined>;
type Fetch = typeof globalThis.fetch;

function toResponse(status: number, body: string, headers: Headers): ApiResponse {
	return {
		status,
		body,
		headers,
		ok: status >= 200 && status < 300,
		json<T>() {
			return JSON.parse(body) as T;
		}
	};
}

/** Throw the server's display error when present, else `fallback`. */
export function raise(response: ApiResponse, fallback: string): never {
	const message = apiErrorFromBody(response.body).message;
	throw new LovatAPIException(message && message.length < 500 ? message : fallback);
}

export class LovatAPI {
	readonly cache = new ResponseCache();
	private _baseUrl: string;
	private lastToken: string | null = null;
	private hasCacheIdentity = false;
	private cacheGeneration = 0;
	private fetchImpl: Promise<Fetch> | null = null;

	constructor(
		baseUrl: string,
		readonly isBaseUrlLocked = false,
		private tokenProvider: () => Promise<string | null> = () => auth.getAccessToken()
	) {
		this._baseUrl = baseUrl;
	}

	get baseUrl() {
		return this._baseUrl;
	}

	set baseUrl(value: string) {
		if (this.isBaseUrlLocked || value === this._baseUrl) return;
		this._baseUrl = value;
		this.invalidateCache();
		this.cache.flush();
	}

	private invalidateCache() {
		this.cacheGeneration++;
		this.cache.clear();
		queryCache.clearAll();
	}

	/** Tauri requests go through Rust so the API's CORS policy does not apply. */
	private fetcher(): Promise<Fetch> {
		this.fetchImpl ??= isTauri
			? import('@tauri-apps/plugin-http').then((m) => m.fetch as Fetch)
			: Promise.resolve(globalThis.fetch.bind(globalThis));
		return this.fetchImpl;
	}

	url(path: string, query?: Query) {
		const url = new URL(this.baseUrl + path);
		if (query) {
			for (const [key, value] of Object.entries(query)) {
				if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
			}
		}
		return url.toString();
	}

	private async headers(jsonBody = false): Promise<Record<string, string>> {
		const token = await this.tokenProvider();
		// Tokens stay in memory. Persisted responses are never reused before this
		// client knows which identity it is serving.
		if (!this.hasCacheIdentity || token !== this.lastToken) {
			this.invalidateCache();
			this.cache.flush();
			this.lastToken = token;
			this.hasCacheIdentity = true;
		}
		return {
			...(token ? { Authorization: `Bearer ${token}` } : {}),
			'X-Operating-System': operatingSystem(),
			'X-App-Version': appVersion,
			'X-Lovat-Error-Format': 'json-v1',
			'X-Build-Number': buildNumber,
			...(jsonBody ? { 'Content-Type': 'application/json' } : {})
		};
	}

	async get(path: string, query?: Query): Promise<ApiResponse> {
		const key = this.url(path, query);
		const headers = await this.headers();
		const generation = this.cacheGeneration;
		const cached = this.cache.get(key);
		if (cached?.etag) headers['If-None-Match'] = cached.etag;

		const fetch = await this.fetcher();
		const response = await fetch(key, { headers });
		const body = response.status === 304 ? '' : await response.text();

		if (response.status === 304 && cached && generation === this.cacheGeneration) {
			return toResponse(200, cached.body, new Headers({ 'content-type': 'application/json' }));
		}
		if (response.status === 200 && generation === this.cacheGeneration) {
			this.cache.put(key, body, response.headers.get('etag'));
		}
		return toResponse(response.status, body, response.headers);
	}

	private async send(method: string, path: string, body?: unknown, query?: Query) {
		const fetch = await this.fetcher();
		const response = await fetch(this.url(path, query), {
			method,
			headers: await this.headers(body !== undefined),
			body: body === undefined ? undefined : JSON.stringify(body)
		});
		return toResponse(response.status, await response.text(), response.headers);
	}

	post(path: string, body?: unknown, query?: Query) {
		return this.send('POST', path, body, query);
	}

	put(path: string, body?: unknown, query?: Query) {
		return this.send('PUT', path, body, query);
	}

	delete(path: string, body?: unknown, query?: Query) {
		return this.send('DELETE', path, body, query);
	}

	/** Parse a persisted response for stale-while-revalidate rendering. */
	cachedData<T>(path: string, query: Query | undefined, parse: (json: unknown) => T): T | null {
		if (!this.hasCacheIdentity) return null;
		const entry = this.cache.get(this.url(path, query));
		if (!entry) return null;
		try {
			return parse(JSON.parse(entry.body));
		} catch {
			return null;
		}
	}

	cachedTimestamp(path: string, query?: Query): number | null {
		if (!this.hasCacheIdentity) return null;
		return this.cache.get(this.url(path, query))?.ts ?? null;
	}
}

// Sandbox web builds are pinned to their sandbox API; nothing may override it.
const sandboxOrigin = isTauri ? undefined : webAuth.sandboxApiOrigin;

export const lovatAPI = new LovatAPI(sandboxOrigin ?? defaultApiBase, sandboxOrigin !== undefined);

export function initializeApi() {
	lovatAPI.cache.load();
	const stored = prefs.getString('api_base_url');
	if (stored) lovatAPI.baseUrl = stored;
}
