import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createHmac } from 'crypto';

export async function sendSignedRequest(path: string, method: string, body: string, base?: string) {
	const apiBase = base ?? env.LOVAT_API_BASE;
	if (!env.LOVAT_SIGNING_KEY || !apiBase) {
		throw error(503, 'Server integration is not configured');
	}
	const timestamp = Math.floor(Date.now() / 1000);
	const signature = createHmac('sha256', env.LOVAT_SIGNING_KEY)
		.update(
			JSON.stringify({
				path,
				method,
				body,
				timestamp
			})
		)
		.digest('hex');

	const response = await fetch(`${apiBase}${path}`, {
		method,
		headers: {
			'Content-Type': 'application/json',
			'X-Signature': signature,
			'X-Timestamp': timestamp.toString()
		},
		body
	});

	if (response.status === 401) {
		console.log(`Failed to send signed request: ${response.status} ${await response.text()}`);
		throw new Error('Failed to send signed request');
	}

	return response;
}
