import type { RouteName } from '#lib/app/routing/routes.ts';
declare global {
	const __APP_VERSION__: string;
	const __BUILD_NUMBER__: string;
	const __DEV_TOKEN__: string;
	interface ImportMetaEnv {
		readonly LOVAT_API_BASE?: string;
		readonly LOVAT_WEBSITE_URL?: string;
		readonly LOVAT_SANDBOX_AUTH0_DOMAIN?: string;
		readonly LOVAT_SANDBOX_AUTH0_WEB_CLIENT_ID?: string;
		readonly LOVAT_SANDBOX_AUTH0_AUDIENCE?: string;
	}
	namespace App {
		interface PageState {
			activeTab?: RouteName;
			dashboardHistory?: RouteName[];
			modalOrigin?: RouteName;
		}
	}
}

export {};
