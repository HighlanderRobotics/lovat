import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { trainingSocketUrl } from '$lib/server/trainingSocketUrl';

const handle: RequestHandler = async ({ params, request, url, fetch }) => {
	if (!env.LOVAT_API_BASE)
		return json({ displayError: 'Training server is not configured.' }, { status: 503 });
	if (params.path === 'config' && request.method === 'GET') {
		try {
			return json({ socketUrl: trainingSocketUrl(env) });
		} catch {
			return json(
				{ displayError: 'Training requires a public API URL. Configure LOVAT_PUBLIC_API_BASE.' },
				{ status: 503 }
			);
		}
	}
	const path = params.path;
	const allowed =
		/^(videos|sessions|sessions\/[a-f0-9-]{36}(\/(control|grade|participants\/[a-f0-9-]{36}))?)$/.test(
			path
		);
	if (!allowed || !['GET', 'POST', 'DELETE'].includes(request.method))
		return json({ displayError: 'Unknown training action.' }, { status: 404 });
	const body = request.method === 'POST' ? await request.text() : undefined;
	if (body && body.length > 4096)
		return json({ displayError: 'Request too large.' }, { status: 413 });
	try {
		const response = await fetch(`${env.LOVAT_API_BASE}/collection/training/${path}${url.search}`, {
			method: request.method,
			headers: {
				'Content-Type': 'application/json',
				Authorization: request.headers.get('authorization') ?? ''
			},
			body
		});
		return new Response(await response.text(), {
			status: response.status,
			headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
		});
	} catch {
		return json({ displayError: 'Training server is unavailable. Try again.' }, { status: 503 });
	}
};
export const GET = handle;
export const POST = handle;
export const DELETE = handle;
