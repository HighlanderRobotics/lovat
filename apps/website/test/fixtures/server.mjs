import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
const pit = readFileSync(new URL('./pit.json', import.meta.url));
const server = createServer(async (req, res) => {
	res.setHeader('content-type', 'application/json');
	if (req.url?.startsWith('/v1/analysis/pitdisplay?')) {
		res.end(pit);
		return;
	}
	if (req.url === '/v1/manager/onboarding/verifyemail' && req.method === 'POST') {
		let body = '';
		for await (const chunk of req) body += chunk;
		const { code } = JSON.parse(body);
		res.statusCode = code === 'VALID' ? 200 : 400;
		res.end(JSON.stringify({ code: code === 'EXPIRED' ? 'CODE_EXPIRED' : 'CODE_NOT_RECOGNIZED' }));
		return;
	}
	res.statusCode = 404;
	res.end('{}');
});
server.listen(9876, process.env.FIXTURE_HOST || '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());
