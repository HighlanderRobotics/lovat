import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/svelte';
import { afterEach, beforeEach, vi } from 'vitest';
beforeEach(() => {
	vi.stubGlobal(
		'fetch',
		vi.fn(() => {
			throw new Error('Unexpected component network request');
		})
	);
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});
