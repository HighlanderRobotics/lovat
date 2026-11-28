import frames from '#lib/design/frame-map.json';
import manifest from '#lib/design/manifest.json';
import layouts from '#lib/design/layouts.json';
import { routeForPath, type RouteName } from '#lib/app/routing/routes.ts';
import type { ScreenLayout } from '#lib/design/layout.ts';
export function referenceId(route: RouteName): string | undefined {
	return route === 'catalog'
		? undefined
		: (frames as Partial<Record<RouteName, string>>)[route];
}
export function referenceRoute(id: string): RouteName | undefined {
	return (Object.keys(frames) as Exclude<RouteName, 'catalog'>[]).find(
		(route) => (frames as Partial<Record<RouteName, string>>)[route] === id,
	);
}
export function resolveRoute(path: string): RouteName {
	return (
		routeForPath(path) ??
		referenceRoute(path.split('/').at(-1)!.replace('-', ':')) ??
		(
			{
				'/': 'home',
				'/index.html': 'home',
				'/home': 'home',
				'/forms': 'forms.list',
				'/match_schedule': 'scouting.matches',
				'/tournament_teams': 'scouting.rankings',
				'/settings': 'settings.home',
				'/my_alliance': 'alliances.home',
			} as Record<string, RouteName>
		)[path] ??
		'home'
	);
}
export function referenceFrame(route: RouteName) {
	return manifest.find((frame) => frame.id === referenceId(route));
}
export function referenceLayout(route: RouteName): ScreenLayout {
	return (layouts[referenceId(route) as keyof typeof layouts] ??
		{}) as ScreenLayout;
}
export function sceneKey(route: RouteName): string {
	return `./scenes/${referenceId(route)?.replace(':', '-')}.json`;
}
export const referenceCatalog = manifest.map((frame) => ({
	...frame,
	route: referenceRoute(frame.id)!,
}));
