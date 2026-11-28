import type { AppAction, ActionContext } from '#lib/app/actions.ts';
export type ApiKeyAction =
	| { type: 'apiKeys.create' }
	| { type: 'apiKeys.rename' }
	| { type: 'apiKeys.delete' };
export function handleApiKeyAction(a: AppAction, c: ActionContext): boolean {
	const s = c.session;
	switch (a.type) {
		case 'apiKeys.create':
			c.submit(
				'apiKeys.name',
				() => {
					s.apikeys.createKey(s.values['apiKeys.name'] ?? '');
					s.values['search:api-keys'] = '';
					s.searchOpen['api-keys'] = false;
				},
				'apiKeys.created',
			);
			break;
		case 'apiKeys.rename':
			c.submit(
				'apiKeys.name',
				() => s.apikeys.renameKey(s.values['apiKeys.name'] ?? ''),
				'apiKeys.rename-success',
			);
			break;
		case 'apiKeys.delete':
			s.apikeys.deleteKeys();
			c.open(
				c.route === 'apiKeys.delete-one'
					? 'apiKeys.delete-success'
					: 'apiKeys.delete-multiple-success',
			);
			break;
		default:
			return false;
	}
	return true;
}
