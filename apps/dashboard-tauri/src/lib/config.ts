// Build-time configuration. Variable names match the Flutter Dashboard's
// --dart-define keys so Railway and CI can pass the same environment.

export const productionAuth0Domain = 'lovat.us.auth0.com';
export const productionAuth0Audience = 'https://api.lovat.app';
export const productionApiBase = 'https://api.lovat.app';

/** Auth0 application used by the browser build. */
export const productionWebClientId = 'FR7SUG9t0wXb5ZVo51G0ewnsK7PPSyJ9';
/** Auth0 native application shared with the Flutter mobile and desktop apps. */
export const nativeClientId = 'PaUUK4Sjmcdy5oueW7geI2rgMfuWd1G4';
export const nativeScheme = 'com.frc8033.lovatdashboard';

export const authScopes = 'openid profile email offline_access';

const env = import.meta.env as Record<string, string | undefined>;

export const websiteBaseUrl = env.LOVAT_WEBSITE_URL || 'https://lovat.app';

const hostname = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

export interface WebAuthConfig {
	domain: string;
	clientId: string;
	audience: string;
	/** Set only for sandbox builds, which must never talk to production. */
	sandboxApiOrigin?: string;
}

/**
 * Mirrors `DashboardWebAuth.resolve` from the Flutter app: either all three
 * sandbox values are present and point away from production, or none are.
 */
export function resolveWebAuth(input: {
	domain?: string;
	clientId?: string;
	audience?: string;
	apiBase?: string;
}): WebAuthConfig {
	const { domain, clientId, audience, apiBase } = input;
	if (domain === undefined && clientId === undefined && audience === undefined) {
		return {
			domain: productionAuth0Domain,
			clientId: productionWebClientId,
			audience: productionAuth0Audience
		};
	}
	if (!domain || !clientId || !audience) {
		throw new Error('Sandbox web Auth0 requires domain, web client ID, and audience together.');
	}
	const authHost = domain.toLowerCase();
	if (!hostname.test(authHost) || authHost === productionAuth0Domain) {
		throw new Error('Sandbox web Auth0 domain must be a separate hostname (no scheme or path).');
	}
	// eslint-disable-next-line no-control-regex
	if (!/^[a-zA-Z0-9_-]+$/.test(clientId) || /[\s\x00-\x1f\x7f]/.test(audience)) {
		throw new Error('Invalid sandbox web Auth0 client ID or audience.');
	}
	let api: URL | null = null;
	try {
		api = apiBase ? new URL(apiBase) : null;
	} catch {
		api = null;
	}
	if (
		!api ||
		api.protocol !== 'https:' ||
		!hostname.test(api.hostname) ||
		api.hostname === new URL(productionApiBase).hostname ||
		api.username ||
		api.password ||
		api.search ||
		api.hash ||
		(api.pathname !== '' && api.pathname !== '/')
	) {
		throw new Error('Sandbox web Auth0 requires LOVAT_API_BASE to be a separate HTTPS API origin.');
	}
	return { domain: authHost, clientId, audience, sandboxApiOrigin: api.origin };
}

export const webAuth = resolveWebAuth({
	domain: env.LOVAT_SANDBOX_AUTH0_DOMAIN,
	clientId: env.LOVAT_SANDBOX_AUTH0_WEB_CLIENT_ID,
	audience: env.LOVAT_SANDBOX_AUTH0_AUDIENCE,
	apiBase: env.LOVAT_API_BASE
});

export const defaultApiBase = env.LOVAT_API_BASE || productionApiBase;

export const appVersion: string = __APP_VERSION__;
export const buildNumber: string = __BUILD_NUMBER__;

/** True when running inside the Tauri shell rather than a browser. */
export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function operatingSystem(): string {
	if (!isTauri) return 'web';
	const ua = navigator.userAgent;
	if (/android/i.test(ua)) return 'android';
	if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
	if (/mac/i.test(ua)) return 'macos';
	if (/win/i.test(ua)) return 'windows';
	return 'linux';
}
