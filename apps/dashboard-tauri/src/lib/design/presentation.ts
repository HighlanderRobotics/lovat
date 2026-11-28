import type { DesignNode } from '#lib/design/model.ts';
import type { ScreenLayout } from '#lib/design/layout.ts';
export interface Dock {
	key: string;
	node: DesignNode;
}
export interface Presentation {
	page: DesignNode;
	docks: Dock[];
	layout: ScreenLayout;
}

/** Docked controls stay outside page remounts and page animations. */
export function presentation(
	scene: DesignNode,
	layout: ScreenLayout,
	reference = false,
): Presentation {
	if (reference) return { page: scene, docks: [], layout };
	const page = structuredClone(scene),
		docks: Dock[] = [];
	const counts = { footer: 0, nav: 0 };
	function extract(node: DesignNode) {
		node.children = node.children.filter((child) => {
			if (typeof child === 'string') return true;
			const kind = layout[child.id ?? '']?.kind;
			if (kind === 'footer' || kind === 'nav') {
				docks.push({ key: `${kind}:${counts[kind]++}`, node: child });
				return false;
			}
			extract(child);
			return true;
		});
	}
	extract(page);
	return { page, docks, layout };
}

export function apiToolbar(count: number): Dock[] {
	const button = (
		label: string,
		variant: 'primary' | 'secondary' | 'danger',
	): DesignNode => ({
		tag: 'div',
		name: 'Button',
		control: 'button',
		label,
		variant,
		searchScope: 'api-keys',
		style: `height:44px;width:100%;border-radius:8px;background:${variant === 'primary' ? '#b59aff' : variant === 'danger' ? '#a8302e' : '#3c3c3c'};color:${variant === 'primary' ? '#1f1f1f' : '#e6e6e6'}`,
		children: [label],
	});
	return [
		{
			key: 'footer:0',
			node: {
				tag: 'div',
				id: 'runtime:api-toolbar',
				name: 'ApiToolbar',
				style: 'display:flex;flex-direction:column;gap:10px;width:341px',
				children:
					count === 0
						? [button('Create a new key', 'primary')]
						: count === 1
							? [
									button('Rename key', 'secondary'),
									button('Delete key', 'danger'),
								]
							: [button(`Delete ${count} keys`, 'danger')],
			},
		},
	];
}

import type { DashboardSession } from '#lib/app/session.svelte.ts';
export function buttonLabel(node: DesignNode, session: DashboardSession) {
	const label = node.label ?? '';
	const count = session.count(node.searchScope ?? '');
	if (label === 'Select all')
		return session.allSelected(node.searchScope ?? '')
			? 'Deselect all'
			: 'Select all';
	if (/^Promote \d+ Analysts?$/.test(label))
		return `Promote ${count} Analyst${count === 1 ? '' : 's'}`;
	if (node.searchScope === 'api-keys' && /^Delete (key|\d+ keys)$/.test(label))
		return count === 1 ? 'Delete key' : `Delete ${count} keys`;
	return label;
}
