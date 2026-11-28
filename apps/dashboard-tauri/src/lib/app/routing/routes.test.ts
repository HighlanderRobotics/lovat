import { describe, it, expect } from 'vitest';
import {
	routes,
	routeNames,
	routeForPath,
	routePath,
	isRouteName,
} from '#lib/app/routing/routes.ts';
import {
	referenceCatalog,
	referenceId,
	resolveRoute,
} from '#lib/design/references.ts';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
describe('route registry and feature boundaries', () => {
	it('has unique canonical paths and valid parent routes', () => {
		expect(new Set(routeNames.map(routePath)).size).toBe(routeNames.length);
		for (const name of routeNames) {
			expect(isRouteName(routes[name].parent)).toBe(true);
			expect(routeForPath(routePath(name))).toBe(name);
			expect(routePath(name)).not.toMatch(/\d{4}[-:]\d+/);
		}
	});
	it('retains all reference deep links at the adapter boundary', () => {
		expect(referenceCatalog).toHaveLength(104);
		for (const frame of referenceCatalog) {
			expect(referenceId(frame.route)).toBe(frame.id);
			expect(resolveRoute(`/design/${frame.id.replace(':', '-')}`)).toBe(
				frame.route,
			);
			expect(resolveRoute(routePath(frame.route))).toBe(frame.route);
		}
		expect(resolveRoute('/forms')).toBe('forms.list');
		expect(resolveRoute('/')).toBe('home');
	});
	it('keeps source IDs out of application and feature code', () => {
		function visit(path: string) {
			for (const entry of readdirSync(path, { withFileTypes: true })) {
				const file = join(path, entry.name);
				if (entry.isDirectory()) visit(file);
				else if (/\.(ts|svelte)$/.test(file) && !file.endsWith('.test.ts')) {
					const source = readFileSync(file, 'utf8');
					expect(source, file).not.toMatch(/(?:5775|5787):\d+/);
					if (path.includes('/features/') || path.includes('/shared/'))
						expect(source, file).not.toMatch(/from ['"]#lib\/design\//);
				}
			}
		}
		for (const folder of ['app', 'features', 'shared'])
			visit(join(process.cwd(), 'src/lib', folder));
	});
});
