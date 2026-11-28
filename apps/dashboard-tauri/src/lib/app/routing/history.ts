import type { Direction } from '#lib/app/routing/pageMotion.ts';
import { routes, viewBase, type RouteName } from '#lib/app/routing/routes.ts';
const tabs = ['Home', 'Scouting', 'Forms', 'Picklists', 'Strategy'];
export function navbarLabel(route: RouteName) {
	return routes[route].tab;
}
export function navbarDirection(from: RouteName, to: RouteName): Direction {
	const current = tabs.indexOf(navbarLabel(from) ?? ''),
		target = tabs.indexOf(navbarLabel(to) ?? '');
	return current >= 0 && target >= 0 && target < current ? 'back' : 'forward';
}
/** Revisit an existing entry instead of creating an A → B → A history loop. */
export function revisitDelta(history: RouteName[], target: RouteName): number {
	const index = history.findLastIndex(
		(route) => viewBase(route) === viewBase(target),
	);
	return index < 0 ? 0 : index - history.length;
}
