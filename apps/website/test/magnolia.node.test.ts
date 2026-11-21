import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { patchFontLoad } from '../scripts/patch-magnolia.mjs';
test('font patch uses valid shorthand, catches offline failure and is idempotent', () => {
	const patched = patchFontLoad('document.fonts.load("Material Symbols Rounded Full");');
	expect(patched).toContain('16px "Material Symbols Rounded Full"');
	expect(patched).toContain('fullIconsWillLoad = false');
	expect(patchFontLoad(patched)).toBe(patched);
});
test('clean install applied the patch and unexpected upstream changes demand review', () => {
	const source = readFileSync(
		new URL(
			'../node_modules/magnolia-ui-svelte/dist/components/controllers/MagnoliaUIRoot.svelte',
			import.meta.url
		),
		'utf8'
	);
	expect(patchFontLoad(source)).toBe(source);
	expect(() => patchFontLoad('upstream changed')).toThrow('review or remove');
});
