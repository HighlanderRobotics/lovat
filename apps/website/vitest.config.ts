import { defineConfig, mergeConfig } from 'vitest/config';
import { svelteTesting } from '@testing-library/svelte/vite';
import viteConfig from './vite.config';

export default mergeConfig(
	viteConfig,
	defineConfig({
		plugins: [svelteTesting()],
		test: {
			reporters: ['default', 'html'],
			outputFile: { html: 'test-report/index.html' },
			projects: [
				{
					extends: true,
					test: {
						name: 'server',
						environment: 'node',
						include: ['test/**/*.node.test.ts'],
						setupFiles: ['test/setup.node.ts']
					}
				},
				{
					extends: true,
					test: {
						name: 'components',
						environment: 'jsdom',
						include: ['test/**/*.dom.test.ts'],
						setupFiles: ['test/setup.dom.ts']
					}
				}
			],
			coverage: {
				provider: 'v8',
				reportsDirectory: 'test-report/coverage',
				reporter: ['text', 'html', 'lcov'],
				include: [
					'src/hooks.server.ts',
					'src/lib/util/sendSignedRequest.ts',
					'src/lib/util/apiError.js',
					'src/lib/server/trainingSocketUrl.ts',
					'src/routes/(with-nav)/contact/+page.server.ts',
					'src/routes/(with-nav)/api/slack/interaction/+server.ts',
					'src/routes/**/verify/**/+page.server.ts',
					'src/lib/components/TimeAgo.svelte'
				],
				thresholds: { lines: 80, statements: 80, functions: 80, branches: 75 }
			}
		}
	})
);
