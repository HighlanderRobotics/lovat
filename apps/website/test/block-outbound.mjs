// Only the local synthetic API is reachable from the built Node server in browser tests.
// This preload is test-only and never imported by application code.
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
	const url = new URL(input instanceof Request ? input.url : input);
	if (url.origin !== 'http://127.0.0.1:9876')
		throw new Error(`Blocked test network request: ${url.origin}`);
	return originalFetch(input, init);
};
