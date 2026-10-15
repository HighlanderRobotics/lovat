import { goto } from '$app/navigation';
import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import { writable } from 'svelte/store';
import type { Auth0Client } from '@auth0/auth0-spa-js';

export const scoutingSession = writable({ signedIn: false, revision: 0 });

let client: Promise<Auth0Client> | undefined;
let revision = 0;

function getClient() {
	if (!browser) throw new Error('Sign-in requires a browser');

	client ??= import('@auth0/auth0-spa-js').then(
		({ Auth0Client }) =>
			new Auth0Client({
				domain: env.PUBLIC_AUTH0_DOMAIN || 'lovat.us.auth0.com',
				clientId: env.PUBLIC_AUTH0_CLIENT_ID || 'FR7SUG9t0wXb5ZVo51G0ewnsK7PPSyJ9',
				cacheLocation: 'memory',
				authorizationParams: {
					audience: 'https://api.lovat.app',
					scope: 'openid profile email',
					redirect_uri: window.location.origin
				}
			})
	);

	return client;
}

export async function restoreScoutingSession() {
	try {
		const auth = await getClient();

		const callback = new URL(window.location.href);

		if (callback.searchParams.has('code') && callback.searchParams.has('state')) {
			const result = await auth.handleRedirectCallback<{ returnTo?: string }>();
			const target = result.appState?.returnTo ?? '/';
			const safeTarget =
				target.startsWith('/') &&
				!target.startsWith('//') &&
				new URL(target, window.location.origin).origin === window.location.origin
					? target
					: '/';

			scoutingSession.set({ signedIn: await auth.isAuthenticated(), revision: ++revision });
			await goto(safeTarget, { replaceState: true });
			return;
		}

		await auth.checkSession();
		scoutingSession.set({ signedIn: await auth.isAuthenticated(), revision });
	} catch {
		// Public browsing remains available when authentication is unavailable.
	}
}

export async function signIn() {
	const auth = await getClient();

	await auth.loginWithRedirect({
		appState: { returnTo: window.location.pathname + window.location.search }
	});
}

export async function signOut() {
	const auth = await getClient();

	scoutingSession.set({ signedIn: false, revision: ++revision });
	await auth.logout({ logoutParams: { returnTo: window.location.origin } });
}

export async function scoutingToken() {
	const token = await (await getClient()).getTokenSilently();

	if (!token) throw new Error('Sign in required');

	return token;
}
