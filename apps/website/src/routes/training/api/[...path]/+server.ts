import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const handle: RequestHandler = async ({ params, request, url, fetch }) => {
	if (!env.LOVAT_API_BASE)
		return json(
			{ displayError: 'Training is unavailable right now. Please try again later.' },
			{ status: 503 }
		);
	if (params.path === 'config' && request.method === 'GET') {
		const base = new URL(env.LOVAT_PUBLIC_API_BASE || env.LOVAT_API_BASE);
		base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
		base.username = '';
		base.password = '';
		base.search = '';
		base.hash = '';
		base.pathname = '/collection/training/socket';
		return json({ socketUrl: base.toString() });
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
			signal: AbortSignal.timeout(15000),
			headers: {
				'Content-Type': 'application/json',
				Authorization: request.headers.get('authorization') ?? ''
			},
			body
		});
		return new Response(response.status === 204 ? null : await response.text(), {
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
