import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { changelogLink, compileChangelog } from './changelog.mjs';

test('the repository changelog retains every month, feature, and change', () => {
	const source = readFileSync(new URL('../../../CHANGELOG.md', import.meta.url), 'utf8');
	const months = compileChangelog(source);
	assert.equal(months.length, (source.match(/^## (?!Unreleased)/gm) ?? []).length);
	assert.equal(
		months.flatMap((month) => month.features).length,
		(source.match(/^### /gm) ?? []).length
	);
	const html = months.flatMap((month) => month.features.map((feature) => feature.html)).join('');
	assert.equal((html.match(/<li>/g) ?? []).length, (source.match(/^- /gm) ?? []).length);
	assert(!months.some((month) => month.title === 'Unreleased'));
	assert(!html.includes('href="docs/'));
	assert(html.includes('/blob/main/docs/history/2022.md#2022-12'));
});

test('links preserve external and local anchors and rewrite repository paths', () => {
	assert.equal(
		changelogLink('docs/history/2026.md#2026-10'),
		'https://github.com/HighlanderRobotics/lovat/blob/main/docs/history/2026.md#2026-10'
	);
	assert.equal(changelogLink('https://example.com/fix'), 'https://example.com/fix');
	assert.equal(
		changelogLink('docs/migration'),
		'https://github.com/HighlanderRobotics/lovat/tree/main/docs/migration'
	);
	assert.equal(changelogLink('#october-2026'), '#october-2026');
	assert.equal(changelogLink('javascript:alert(1)'), null);
	assert.equal(changelogLink('data:text/html,example'), null);
});

test('formatting and multiline changes render without executable HTML or links', () => {
	const [month] = compileChangelog(
		`## October 2026\n\n### Scouting\n\n- **Fixed** a \`report\`\n  with [details](docs/fix.md).\n- [Unsafe](javascript:alert%281%29) <img src=x onerror=alert(1)>\n`
	);
	const html = month.features[0].html;
	assert(html.includes('<strong>Fixed</strong>'));
	assert(html.includes('<code>report</code>'));
	assert(!html.includes('href="javascript:'));
	assert(!html.includes('<img'));
	assert(html.includes('&#60;img'));
});

test('invalid or empty source fails the build rather than serving an empty page', () => {
	assert.throws(() => compileChangelog('# Changelog'), /no monthly entries/);
	assert.throws(() => compileChangelog('## Typo 2026'), /Expected a month heading/);
});

test('Unreleased shows feature changes without editor instructions', () => {
	const [entry] = compileChangelog(
		'## Unreleased\n\nAdd upcoming changes here.\n\n### Website\n\n- Added a changelog page.\n'
	);
	assert.equal(entry.title, 'Unreleased');
	assert.equal(entry.html, '');
	assert(entry.features[0].html.includes('Added a changelog page.'));
});
