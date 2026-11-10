// The pinned upstream component passes an invalid CSS font shorthand to FontFaceSet.load.
// Keep this patch local until Magnolia fixes it; fail installation if its source changes.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const original = 'document.fonts.load("Material Symbols Rounded Full");';
const replacement = `void document.fonts.load('16px "Material Symbols Rounded Full"').catch(() => {
          fullIconsWillLoad = false;
        });`;

/** @param {string} source */
export function patchFontLoad(source) {
	if (source.includes(replacement)) return source;
	if (!source.includes(original))
		throw new Error(
			'Magnolia font source changed: review or remove the local font fallback patch.'
		);
	return source.replace(original, replacement);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const path = new URL(
		'../node_modules/magnolia-ui-svelte/dist/components/controllers/MagnoliaUIRoot.svelte',
		import.meta.url
	);
	writeFileSync(path, patchFontLoad(readFileSync(path, 'utf8')));
}
