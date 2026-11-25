import { json, text, type Handle } from '@sveltejs/kit';

/**
 * CSRF protection adapted from SvelteKit 1.25.2 to support a route allowlist.
 * Upstream: https://github.com/sveltejs/kit/tree/c4a5f6cda41cc2e034e8b2a97d42b5f00568d29c
 * MIT notice: static/notices/SvelteKit-MIT.txt (served at /notices/SvelteKit-MIT.txt).
 */
const csrf =
	(allowedPaths: string[]): Handle =>
	async ({ event, resolve }) => {
		const forbidden =
			event.request.method === 'POST' &&
			event.request.headers.get('origin') !== event.url.origin &&
			isFormContentType(event.request) &&
			!allowedPaths.includes(event.url.pathname);

		if (forbidden) {
			const message = `Cross-site ${event.request.method} form submissions are forbidden`;
			if (event.request.headers.get('accept') === 'application/json') {
				return json({ message }, { status: 403 });
			}
			return text(message, { status: 403 });
		}

		const response = await resolve(event);
		// Operational pages include verification side effects and live pit data.
		// Static assets are served separately by the adapter.
		response.headers.set('cache-control', 'private, no-store');
		return response;
	};
function isContentType(request: Request, ...types: string[]) {
	const type = request.headers.get('content-type')?.split(';', 1)[0].trim() ?? '';
	return types.includes(type);
}
function isFormContentType(request: Request) {
	return isContentType(request, 'application/x-www-form-urlencoded', 'multipart/form-data');
}

export const handle = csrf(['/api/slack/interaction']);
