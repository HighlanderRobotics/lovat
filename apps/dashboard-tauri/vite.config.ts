import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
	plugins: [
		sveltekit({
			// The Dashboard is a client-only SPA in both the browser and Tauri.
			adapter: adapter({ fallback: 'index.html' }),
			alias: { $lib: 'src/lib' }
		})
	],
	// Keep the Flutter build's variable names so hosting config is shared.
	envPrefix: ['VITE_', 'LOVAT_'],
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
		__BUILD_NUMBER__: JSON.stringify(process.env.LOVAT_BUILD_NUMBER ?? '33')
	},
	clearScreen: false,
	server: {
		port: 1420,
		strictPort: true,
		host: host || false,
		hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
		watch: { ignored: ['**/src-tauri/**'] }
	},
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node'
	}
});
