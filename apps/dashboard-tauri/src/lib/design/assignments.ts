import { textOf, type DesignNode } from '#lib/design/model.ts';
import { nodes } from '#lib/design/behaviors.ts';
import type { AssignmentTeam } from '#lib/features/assignments/model.ts';

export function teamsFromScene(scene: DesignNode): AssignmentTeam[] {
	const result: AssignmentTeam[] = [];
	const candidate = (node: DesignNode) =>
		/^\d{2,5}\s/.test(textOf(node)) &&
		nodes(node).some((child) => child.tag === 'img');
	function visit(node: DesignNode, assignee = 'Unassigned') {
		if (node.name === 'SelectableCard')
			assignee = /^(Jack S|Collin C)\b/.exec(textOf(node))?.[1] ?? assignee;
		if (
			candidate(node) &&
			!node.children.some(
				(child) => typeof child !== 'string' && candidate(child),
			)
		) {
			const match = /^(\d{2,5})\s+(.+)$/.exec(textOf(node))!;
			result.push({
				id: node.id ?? `team-${result.length}`,
				number: match[1],
				name: match[2],
				logo: nodes(node).find((child) => child.tag === 'img')?.src,
				assignee,
			});
			return;
		}
		for (const child of node.children)
			if (typeof child !== 'string') visit(child, assignee);
	}
	visit(scene);
	return result;
}
