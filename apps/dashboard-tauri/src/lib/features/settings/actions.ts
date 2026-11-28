import type { AppAction, ActionContext } from '#lib/app/actions.ts';
export type SettingsAction = { type: 'settings.apply'; scope: string };
export function handleSettingsAction(a: AppAction, c: ActionContext): boolean {
	if (a.type !== 'settings.apply') return false;
	c.session.apply(a.scope);
	c.open('settings.home');
	return true;
}
