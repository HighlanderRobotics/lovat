import type { Choice } from './runtime.svelte.ts';

export interface DesignNode {
	typeSave?: boolean; rowChoiceKey?: string; choice?: Choice; inputKey?: string; placeholder?: string; searchScope?: string; searchable?: boolean; typeValue?: string; summaryScope?: string;
	tag: string;
	id?: string;
	name: string;
	style: string;
	children: (DesignNode | string)[];
	src?: string;
	control?: 'button' | 'field' | 'input';
	label?: string;
	variant?: 'primary' | 'secondary' | 'tertiary' | 'danger';
	value?: string;
	inputType?: string;
	choiceGroup?: string;
	choiceDefault?: string;
	choiceValue?: string;
}

export function textOf(node: DesignNode | string): string {
	return typeof node === 'string'
		? node
		: node.children.map(textOf).join(' ').replace(/\s+/g, ' ').trim();
}

/** Fit full-page containers below the native status bar; keep control sizes. */
export function frameStyle(style: string, delta: number): string {
	if (!delta) return style;
	return style.replace(
		/(^|;)(height|top):(\d+(?:\.\d+)?)px(?=;|$)/g,
		(match, separator, property, value) =>
			Number(value) >= 650
				? `${separator}${property}:${Math.max(0, Number(value) - delta)}px`
				: match,
	);
}
