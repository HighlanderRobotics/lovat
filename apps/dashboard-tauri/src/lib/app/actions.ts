import type { RouteName } from '#lib/app/routing/routes.ts';
import type { DashboardSession } from '#lib/app/session.svelte.ts';
import type { QuestionAction } from '#lib/features/questions/actions.ts';
import type { FormAction } from '#lib/features/forms/actions.ts';
import type { ApiKeyAction } from '#lib/features/api-keys/actions.ts';
import type { AssignmentAction } from '#lib/features/assignments/actions.ts';
import type { MemberAction } from '#lib/features/members/actions.ts';
import type { SettingsAction } from '#lib/features/settings/actions.ts';
import { handleQuestionAction } from '#lib/features/questions/actions.ts';
import { handleFormAction } from '#lib/features/forms/actions.ts';
import { handleApiKeyAction } from '#lib/features/api-keys/actions.ts';
import { handleAssignmentAction } from '#lib/features/assignments/actions.ts';
import { handleMemberAction } from '#lib/features/members/actions.ts';
import { handleSettingsAction } from '#lib/features/settings/actions.ts';
export type AppAction =
	| QuestionAction
	| FormAction
	| ApiKeyAction
	| AssignmentAction
	| MemberAction
	| SettingsAction
	| {
			type: 'navigation.open';
			route: RouteName;
			replace?: boolean;
			navbar?: boolean;
	  }
	| { type: 'navigation.back' }
	| { type: 'navigation.cancel' }
	| { type: 'ui.collapse'; key: string }
	| { type: 'scouting.filter'; group: string; value: string }
	| { type: 'search.open'; scope: string }
	| { type: 'selection.toggle'; key: string }
	| { type: 'selection.all'; scope: string }
	| { type: 'selection.first'; scope: string };
export interface ActionContext {
	session: DashboardSession;
	route: RouteName;
	returnRoute?: RouteName;
	open: (
		route: RouteName,
		remember?: boolean,
		direction?: 'forward' | 'back',
		navbar?: boolean,
	) => void;
	back: () => void;
	notify: (message: string) => void;
	submit: (field: string, mutation: () => void, target: RouteName) => void;
	choice: (key: string) => string | undefined;
}
export function dispatch(action: AppAction, ctx: ActionContext): void {
	if (
		handleQuestionAction(action, ctx) ||
		handleFormAction(action, ctx) ||
		handleApiKeyAction(action, ctx) ||
		handleAssignmentAction(action, ctx) ||
		handleMemberAction(action, ctx) ||
		handleSettingsAction(action, ctx)
	)
		return;
	const s = ctx.session;
	switch (action.type) {
		case 'navigation.open':
			if (action.route === 'forms.questions') s.forms.formTab = 'Questions';
			ctx.open(action.route, !action.replace, undefined, action.navbar);
			break;
		case 'navigation.back':
		case 'navigation.cancel':
			ctx.back();
			break;
		case 'ui.collapse':
			s.collapsed[action.key] = !s.collapsed[action.key];
			break;
		case 'scouting.filter':
			s.scouting.filters[action.group] = action.value;
			break;
		case 'search.open':
			s.values[`search:${action.scope}`] ??= '';
			s.searchOpen[action.scope] = true;
			break;
		case 'selection.toggle':
			s.checks[action.key] = !s.checks[action.key];
			s.onSelectionChange?.(s.scope(ctx.route));
			break;
		case 'selection.all':
			s.selectAll(action.scope, false, !s.allSelected(action.scope));
			break;
		case 'selection.first':
			s.selectAll(action.scope, true);
			break;
	}
}
