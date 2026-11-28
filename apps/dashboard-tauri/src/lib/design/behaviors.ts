import { routes, type RouteName } from '#lib/app/routing/routes.ts';
import { textOf, type DesignNode } from '#lib/design/model.ts';

export function nodes(root: DesignNode): DesignNode[] {
	return [
		root,
		...root.children.flatMap((child) =>
			typeof child === 'string' ? [] : nodes(child),
		),
	];
}

/** Behavioral annotations for reference nodes that are not native controls. */
export function enhanceScene(tree: DesignNode, frame: RouteName) {
	const all = nodes(tree);
	for (const node of all) {
		if (node.name === 'Back') {
			node.backAction = true;
			for (const child of nodes(node).slice(1)) child.passive = true;
		}
		if (node.name === 'Stepper') {
			const index = all.filter((n) => n.name === 'Stepper').indexOf(node);
			const key = `${frame}:limit:${index}`;
			node.stepperKey = key;
			for (const child of node.children)
				if (typeof child !== 'string') {
					if (child.name === 'minus' || child.name === 'plus') {
						child.step = { key, delta: child.name === 'plus' ? 1 : -1 };
						child.actionLabel = `${child.name === 'plus' ? 'Increase' : 'Decrease'} ${textOf(node) === '1' ? 'minimum' : 'maximum'} value`;
					}
					if (child.name === 'Value')
						for (const value of nodes(child))
							if (value.tag === 'p') value.numberKey = key;
				}
		}
	}
	for (const icon of all.filter((node) => node.name === 'lucide/search')) {
		icon.searchTrigger = true;
		icon.style += ';z-index:12';
	}
	if (
		[
			'scouting.rankings',
			'scouting.rankings.record',
			'scouting.rankings.score',
		].includes(frame)
	) {
		const body = all.find((node) => node.name === 'Body');
		for (const row of body?.children ?? [])
			if (typeof row !== 'string' && /^\d+\s*[⁃-]/.test(textOf(row)))
				row.rankRow = true;
	}
	for (const wrapper of all)
		if (
			wrapper.style.includes('grid') &&
			wrapper.children.some(
				(child) => typeof child !== 'string' && child.name === 'Checkbox',
			)
		) {
			wrapper.searchRow = true;
			wrapper.style +=
				';display:flex;width:100%;grid-template-columns:none;grid-template-rows:none';
			for (const child of wrapper.children)
				if (typeof child !== 'string' && child.name === 'Checkbox')
					child.style += ';width:100%';
		}
	const steppers = all.filter((node) => node.name === 'Stepper');
	if (steppers.length === 2)
		for (const [index, stepper] of steppers.entries())
			for (const child of nodes(stepper))
				if (child.step) {
					child.step.minKey = steppers[0].stepperKey;
					child.step.maxKey = steppers[1].stepperKey;
					if (frame === 'questions.options.multiple')
						child.actionLabel = `${child.step.delta > 0 ? 'Increase' : 'Decrease'} ${index === 0 ? 'minimum' : 'maximum'} selections`;
				}
	if (frame === 'assignments.teams') {
		const board = all.find((node) => node.id === '5775:10290');
		if (board) {
			board.teamAssignments = true;
			board.style += ';padding-top:2px';
		}
	}
	if (frame === 'assignments.autoassign') {
		const picker = all.find((node) => node.name === 'MultiSelect');
		if (picker) picker.scouterSelect = true;
	}
	const searchIcon = all.find((node) => node.name === 'lucide/search');
	for (const bar of all.filter((node) => node.name === 'TopBar'))
		if (
			searchIcon ||
			[
				'scouting.rankings',
				'scouting.rankings.record',
				'scouting.rankings.score',
			].includes(frame)
		) {
			bar.searchBar = true;
			bar.searchPlaceholder =
				frame === 'members.list'
					? 'Search members'
					: frame === 'apiKeys.list'
						? 'Search API keys'
						: ['settings.tournament', 'settings.tournament-source'].includes(
									frame,
							  )
							? 'Search tournaments'
							: frame === 'members.promote'
								? 'Search users'
								: 'Search teams';
		}
	for (const list of all.filter(
		(node) =>
			node.name === 'TabList' &&
			/Questions Assignments Responses/.test(textOf(node)),
	)) {
		for (const tab of list.children)
			if (typeof tab !== 'string') {
				tab.formTabValue = textOf(tab);
				for (const child of nodes(tab).slice(1)) child.passive = true;
			}
		const body = all.find((node) => node.children.includes(list));
		if (body && !frame.startsWith('forms.responses.')) {
			for (const child of body.children)
				if (typeof child !== 'string' && child !== list)
					child.hideForResponses = true;
			body.children.push({
				tag: 'div',
				name: 'ResponsesSummary',
				style:
					'padding:24px 12px;display:flex;flex-direction:column;gap:8px;width:100%;color:#e6e6e6',
				responseSummary: true,
				children: [
					{
						tag: 'p',
						name: '',
						style: 'font:500 20px/28px Roboto,sans-serif',
						children: ['Responses'],
					},
					{
						tag: 'p',
						name: '',
						style: 'font:400 15px/22px Roboto,sans-serif;color:#b7b7b7',
						children: ['45 responses'],
					},
				],
			});
		}
	}
	// Collapse each heading's following siblings up to the next heading.
	for (const parent of all) {
		let section: string | undefined;
		for (const child of parent.children)
			if (typeof child !== 'string') {
				if (
					child.name === 'Header' &&
					nodes(child).some((n) => n.src === '/design-assets/427e3.svg')
				) {
					section = `section:${frame}:${textOf(child)}`;
					child.collapseKey = section;
					for (const descendant of nodes(child).slice(1))
						descendant.passive = true;
				} else if (section) child.collapseGroup = section;
			}
		const chips = parent.children.find(
			(child) => typeof child !== 'string' && child.name === 'Chips',
		) as DesignNode | undefined;
		if (chips) {
			const group = `schedule:${frame}`;
			for (const chip of chips.children)
				if (typeof chip !== 'string' && chip.name === 'Chip') {
					chip.filter = { group, value: textOf(chip) };
					for (const descendant of nodes(chip).slice(1))
						descendant.passive = true;
				}
			for (const row of parent.children.slice(
				parent.children.indexOf(chips) + 1,
			))
				if (typeof row !== 'string' && textOf(row) && row.name !== 'Header') {
					const cards = nodes(row).filter((n) =>
						n.name.startsWith('Qualification '),
					);
					for (const item of cards.length ? cards : [row])
						item.filterItem = {
							group,
							status: chips.children.some(
								(c) => typeof c !== 'string' && textOf(c) === 'Team',
							)
								? /Alliance-match/.test(textOf(item))
									? 'Alliance-match'
									: /Team-match/.test(textOf(item))
										? 'Team-match'
										: 'Team'
								: /Unassigned|No assignment/i.test(textOf(item))
									? 'Unassigned'
									: nodes(item).some((n) => n.name === 'lucide/circle-check')
										? 'Submitted'
										: 'Assigned',
						};
				}
		}
	}
	if (frame === 'settings.team') {
		const body = all.find((node) => node.name === 'Body');
		if (body) body.style += ';padding-top:12px;gap:12px';
		const container = all.find((node) => node.id === '5775:16153');
		if (container) container.style += ';flex:0 0 auto;height:auto';
		const action = all.find((node) => node.id === '5775:16166');
		if (action) {
			action.leftAction = false;
			action.control = 'button';
			action.label = 'Promote Analysts';
			action.variant = 'secondary';
			action.style += ';justify-content:center;text-align:center;opacity:1';
		}
	}
	if (frame === 'forms.assignments.team')
		for (const node of all) {
			if (
				node.style.includes('height:39px') &&
				node.style.includes('align-items:flex-end')
			)
				node.style +=
					';margin-left:auto;padding-right:0;min-width:96px;width:96px';
		}
	if (
		[
			'scouting.matches',
			'scouting.matches.team',
			'home',
			'home.search',
		].includes(frame)
	)
		for (const node of all) {
			if (node.id === '5494:10967') node.name = 'Checkbox';
			if (node.name === 'Body')
				node.style += ';padding-left:16px;padding-right:16px';
			if (node.name === 'MultiSelect') node.filterSelect = true;
			if (node.name.startsWith('Qualification ')) {
				node.matchLevel = 'Quals';
				node.style += ';width:100%';
			}
			if (node.name.startsWith('Break ')) node.style += ';width:100%';
		}
	if (['home', 'home.search'].includes(frame)) {
		const hero = all.find((node) => node.name === 'image 7');
		if (hero) {
			hero.style += ';width:100%;height:100%';
		}
		const banner = all.find((n) => n.children.includes(hero!));
		if (banner) {
			banner.style +=
				';flex:1 1 186px;min-height:80px;max-height:186px;height:auto';
			for (const title of banner.children)
				if (typeof title !== 'string' && title.tag === 'p')
					title.style += ';top:auto;bottom:7px';
		}
	}
	if (
		['questions.options.single', 'questions.options.multiple'].includes(frame)
	) {
		let optionIndex = 0;
		for (const card of all.filter(
			(node) =>
				node.name === 'SelectableCard' &&
				nodes(node).some((child) => child.name === 'lucide/pencil'),
		)) {
			const parent = all.find((node) => node.children.includes(card));
			if (!parent) continue;
			let target: DesignNode;
			if (
				parent.children.every(
					(child) =>
						child === card ||
						(typeof child !== 'string' &&
							child.control === 'button' &&
							child.variant === 'danger'),
				)
			) {
				const outer = all.find((node) => node.children.includes(parent));
				target =
					outer?.children.length === 1 && /height:53px/.test(outer.style)
						? outer
						: parent;
			} else {
				target = {
					tag: 'div',
					id: `runtime:option:${card.id}`,
					name: 'OptionRow',
					style: 'width:100%;position:relative;flex-shrink:0',
					children: [card],
				};
				parent.children.splice(parent.children.indexOf(card), 1, target);
			}
			const title = nodes(card).find((child) => child.tag === 'p');
			const label = textOf(title ?? card);
			target.swipeKey = `option:${frame === 'questions.options.single' ? 'Single select' : 'Multiple Select'}:${optionIndex++}`;
			target.swipeLabel = label;
			const description = nodes(card).filter((child) => child.tag === 'p')[1];
			target.swipeHint = description ? textOf(description) : '';
			if (description) description.optionHintKey = target.swipeKey;
			else
				nodes(card)
					.find((n) => n.name === 'Text')
					?.children.push({
						tag: 'p',
						name: 'OptionHint',
						style:
							'font:400 13px/18px Roboto,sans-serif;color:#b7b7b7;width:100%',
						optionHintKey: target.swipeKey,
						children: [],
					});
			target.style += ';height:auto;min-height:53px';
			for (const row of nodes(target))
				if (/height:53px/.test(row.style))
					row.style += ';height:auto;min-height:53px';
			target.children = [card];
			card.passive = true;
			if (title) title.optionTextKey = target.swipeKey;
			for (const child of nodes(card))
				if (child.name === 'lucide/pencil')
					child.editOption = {
						key: target.swipeKey,
						label,
						hint: target.swipeHint,
					};
		}
	}
	if (frame === 'questions.option-edit')
		for (const field of all.filter(
			(n) => textOf(n) === 'Placeholder' && n.tag === 'p',
		)) {
			field.control = 'input';
			field.label = 'Hint';
			field.placeholder = 'Hint';
			field.value = '';
			field.children = [];
		}
	if (frame === 'questions.options.multiple')
		for (const field of all.filter(
			(n) => n.control === 'input' && n.value === 'Multiple Select',
		)) {
			field.value = '';
			field.label = 'Hint';
			field.placeholder = 'Hint';
			field.children = [];
		}
	if (frame === 'questions.options.multiple') {
		const title = all.find(
			(node) => node.control === 'input' && node.value?.startsWith('Have they'),
		);
		if (title) {
			title.value = 'What parts of their robot have broken?';
			title.label = 'Question title';
			title.children = [title.value];
		}
	}
	if (
		[
			'members.list',
			'members.search',
			'members.removed',
			'members.promoted',
		].includes(frame)
	)
		tree.children.push({
			tag: 'div',
			id: 'runtime:members-promote',
			name: 'Button',
			control: 'button',
			variant: 'primary',
			label: 'Promote Analysts',
			leftAction: false,
			style:
				'height:44px;width:341px;border-radius:8px;background:#b59aff;color:#171717;font:500 15px/20px Roboto,sans-serif;text-align:center;justify-content:center',
			children: ['Promote Analysts'],
		});

	if (
		frame.startsWith('forms.response') ||
		frame.startsWith('questions.preview.') ||
		['forms.settings', 'forms.delete-confirm'].includes(frame)
	) {
		for (const node of all) {
			if (node.id === '5494:10967') node.name = 'Checkbox';
			if (node.name === 'Body')
				node.style +=
					';left:0;width:393px;padding-left:26px;padding-right:26px';
			if (node.name === 'TopBar') node.style += ';width:393px';
			if (
				node.name === 'Tab' &&
				['Team', 'Match', 'Alliance'].includes(textOf(node))
			) {
				node.disabled = true;
				node.passive = true;
				node.style += ';opacity:.5;pointer-events:none';
				for (const child of nodes(node).slice(1)) child.passive = true;
			}
			if (node.name === 'TextArea') node.style += ';height:auto';
			if (
				node.previewRadio &&
				['Accept responses', 'Required'].includes(textOf(node))
			) {
				node.previewRadio = false;
				node.name = 'Toggle';
			}
			if (node.previewRadio) {
				node.choice = {
					kind: 'radio',
					key: textOf(node),
					group: 'preview:single',
					initial: false,
					label: textOf(node),
				};
			}
			if (node.name === 'ListItem' && /Uploaded/.test(textOf(node))) {
				node.responseDetail =
					frame === 'forms.responses.match'
						? 'forms.response.match'
						: frame === 'forms.responses.alliance'
							? 'forms.response.alliance'
							: 'forms.response.team';
			}
		}
		// Preview cards are dialogs above the live editor, matching Figma's blurred overlay.
		if (
			[
				'questions.preview.rating',
				'questions.preview.text',
				'questions.preview.photo',
				'questions.preview.single',
				'questions.preview.multiple',
			].includes(frame)
		) {
			const card = tree.children.find(
				(child) => typeof child !== 'string' && child.name === 'SelectableCard',
			);
			if (card && typeof card !== 'string') card.name = 'Dialog';
		}
	}
	if (frame === 'questions.type')
		for (const card of all.filter((node) => node.name === 'SelectableCard')) {
			const icon = nodes(card).find((node) => node.name.startsWith('lucide/'));
			if (icon) icon.typeIcon = icon.name.replace('lucide/', '');
		}
	if (
		[
			'members.list',
			'members.search',
			'members.removed',
			'members.promoted',
		].includes(frame)
	) {
		const names = [
			'Collin C',
			'Leo K',
			'Jack S',
			'Cassie C',
			'Ted E',
			'Rohan S',
			'Gabi S',
			'Theo C',
			'Ronan S',
			'Sam C',
			'Ryan M',
			'Kevin C',
		];
		for (const [index, row] of all
			.filter((n) => n.id === '5494:3064')
			.entries()) {
			const name = names[index];
			row.memberName = name;
			row.name = 'ListItem';
			for (const child of nodes(row).slice(1)) child.passive = true;
			for (const child of nodes(row))
				if (child.tag === 'p') {
					if (textOf(child) === 'Title') child.children = [name];
					if (textOf(child) === 'Description') child.children = ['Team 8033'];
					if (
						textOf(child) === 'Analyst' ||
						textOf(child) === 'Scouting Lead'
					) {
						child.memberRole = true;
						child.memberName = name;
					}
				}
		}
	}
	if (
		['members', 'analysts'].includes(
			frame === 'members.promote'
				? 'analysts'
				: [
							'members.list',
							'members.search',
							'members.removed',
							'members.promoted',
					  ].includes(frame)
					? 'members'
					: '',
		)
	)
		for (const row of all.filter(
			(n) => n.name === 'Checkbox' || n.name === 'ListItem',
		)) {
			const label = textOf(row);
			const name = [
				'Collin C',
				'Leo K',
				'Jack S',
				'Cassie C',
				'Ted E',
				'Rohan S',
				'Gabi S',
				'Theo C',
				'Ronan S',
				'Sam C',
				'Ryan M',
				'Kevin C',
				'Ed B',
				'Jacob K',
			].find((name) => label.includes(name));
			if (name) {
				row.memberName = name;
				if (row.name === 'Checkbox') row.promotionUser = name;
				else
					for (const child of nodes(row))
						if (
							child.tag === 'p' &&
							/^(Analyst|Admin|Lead|Scouter)$/.test(textOf(child))
						) {
							child.memberRole = true;
							child.memberName = name;
						}
			}
		}

	for (const action of all.filter(
		(node) =>
			node.control === 'button' &&
			/^Promote(?: (?:\d+ )?Analysts?)?$/.test(node.label ?? ''),
	)) {
		action.leftAction = false;
		action.style +=
			';justify-content:center;text-align:center;font:500 15px/20px Roboto,sans-serif;color:#171717';
		for (const child of nodes(action).slice(1))
			child.style += ';color:inherit;font:inherit;text-align:center';
	}
	if (frame === 'settings.team')
		for (const action of all.filter(
			(node) => node.label === 'Promote Analysts',
		)) {
			action.leftAction = false;
			action.style += ';justify-content:center;text-align:center';
		}
	// Put dialogs above a real backdrop rather than blurring their own ancestors.
	const dialogs = all.filter((node) => node.name === 'Dialog');
	if (dialogs.length) {
		for (const parent of all)
			parent.children = parent.children.filter(
				(child) => typeof child === 'string' || !dialogs.includes(child),
			);
		tree.children.push({
			tag: 'div',
			name: 'DialogBackdrop',
			actionLabel: 'Close dialog',
			style:
				'position:fixed;inset:0;z-index:40;background:#0003;backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px)',
			children: [],
		});
		for (const dialog of dialogs) {
			const previewTop = /top:([\d.]+)px/.exec(dialog.style)?.[1];
			const preview = frame.startsWith('questions.preview.');
			dialog.dialogSurface = true;
			dialog.style +=
				';translate:none;rotate:none;scale:none;right:auto;bottom:auto;margin:0;box-sizing:border-box';
			dialog.style +=
				';position:fixed;left:50%;top:calc((100% - var(--keyboard-inset,0px))/2);transform:translate(-50%,-50%);width:min(358px,calc(100% - 32px));max-height:calc(100% - var(--keyboard-inset,0px) - 48px);overflow-y:auto;z-index:50';
			if (preview)
				dialog.style += `;width:min(341px,calc(100% - 52px));top:clamp(12px,${previewTop ?? 206}px,calc(100% - var(--keyboard-inset,0px) - ${frame === 'questions.preview.multiple' ? 354 : frame === 'questions.preview.rating' ? 112 : 185}px - 12px));transform:translateX(-50%)`;
			tree.children.push(dialog);
		}
	}

	if (
		[
			'forms.questions',
			'forms.questions.deleted',
			'forms.questions.saved',
			'forms.questions.selected',
			'forms.questions.delete-confirm',
		].includes(frame)
	) {
		for (const card of all.filter((node) => node.name === 'SelectableCard'))
			card.questionCard = true;
		const first = all.find((node) => node.name === 'SelectableCard');
		const wrapper = first
			? all.find((node) => node.children.includes(first))
			: undefined;
		const parent =
			wrapper && /height:\d+px/.test(wrapper.style)
				? all.find((node) => node.children.includes(wrapper))
				: wrapper;
		if (parent)
			parent.children.push({
				tag: 'div',
				name: 'SavedQuestions',
				savedQuestions: true,
				style: 'width:100%;display:flex;flex-direction:column;gap:12px',
				children: [],
			});
	}
	const questionKinds: Record<string, string> = {
		'questions.preview.rating': 'Rating',
		'questions.preview.text': 'Short Answer Text',
		'questions.preview.photo': 'Photo',
		'questions.preview.single': 'Single select',
		'questions.preview.multiple': 'Multiple Select',
	};
	const previewKind = questionKinds[frame];
	if (previewKind) {
		const card = tree.children.find(
			(child) => typeof child !== 'string' && child.dialogSurface,
		) as DesignNode | undefined;
		const header = card?.children[0];
		if (header && typeof header !== 'string') {
			const heading = nodes(header).find((node) => node.name === 'Text');
			if (heading) {
				heading.questionHeadingFor = previewKind;
				heading.children = heading.children.slice(0, 1);
				heading.style +=
					';position:relative;left:0;top:0;width:100%;height:auto;overflow:visible';
				header.style +=
					';height:auto;min-height:24px;display:flex;padding-left:36px';
			}
			if (card && ['Single select', 'Multiple Select'].includes(previewKind)) {
				let index = 0;
				for (const option of nodes(card).filter(
					(n) => n.name === 'Radio' || n.name === 'Checkbox',
				)) {
					const labels = nodes(option)
						.filter((n) => n.tag === 'p')
						.map(textOf);
					const key = `option:${previewKind}:${index++}`;
					option.previewOption = {
						key,
						label: labels[0] ?? '',
						hint: labels[1] ?? '',
					};
					option.previewRadio = true;
					option.choice = {
						kind: previewKind === 'Single select' ? 'radio' : 'checkbox',
						key: `answer:${key}`,
						group: `preview:${previewKind}`,
						label: labels[0] ?? '',
						initial: false,
					};
				}
			}
		}
	}
	if (
		['questions.options.single', 'questions.options.multiple'].includes(frame)
	) {
		const kind =
			frame === 'questions.options.single'
				? 'Single select'
				: 'Multiple Select';
		const required = all.find(
			(node) => node.name === 'Radio' && textOf(node) === 'Required',
		);
		const parent = required
			? all.find((node) => node.children.includes(required))
			: undefined;
		if (parent && required)
			parent.children.splice(parent.children.indexOf(required) + 1, 0, {
				tag: 'div',
				name: 'QuestionHint',
				style: 'width:100%;display:flex;flex-direction:column;gap:6px',
				children: [
					{
						tag: 'p',
						name: '',
						style: 'font:500 13px/18px Roboto,sans-serif',
						children: ['Hint'],
					},
					{
						tag: 'div',
						name: 'Field',
						style:
							'width:100%;min-height:44px;border-radius:8px;outline:1px solid #666;background:#0003;display:flex;align-items:center;padding:0 12px',
						children: [
							{
								tag: 'p',
								id: `hint:${kind}`,
								name: '',
								style: '',
								control: 'input',
								label: 'Question hint',
								questionHintFor: kind,
								placeholder: 'Hint',
								value: '',
								children: [],
							},
						],
					},
				],
			});
	}
	if (routes[frame].profile) {
		for (const node of all)
			if (node.tag === 'p') {
				if (textOf(node).includes('Collin C')) node.profileCopy = textOf(node);
				if (textOf(node) === 'Analyst') node.profileRole = true;
			}
		for (const node of all)
			if (node.name === 'TopBar') {
				node.profileBar = true;
				node.profileEdit = nodes(node).find(
					(child) => child.name === 'lucide/square-pen',
				);
				node.profileEditIcon = node.profileEdit
					? nodes(node.profileEdit).find((child) => child.src)?.src
					: undefined;
				node.style +=
					';width:393px;height:44px;left:0;padding:0 4px;box-sizing:border-box';
				for (const child of node.children)
					if (typeof child !== 'string' && child.name === 'Bar')
						child.style += ';width:100%;height:44px;align-items:center';
			}
		for (const child of tree.children)
			if (typeof child !== 'string') {
				if (child.tag === 'p') {
					child.style = child.style.replace(
						/top:(\d+)px/,
						(_, top) => `top:${Number(top) + 34}px`,
					);
					child.style +=
						';left:50%;transform:translateX(-50%);text-align:center;z-index:2';
				}
				if (child.name === 'Avatar')
					child.style += ';left:calc(50% - 50px);top:72px;z-index:2';
			}
	}
}
