import type { AppAction, ActionContext } from '#lib/app/actions.ts';
export type AssignmentAction = { type: 'assignments.autoassign' };
export function handleAssignmentAction(
	a: AppAction,
	c: ActionContext,
): boolean {
	if (a.type !== 'assignments.autoassign') return false;
	c.session.assignments.autoAssign(
		Number(c.session.values['assignments.limit'] ?? 10),
	);
	c.open(c.returnRoute ?? 'assignments.teams', false);
	return true;
}
