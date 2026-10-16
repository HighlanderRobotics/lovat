import { sveltekit } from '@sveltejs/kit/vite';
import { imagetools } from 'vite-imagetools';
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compileChangelog } from './scripts/changelog.mjs';

const changelogPath = fileURLToPath(new URL('../../CHANGELOG.md', import.meta.url));
const changelogModule = '\0virtual:lovat-changelog';

export default defineConfig({
	plugins: [
		imagetools(),
		{
			name: 'lovat-changelog',
			resolveId(id) {
				if (id === 'virtual:lovat-changelog') return changelogModule;
			},
			load(id) {
				if (id !== changelogModule) return;
				this.addWatchFile(changelogPath);
				return `export default ${JSON.stringify(compileChangelog(readFileSync(changelogPath, 'utf8')))};`;
			},
			handleHotUpdate({ file, server }) {
				if (file !== changelogPath) return;
				const module = server.moduleGraph.getModuleById(changelogModule);
				if (module) server.moduleGraph.invalidateModule(module);
				server.ws.send({ type: 'full-reload' });
				return [];
			}
		},
		sveltekit()
	]
});
