import { beforeEach, afterEach, vi } from 'vitest';
import { env } from '$env/dynamic/private';

// Per-worker mutable synthetic configuration; no real deployment secrets are loaded.
vi.mock('$env/dynamic/private', () => ({ env: {} }));
beforeEach(() => {
	for (const key of Object.keys(env)) delete env[key];
	vi.stubGlobal(
		'fetch',
		vi.fn(() => {
			throw new Error('Unexpected outbound request: install an explicit test stub');
		})
	);
});
afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});
