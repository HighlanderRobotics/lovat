import { isTauri } from '#lib/config.ts';

type AuthModule = typeof import('./web');

let modulePromise: Promise<AuthModule> | null = null;

function impl(): Promise<AuthModule> {
	modulePromise ??= isTauri ? import('./native') : import('./web');
	return modulePromise;
}

export const auth = {
	login: async () => (await impl()).login(),
	logout: async () => (await impl()).logout(),
	getAccessToken: async () => (await impl()).getAccessToken(),
	isAuthenticated: async () => (await impl()).isAuthenticated()
};
