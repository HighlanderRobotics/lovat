import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, fetch }) => {
	if (!/^\d{4}$/.test(params.year) || !/^\d{1,10}$/.test(params.number))
		return new Response(null, { status: 404 });

	if (!env.LOVAT_API_BASE) return new Response(null, { status: 503 });

	try {
		const response = await fetch(
			`${env.LOVAT_API_BASE}/v1/teams/${params.number}/avatar/${params.year}`,
			{ signal: AbortSignal.timeout(10_000) }
		);

		if (!response.ok) return new Response(null, { status: response.status });

		const type = response.headers.get('content-type') ?? '';

		if (!/^image\/(png|jpeg|gif|webp)(;|$)/.test(type)) return new Response(null, { status: 502 });

		return new Response(response.body, {
			headers: {
				'content-type': type,
				'cache-control': 'public, max-age=86400',
				'x-content-type-options': 'nosniff'
			}
		});
	} catch {
		return new Response(null, { status: 503 });
	}
};
