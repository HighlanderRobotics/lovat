import type { Auth0Client } from '@auth0/auth0-spa-js';
import { authScopes, webAuth } from '#lib/config.ts';

let clientPromise: Promise<Auth0Client> | null = null;

function client(): Promise<Auth0Client> {
	clientPromise ??= import('@auth0/auth0-spa-js').then(async ({ createAuth0Client }) => {
		const auth0 = await createAuth0Client({
			domain: webAuth.domain,
			clientId: webAuth.clientId,
			cacheLocation: 'localstorage',
			useRefreshTokens: true,
			authorizationParams: {
				audience: webAuth.audience,
				scope: authScopes,
				redirect_uri: window.location.origin
			}
		});
		// Complete a redirect login if Auth0 sent us back with a code.
		const params = new URLSearchParams(window.location.search);
		if (params.has('code') && params.has('state')) {
			try {
				await auth0.handleRedirectCallback();
			} finally {
				window.history.replaceState({}, document.title, window.location.pathname);
			}
		}
		return auth0;
	});
	return clientPromise;
}

let loginInFlight: Promise<void> | null = null;

export async function login(): Promise<void> {
	const auth0 = await client();
	loginInFlight ??= auth0
		.loginWithPopup({ authorizationParams: { audience: webAuth.audience, scope: authScopes } })
		.catch(async (error: unknown) => {
			// Browsers that block the popup fall back to a full-page redirect.
			if (error instanceof Error && /popup/i.test(error.message)) {
				await auth0.loginWithRedirect();
				return;
			}
			throw error;
		})
		.finally(() => {
			loginInFlight = null;
		});
	return loginInFlight;
}

export async function getAccessToken(): Promise<string> {
	const auth0 = await client();
	try {
		return (await auth0.getTokenSilently()) as string;
	} catch {
		await login();
		return (await auth0.getTokenSilently()) as string;
	}
}

export async function isAuthenticated(): Promise<boolean> {
	return (await client()).isAuthenticated();
}

export async function logout(): Promise<void> {
	const auth0 = await client();
	await auth0.logout({ logoutParams: { returnTo: window.location.origin } });
}
