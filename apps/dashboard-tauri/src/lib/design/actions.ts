import { isQuestionType } from '#lib/features/questions/model.ts';
import type { DesignNode } from '#lib/design/model.ts';
import { textOf } from '#lib/design/model.ts';
import { parentRoute, type RouteName } from '#lib/app/routing/routes.ts';
import type { AppAction } from '#lib/app/actions.ts';
import type { FormTab } from '#lib/features/forms/actions.ts';
const globals: Record<string, RouteName> = {
	'At tournament': 'settings.tournament',
	'Team Source': 'settings.team-source',
	'Tournament Source': 'settings.tournament-source',
	'Lovat API': 'apiKeys.list',
	'Export data': 'settings.export',
	'Manage my Team': 'settings.team',
	'View all members': 'members.list',
	'Promote Analysts': 'members.promote',
	'Create form': 'forms.templates',
	'Find a template': 'forms.templates',
	'Use template': 'forms.questions',
	'Add new question': 'questions.type',
	Questions: 'forms.questions',
	Assignments: 'forms.assignments.team',
	Type: 'questions.type',
	Options: 'questions.options.rating',
	'Save changes': 'forms.questions.saved',
	'Save assignments': 'forms.assignments.team',
	'Create a new key': 'apiKeys.create',
	'Rename key': 'apiKeys.rename',
	'Delete key': 'apiKeys.delete-one',
	'Apply changes': 'settings.home',
	'Just this tournament': 'settings.tournament-source',
	'Just my team': 'settings.team-source',
	Promote: 'members.profile.promote-confirm',
	'Remove account': 'members.profile.remove-confirm',
	'Delete my Account': 'members.profile.delete-confirm',
	'Log out': 'settings.analyst',
	'Delete form': 'forms.delete-confirm',
};
/** Translate source component names/labels once; feature handlers receive typed actions. */
export function destination(
	route: RouteName,
	node: DesignNode,
): RouteName | undefined {
	const label = textOf(node);
	if (node.name === 'Question selection') return 'forms.questions.selected';
	if (
		node.id === 'I5775:10088;54:171;43:192' ||
		node.id === 'I5775:10088;54:171'
	)
		return 'forms.create';
	if (
		node.name === 'Icon' &&
		node.children.some(
			(c) => typeof c !== 'string' && c.src === '/design-assets/3589c.svg',
		)
	)
		return route === 'forms.list' ? 'forms.create' : 'forms.template';
	if (node.name === 'TabBarItem')
		return (
			(
				{
					Home: 'home',
					Scouting: 'scouting.rankings',
					Forms: 'forms.list',
					Picklists: 'alliances.home',
					Strategy: 'alliances.bracket',
				} as Record<string, RouteName>
			)[label] ?? 'home'
		);
	if (label === 'Lovat') return 'catalog';
	if (node.name === 'Avatar' || (node.name === 'Action' && label === 'CC'))
		return 'settings.home';
	if (node.name === 'lucide/refresh-ccw')
		return (
			(
				{
					'alliances.waiting': 'alliances.scheduled',
					'alliances.scheduled': 'alliances.selecting',
					'alliances.selecting': 'alliances.bracket',
					'alliances.bracket': 'alliances.home',
				} as Partial<Record<RouteName, RouteName>>
			)[route] ?? 'alliances.home'
		);
	if (node.name === 'Segment')
		return label === 'Official Rank'
			? 'scouting.rankings'
			: label === 'Record'
				? 'scouting.rankings.record'
				: 'scouting.rankings.score';
	if (node.name === 'lucide/arrow-left') return parentRoute(route);
	if (node.name === 'lucide/settings') return 'settings.home';
	if (node.name === 'lucide/wand') return 'assignments.autoassign';
	if (node.name === 'lucide/info') return 'forms.coverage.match';
	if (node.name === 'lucide/pencil')
		return route.startsWith('questions.options.')
			? 'questions.option-edit'
			: route === 'assignments.shifts'
				? 'assignments.shift-edit'
				: 'assignments.alliance-shift-edit';
	if (node.name === 'lucide/square-pen' && route.startsWith('members.profile.'))
		return ['members.profile.self', 'members.profile.self-updated'].includes(
			route,
		)
			? 'members.profile.rename-self'
			: 'members.profile.rename-admin';
	if (node.name === 'lucide/copy')
		return route === 'apiKeys.created'
			? 'apiKeys.created'
			: 'assignments.alliance-shifts';
	if (node.name === 'TableRow')
		return route === 'apiKeys.list'
			? 'apiKeys.single'
			: route === 'apiKeys.single'
				? 'apiKeys.multiple'
				: 'apiKeys.list';
	if (label === 'Cancel') return parentRoute(route);
	if (label === 'Done')
		return route === 'apiKeys.created'
			? 'apiKeys.create-success'
			: 'settings.team';
	if (label === 'Create') return 'apiKeys.created';
	if (label === 'Rename')
		return route === 'apiKeys.rename'
			? 'apiKeys.rename-success'
			: route === 'members.profile.rename-self'
				? 'members.profile.self'
				: 'members.profile.admin';
	if (label === 'Change') return 'settings.team.email-updated';
	if (label === 'Resend') return 'settings.team.resend';
	if (label === 'Button' && route === 'settings.team.resend')
		return 'settings.team.email-confirmed';
	if (label === 'Assign') return 'assignments.teams';
	if (label === 'Delete')
		return (
			(
				{
					'forms.questions.selected': 'forms.questions.delete-confirm',
					'apiKeys.delete-one': 'apiKeys.delete-success',
					'apiKeys.delete-multiple': 'apiKeys.delete-multiple-success',
					'forms.questions.delete-confirm': 'forms.questions.deleted',
				} as Partial<Record<RouteName, RouteName>>
			)[route] ?? 'assignments.shifts'
		);
	if (label === 'Edit') return 'questions.options.rating';
	if (label === 'Manage assignments')
		return route === 'forms.assignments.team'
			? 'assignments.teams'
			: [
						'forms.assignments.alliance',
						'forms.coverage.alliance',
						'forms.coverage.alliance-expanded',
				  ].includes(route)
				? 'assignments.alliance-shifts'
				: 'assignments.shifts';
	if (node.name === 'SelectableCard') {
		if (route === 'forms.questions')
			return label.startsWith('Rate')
				? 'questions.options.rating'
				: label.startsWith('Photo')
					? 'questions.options.photo'
					: label.startsWith('Have')
						? 'questions.options.single'
						: label.startsWith('What')
							? 'questions.options.multiple'
							: 'questions.options.text';
		if (label === 'Add a scouter') return 'assignments.autoassign';
		if (label === 'Add a shift')
			return route === 'assignments.shifts'
				? 'assignments.shift-edit'
				: 'assignments.alliance-shift-edit';
	}
	if (label in globals) return globals[label];
	if (node.name === 'ListItem') {
		if (route === 'forms.templates') return 'forms.template';
		for (const [prefix, target] of Object.entries(globals))
			if (label.startsWith(prefix + ' ')) return target;
		if (label.startsWith('Email')) return 'settings.team.email';
		if (/^(DCMP|SF Pit|\[WIP\])/.test(label)) return 'forms.questions';
		if (label.startsWith('CC Collin')) return 'members.profile.self';
		if (route.startsWith('members.') && !route.startsWith('members.profile'))
			return 'members.profile.admin';
	}
	if (label === 'Matches') return 'scouting.matches';
	if (label === 'Teams') return 'scouting.rankings';
	if (node.name.startsWith('Qualification '))
		return route === 'forms.assignments.match'
			? 'forms.coverage.match-expanded'
			: route === 'forms.assignments.alliance'
				? 'forms.coverage.alliance-expanded'
				: 'scouting.matches';
	if (node.name === 'lucide/plus' || node.name === 'lucide/plus-circle')
		return 'forms.create';
}
export function actionForNode(
	route: RouteName,
	node: DesignNode,
	scope: string,
): AppAction | undefined {
	const label =
			node.label ||
			node.children.filter((c) => typeof c === 'string').join(' '),
		target = destination(route, node);
	if (label === 'Add new question') return { type: 'questions.create' };
	if (node.draftQuestionId)
		return { type: 'questions.edit', id: node.draftQuestionId };
	if (node.editOption)
		return { type: 'questions.editOption', option: node.editOption };
	if (node.responseDetail)
		return { type: 'navigation.open', route: node.responseDetail };
	if (node.formTabValue)
		return { type: 'forms.tab', tab: node.formTabValue as FormTab };
	if (node.collapseKey) return { type: 'ui.collapse', key: node.collapseKey };
	if (node.filter) return { type: 'scouting.filter', ...node.filter };
	if (node.backAction || node.name === 'lucide/arrow-left')
		return { type: 'navigation.back' };
	if (node.step) return { type: 'questions.step', ...node.step };
	if (node.name === 'lucide/search') return { type: 'search.open', scope };
	if (/^Promote \d+ Analysts?$/.test(label))
		return { type: 'members.promoteSelected' };
	if (label === 'Promote' && route === 'members.profile.promote-confirm')
		return { type: 'members.promote' };
	if (
		node.name === 'lucide/settings' &&
		([
			'forms.questions',
			'forms.assignments.team',
			'assignments.teams',
			'forms.assignments.match',
			'forms.assignments.alliance',
		].includes(route) ||
			route.startsWith('forms.response'))
	)
		return { type: 'navigation.open', route: 'forms.settings' };
	if (node.name === 'lucide/eye') return { type: 'questions.preview' };
	if (node.name === 'lucide/copy' && route === 'forms.settings')
		return { type: 'forms.copy' };
	if (label === 'Delete' && route === 'forms.delete-confirm')
		return { type: 'forms.delete' };
	if (label === 'Export form data') return { type: 'forms.export' };
	if (label === 'Publish form as a template') return { type: 'forms.publish' };
	if (node.rowChoiceKey)
		return { type: 'selection.toggle', key: node.rowChoiceKey };
	if (
		route === 'questions.type' &&
		node.typeValue &&
		isQuestionType(node.typeValue)
	)
		return { type: 'questions.selectType', kind: node.typeValue };
	if (textOf(node) === 'Options')
		return { type: 'questions.phase', phase: 'Options' };
	if (label === 'Create' && route === 'apiKeys.create')
		return { type: 'apiKeys.create' };
	if (label === 'Rename' && route === 'apiKeys.rename')
		return { type: 'apiKeys.rename' };
	if (
		label === 'Delete' &&
		['apiKeys.delete-one', 'apiKeys.delete-multiple'].includes(route)
	)
		return { type: 'apiKeys.delete' };
	if (label === 'Save' && route === 'questions.option-edit')
		return { type: 'questions.optionSave' };
	if (label === 'Assign' && route === 'assignments.autoassign')
		return { type: 'assignments.autoassign' };
	if (label === 'Cancel') return { type: 'navigation.cancel' };
	if (/^Delete \d+ keys$/.test(label))
		return { type: 'navigation.open', route: 'apiKeys.delete-multiple' };
	if (label === 'Select all') return { type: 'selection.all', scope };
	if (label === 'Just my team' || label === 'Just this tournament')
		return { type: 'selection.first', scope };
	if (label === 'Apply changes') return { type: 'settings.apply', scope };
	if (route === 'forms.create' && node.control === 'button')
		return { type: 'forms.create' };
	if (node.memberName && node.name === 'ListItem' && target)
		return { type: 'members.open', name: node.memberName, route: target };
	if (node.name === 'ListItem' && /^(DCMP|SF Pit|\[WIP\])/.test(textOf(node)))
		return {
			type: 'forms.open',
			kind: /Superscout/i.test(textOf(node))
				? 'match'
				: /Break/i.test(textOf(node))
					? 'alliance'
					: 'team',
		};
	if (node.name === 'SelectableCard' && route === 'forms.questions' && target)
		return { type: 'questions.openReference', route: target };
	return target
		? {
				type: 'navigation.open',
				route: target,
				replace: node.name === 'Tab' || node.name === 'Segment',
				navbar: node.name === 'TabBarItem',
			}
		: undefined;
}
