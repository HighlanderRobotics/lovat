import { actionForNode } from '#lib/design/actions.ts';
import { DashboardSession } from '#lib/app/session.svelte.ts';
import type { RouteName } from '#lib/app/routing/routes.ts';
import { optionScreens } from '#lib/features/questions/routes.ts';
import { apiKeysFromScene } from '#lib/design/apiKeys.ts';
import { teamsFromScene } from '#lib/design/assignments.ts';
import { enhanceScene, nodes } from '#lib/design/behaviors.ts';
import { textOf, type DesignNode } from '#lib/design/model.ts';

/** Add behavior to translated design data without modifying reference geometry. */
export function prepareScene(
	source: DesignNode,
	frame: RouteName,
	runtime: DashboardSession,
): DesignNode {
	const optionType = Object.entries(optionScreens).find(
		([, screen]) => screen === frame,
	)?.[0];
	if (optionType) runtime.questions.questionType = optionType;
	if (
		['assignments.teams', 'assignments.autoassign'].includes(frame) &&
		!runtime.assignments.assignmentItems.length
	)
		runtime.assignments.assignmentItems = teamsFromScene(source);
	if (runtime.scope(frame) === 'api-keys' && !runtime.apikeys.apiRecords) {
		runtime.apikeys.apiRecords = apiKeysFromScene(source);
		for (const record of runtime.apikeys.apiRecords)
			runtime.apikeys.apiSelected[record.id] = !!record.initialSelected;
	}
	const questionKind =
		optionType ??
		(
			{
				'questions.preview.rating': 'Rating',
				'questions.preview.text': 'Short Answer Text',
				'questions.preview.photo': 'Photo',
				'questions.preview.single': 'Single select',
				'questions.preview.multiple': 'Multiple Select',
			} as Record<string, string>
		)[frame] ??
		runtime.questions.questionType;
	const tree = structuredClone(source);
	enhanceScene(tree, frame);
	if (nodes(tree).some((node) => node.formTabValue))
		runtime.forms.formTab ??= [
			'forms.questions',
			'forms.questions.deleted',
			'forms.questions.saved',
			'forms.questions.selected',
			'forms.questions.delete-confirm',
		].includes(frame)
			? 'Questions'
			: [
						'forms.responses.team',
						'forms.responses.match',
						'forms.responses.alliance',
				  ].includes(frame)
				? 'Responses'
				: 'Assignments';
	for (const node of nodes(tree)) {
		if (node.numberKey)
			runtime.questions.numbers[node.numberKey] ??= Number(textOf(node));
		if (node.filter)
			runtime.scouting.filters[node.filter.group] ??= node.filter.value;
	}
	const scope = runtime.scope(frame);
	if (scope === 'api-keys')
		for (const node of nodes(tree))
			if (node.name === 'Table') {
				node.apiTable = true;
				node.style += ';width:100%;max-width:100%';
			}
	let index = 0;
	const choices: { key: string; label: string; initial: boolean }[] = [];
	function visit(node: DesignNode, parent?: DesignNode, table?: DesignNode) {
		if (
			parent &&
			!parent.style.includes('flex-direction:column') &&
			node.style.includes('flex:1 0 0')
		)
			node.inlineFlex = true;
		const label = textOf(node);
		if (node.choiceGroup === '5775:10128') {
			node.choiceGroup = 'forms.creation-method';
			node.choiceDefault =
				node.choiceDefault === '5775:10130' ? 'own' : 'template';
			node.choiceValue =
				node.choiceValue === '5775:10130'
					? 'own'
					: node.choiceValue === '5775:10131'
						? 'template'
						: node.choiceValue;
		}
		if (node.choiceValue === '5775:10130') node.choiceValue = 'own';
		if (node.name === 'TabBarItem') {
			node.navLabel = label;
			for (const child of nodes(node)) {
				if (child.tag === 'p') child.style += ';color:inherit';
				if (child.tag === 'img') child.navIcon = label;
			}
		}
		if (node.name === 'TableRow' || node.name === 'TableHeader') table = node;
		if (
			node.name === 'Input' &&
			nodes(node).some((child) => child.control === 'input')
		)
			node.style += ';flex:1 1 70px;min-width:70px';
		if (node.control === 'input') {
			const placeholder =
				/^(Search\b|Filter by\b|Enter new\b|Add scout$)/i.test(
					node.label ?? '',
				);
			node.inputKey =
				scope === 'api-keys' &&
				!/^(Search\b|Filter by\b)/i.test(node.label ?? '')
					? 'apiKeys.name'
					: node.questionHintFor
						? `hint:${node.questionHintFor}`
						: /^(Search\b|Filter by\b)/i.test(node.label ?? '')
							? `search:${scope}`
							: ((
									{
										'5775:11380': 'assignments.limit',
										'5775:14381': 'questions.option.label',
										'5775:14383': 'questions.option.hint',
									} as Record<string, string>
								)[node.id ?? ''] ?? `field:${node.id}`);
			node.placeholder ??= placeholder ? node.label : textOf(node);
			runtime.values[node.inputKey] ??= placeholder ? '' : (node.value ?? '');
		}
		if (
			!node.previewRadio &&
			(node.name === 'Checkbox' ||
				node.name === 'Radio' ||
				node.name === 'Toggle')
		) {
			const markup = JSON.stringify(node);
			const kind =
				node.name === 'Checkbox'
					? scope === 'at'
						? 'radio'
						: 'checkbox'
					: 'switch';
			const all = scope === 'api-keys' && table?.name === 'TableHeader';
			const rowName = table
				? textOf(
						nodes(table).find((child) => child.name === 'Name cell') ?? table,
					)
				: '';
			const key = all
				? `${scope}:all`
				: scope === 'api-keys'
					? `${scope}:${rowName}`
					: kind === 'switch'
						? label === 'Accept responses'
							? 'form:accept'
							: `question:${questionKind}:required`
						: `${scope}:${index++}`;
			const initial =
				kind === 'switch'
					? markup.includes('/893af.svg')
					: markup.includes('/554ed.svg') || markup.includes('/2e4a4.svg');
			node.choice = {
				kind,
				key,
				group: scope,
				initial,
				all,
				label:
					label ||
					(all ? 'Select all keys' : `Select ${textOf(table ?? node)}`),
			};
			if (!all) choices.push({ key, label, initial });
			if (scope === 'api-keys' && !all) {
				runtime.checks[key] ??= initial;
				if (table) table.rowChoiceKey = key;
			}
			if (kind === 'radio' && initial) runtime.groups[scope] ??= key;
		}
		node.searchScope = scope;
		if (node.memberRole && node.memberName)
			node.children = [
				runtime.members.promoted[node.memberName]
					? 'Scouting Lead'
					: textOf(node),
			];
		if (node.searchBar)
			node.searchPlaceholder =
				scope === 'at' || scope === 'tournaments'
					? 'Search tournaments'
					: scope === 'members'
						? 'Search members'
						: scope === 'api-keys'
							? 'Search API keys'
							: scope === 'analysts'
								? 'Search users'
								: 'Search teams';
		node.searchable =
			!!node.searchRow ||
			!!node.rankRow ||
			['ListItem', 'TableRow', 'SelectableCard'].includes(node.name) ||
			node.id === '5494:3064' ||
			(node.name === 'Checkbox' && !table && !parent?.searchRow && !!label) ||
			node.name.startsWith('Qualification ');
		if (frame === 'questions.type' && node.name === 'SelectableCard')
			node.typeValue = label;
		if (frame === 'questions.type' && node.label === 'Save changes')
			node.typeSave = true;
		if (
			parent?.name === 'ListItem' &&
			['At tournament', 'Team Source', 'Tournament Source'].some((prefix) =>
				textOf(parent).startsWith(prefix),
			)
		) {
			const prefix = textOf(parent).split(' ').slice(0, 2).join(' ');
			const group =
				prefix === 'At tournament'
					? 'at'
					: prefix === 'Team Source'
						? 'teams'
						: 'tournaments';
			function summary(child: DesignNode) {
				if (
					child.children.length === 1 &&
					typeof child.children[0] === 'string' &&
					child.children[0] !== prefix
				)
					child.summaryScope = group;
				for (const nested of child.children)
					if (typeof nested !== 'string') summary(nested);
			}
			// This runs on the row's content wrapper, which contains its label/value.
			summary(node);
		}
		for (const child of node.children)
			if (typeof child !== 'string') visit(child, node, table);
	}
	visit(tree);
	if (
		choices.length &&
		(!runtime.choices[scope] ||
			(scope === 'api-keys' && !nodes(tree).some((node) => node.dialogSurface)))
	) {
		runtime.choices[scope] = choices;
		for (const item of choices) runtime.checks[item.key] ??= item.initial;
	}
	for (const node of nodes(tree))
		node.action = actionForNode(frame, node, scope);
	return tree;
}
