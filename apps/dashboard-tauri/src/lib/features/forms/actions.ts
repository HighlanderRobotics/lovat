import type { AppAction, ActionContext } from '#lib/app/actions.ts';
import type { RouteName } from '#lib/app/routing/routes.ts';
export type FormKind = 'team' | 'match' | 'alliance';
export type FormTab = 'Questions' | 'Assignments' | 'Responses';
export type FormAction =
	| { type: 'forms.open'; kind: FormKind }
	| { type: 'forms.tab'; tab: FormTab }
	| { type: 'forms.create' }
	| { type: 'forms.delete' }
	| { type: 'forms.copy' }
	| { type: 'forms.publish' }
	| { type: 'forms.export' };
export function formTabRoute(tab: FormTab, kind: FormKind): RouteName {
	return tab === 'Questions'
		? 'forms.questions'
		: tab === 'Assignments'
			? `forms.assignments.${kind}`
			: `forms.responses.${kind}`;
}
export function handleFormAction(a: AppAction, c: ActionContext): boolean {
	const f = c.session.forms;
	switch (a.type) {
		case 'forms.open':
			f.formKind = a.kind;
			f.formTab = 'Questions';
			c.open('forms.questions');
			break;
		case 'forms.tab':
			f.formTab = a.tab;
			c.open(formTabRoute(a.tab, f.formKind), false);
			break;
		case 'forms.create':
			c.open(
				c.choice('forms.creation-method') === 'own'
					? 'forms.questions'
					: 'forms.templates',
			);
			break;
		case 'forms.delete':
			c.open('forms.list', false);
			break;
		case 'forms.copy':
			c.notify('Copied form');
			break;
		case 'forms.publish':
			c.notify('Published form as a template');
			break;
		case 'forms.export': {
			const anchor = document.createElement('a');
			anchor.href = URL.createObjectURL(
				new Blob(
					[
						JSON.stringify(
							{ form: 'DCMP Break Scouting', responses: [] },
							null,
							2,
						),
					],
					{ type: 'application/json' },
				),
			);
			anchor.download = 'DCMP-Break-Scouting.json';
			anchor.click();
			URL.revokeObjectURL(anchor.href);
			break;
		}
		default:
			return false;
	}
	return true;
}
