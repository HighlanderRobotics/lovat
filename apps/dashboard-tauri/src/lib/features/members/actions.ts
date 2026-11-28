import type { AppAction, ActionContext } from '#lib/app/actions.ts';
import type { RouteName } from '#lib/app/routing/routes.ts';
export type MemberAction =
	| { type: 'members.open'; name: string; route: RouteName }
	| { type: 'members.promoteSelected' }
	| { type: 'members.promote' };
export function handleMemberAction(a: AppAction, c: ActionContext): boolean {
	const s = c.session;
	switch (a.type) {
		case 'members.open':
			s.members.activeMember = a.name;
			c.open(a.route);
			break;
		case 'members.promoteSelected':
			s.promoteAnalysts();
			c.notify(s.members.promotionNotice);
			c.open('members.list', false);
			break;
		case 'members.promote':
			s.members.promoted[s.members.activeMember] = true;
			c.notify(`Promoted ${s.members.activeMember}`);
			c.open('members.list', false);
			break;
		default:
			return false;
	}
	return true;
}
