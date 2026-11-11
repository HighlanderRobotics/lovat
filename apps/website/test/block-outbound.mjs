// Only the local synthetic API is reachable from the built Node server in browser tests.
// This preload is test-only and never imported by application code.
const originalFetch = globalThis.fetch;
const allowedOrigin = new URL(process.env.LOVAT_API_BASE || 'http://127.0.0.1:9876').origin;
globalThis.fetch = (input, init) => {
	const url = new URL(input instanceof Request ? input.url : input);
	if (url.origin !== allowedOrigin) throw new Error(`Blocked test network request: ${url.origin}`);
	return originalFetch(input, init);
};
