// Auth0 login for the Tauri build. The Flutter app used auth0_flutter's
// native flow; this reproduces it with Authorization Code + PKCE: open the
// system browser, receive the redirect through the app's URL scheme, and
// exchange the code from Rust (plugin-http) so CORS never applies.

import {
	authScopes,
	nativeClientId,
	nativeScheme,
	operatingSystem,
	productionAuth0Audience,
	productionAuth0Domain
} from '#lib/config.ts';

interface StoredCredentials {
	accessToken: string;
	refreshToken?: string;
	idToken?: string;
	expiresAt: number;
}

const STORE_FILE = 'credentials.json';
const STORE_KEY = 'auth0';

async function store() {
	const { load } = await import('@tauri-apps/plugin-store');
	return load(STORE_FILE, { autoSave: true, defaults: {} });
}

async function readCredentials(): Promise<StoredCredentials | null> {
	return ((await (await store()).get<StoredCredentials>(STORE_KEY)) as StoredCredentials | undefined) ?? null;
}

async function writeCredentials(credentials: StoredCredentials | null) {
	const s = await store();
	if (credentials) await s.set(STORE_KEY, credentials);
	else await s.delete(STORE_KEY);
	await s.save();
}

/** macOS and iOS (including iPadOS, which reports itself as a Mac). */
const isApple = () => ['macos', 'ios'].includes(operatingSystem());

function redirectUri() {
	// Same shape auth0_flutter registers: SCHEME://DOMAIN/PLATFORM/BUNDLE/callback.
	// Apple platforms share the iOS URL: the in-app sheet only matches the
	// scheme, and this is the URL the Auth0 client already allows.
	const platform = isApple() ? 'ios' : operatingSystem();
	return `${nativeScheme}://${productionAuth0Domain}/${platform}/${nativeScheme}/callback`;
}

/**
 * Apple platforms: Apple's in-app sign-in sheet returns the redirect directly.
 * Elsewhere: the system browser hands the redirect back through the app's URL scheme.
 */
async function authorize(authorizeUrl: string, state: string): Promise<URL> {
	if (isApple()) {
		const { invoke } = await import('@tauri-apps/api/core');
		const url = new URL(await invoke<string>('web_auth', { url: authorizeUrl, callbackScheme: nativeScheme }));
		if (url.searchParams.get('state') !== state) throw new Error('Sign-in returned an unexpected state');
		return url;
	}
	return browserAuthorize(authorizeUrl, state);
}

function base64Url(bytes: Uint8Array) {
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(byteLength = 32) {
	const bytes = new Uint8Array(byteLength);
	crypto.getRandomValues(bytes);
	return base64Url(bytes);
}

async function challengeFor(verifier: string) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
	return base64Url(new Uint8Array(digest));
}

async function tokenRequest(body: Record<string, string>): Promise<StoredCredentials> {
	const { fetch } = await import('@tauri-apps/plugin-http');
	const response = await fetch(`https://${productionAuth0Domain}/oauth/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ client_id: nativeClientId, ...body })
	});
	const json = await response.json();
	if (!response.ok) {
		throw new Error(json.error_description ?? json.error ?? 'Sign-in failed');
	}
	return {
		accessToken: json.access_token,
		refreshToken: json.refresh_token ?? body.refresh_token,
		idToken: json.id_token,
		expiresAt: Date.now() + (json.expires_in ?? 0) * 1000
	};
}

let loginInFlight: Promise<StoredCredentials> | null = null;

async function browserAuthorize(authorizeUrl: string, state: string): Promise<URL> {
	const [{ openUrl }, { onOpenUrl }] = await Promise.all([
		import('@tauri-apps/plugin-opener'),
		import('@tauri-apps/plugin-deep-link')
	]);
	let unlisten: (() => void) | undefined;
	const callback = new Promise<URL>((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error('Sign-in timed out')), 5 * 60 * 1000);
		onOpenUrl((urls) => {
			for (const raw of urls) {
				let url: URL;
				try {
					url = new URL(raw);
				} catch {
					continue;
				}
				// Ignore stale or foreign redirects; only this attempt's state counts.
				if (url.searchParams.get('state') !== state) continue;
				clearTimeout(timeout);
				resolve(url);
			}
		})
			.then((stop) => (unlisten = stop))
			.catch(reject);
	}).finally(() => unlisten?.());
	await openUrl(authorizeUrl);
	return callback;
}

async function runLogin(): Promise<StoredCredentials> {
	const verifier = randomString(48);
	const state = randomString(16);
	const redirect = redirectUri();

	const authorizeUrl = new URL(`https://${productionAuth0Domain}/authorize`);
	authorizeUrl.search = new URLSearchParams({
		response_type: 'code',
		client_id: nativeClientId,
		redirect_uri: redirect,
		audience: productionAuth0Audience,
		scope: authScopes,
		state,
		code_challenge: await challengeFor(verifier),
		code_challenge_method: 'S256'
	}).toString();

	const url = await authorize(authorizeUrl.toString(), state);
	const error = url.searchParams.get('error');
	if (error) throw new Error(url.searchParams.get('error_description') ?? error);
	const code = url.searchParams.get('code');
	if (!code) throw new Error('Sign-in did not return an authorization code');

	const credentials = await tokenRequest({
		grant_type: 'authorization_code',
		code,
		code_verifier: verifier,
		redirect_uri: redirect
	});
	await writeCredentials(credentials);
	return credentials;
}

export async function login(): Promise<void> {
	loginInFlight ??= runLogin().finally(() => {
		loginInFlight = null;
	});
	await loginInFlight;
}

export async function getAccessToken(): Promise<string> {
	if (loginInFlight) return (await loginInFlight).accessToken;
	const credentials = await readCredentials();
	if (!credentials) {
		await login();
		return (await readCredentials())!.accessToken;
	}
	// Renew a minute early so requests never race the expiry.
	if (credentials.expiresAt - 60_000 > Date.now()) return credentials.accessToken;
	if (!credentials.refreshToken) {
		await login();
		return (await readCredentials())!.accessToken;
	}
	try {
		const renewed = await tokenRequest({
			grant_type: 'refresh_token',
			refresh_token: credentials.refreshToken
		});
		await writeCredentials(renewed);
		return renewed.accessToken;
	} catch {
		await login();
		return (await readCredentials())!.accessToken;
	}
}

export async function isAuthenticated(): Promise<boolean> {
	return (await readCredentials()) !== null;
}

export async function logout(): Promise<void> {
	await writeCredentials(null);
	const { openUrl } = await import('@tauri-apps/plugin-opener');
	const url = new URL(`https://${productionAuth0Domain}/v2/logout`);
	url.searchParams.set('client_id', nativeClientId);
	await openUrl(url.toString()).catch(() => {});
}
