import { Marked } from 'marked';

const repository = 'https://github.com/HighlanderRobotics/lovat/blob/main/';
const escape = (/** @type {string} */ text) =>
	text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

/** @param {string} href */
export function changelogLink(href) {
	if (href.startsWith('#')) return href;
	const url = new URL(href, repository);
	if (!/^[a-z][a-z0-9+.-]*:/i.test(href) && !/\.[^/]+$/.test(url.pathname)) {
		url.pathname = url.pathname.replace('/blob/main/', '/tree/main/');
	}
	return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
}

const markdown = new Marked({
	async: false,
	renderer: {
		// Repository Markdown provides content, not executable HTML.
		html: ({ text }) => escape(text),
		image: ({ text }) => escape(text),
		link({ href, tokens }) {
			const label = this.parser.parseInline(tokens);
			const url = changelogLink(href);
			return url ? `<a href="${escape(url)}">${label}</a>` : label;
		}
	}
});

/** @param {string} title */
const slug = (title) =>
	title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

/**
 * @typedef {{ title: string, id: string, html: string }} Feature
 * @typedef {{ title: string, id: string, year: string, html: string, features: Feature[] }} Month
 */

/** @param {string} source @returns {Month[]} */
export function compileChangelog(source) {
	/** @type {Month[]} */
	const months = [];
	/** @type {Month | undefined} */
	let month;
	/** @type {Feature | undefined} */
	let feature;

	for (const token of markdown.lexer(source)) {
		if (token.type === 'heading' && token.depth === 2) {
			const match =
				/^(?:January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})$/.exec(
					token.text
				);
			if (token.text !== 'Unreleased' && !match) {
				throw new Error(`Expected a month heading in CHANGELOG.md, received: ${token.text}`);
			}
			month = {
				title: token.text,
				id: slug(token.text),
				year: match?.[1] ?? '',
				html: '',
				features: []
			};
			months.push(month);
			feature = undefined;
		} else if (token.type === 'heading' && token.depth === 3 && month) {
			feature = { title: token.text, id: `${month.id}-${slug(token.text)}`, html: '' };
			month.features.push(feature);
		} else if (month && token.type !== 'space') {
			const target = feature ?? month;
			target.html += markdown.parse(token.raw);
		}
	}

	// Do not publish the empty Unreleased editing instructions.
	const published = months.filter(
		(entry) => entry.title !== 'Unreleased' || entry.features.length > 0
	);
	for (const entry of published) {
		if (entry.title === 'Unreleased') entry.html = '';
	}
	if (!published.length) throw new Error('CHANGELOG.md contains no monthly entries');
	return published;
}
