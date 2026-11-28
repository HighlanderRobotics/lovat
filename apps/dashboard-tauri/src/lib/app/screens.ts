import type { Component } from 'svelte';
import type { RouteName } from '#lib/app/routing/routes.ts';
import type { AppAction } from '#lib/app/actions.ts';
import type { DashboardSession } from '#lib/app/session.svelte.ts';
import QuestionPage from '#lib/features/questions/QuestionPage.svelte';
export interface FeaturePageProps {
	session: DashboardSession;
	route: RouteName;
	onaction: (action: AppAction) => void;
}
export interface FeatureScreen {
	component: Component<FeaturePageProps>;
	when?: (session: DashboardSession) => boolean;
	preload?: (session: DashboardSession) => Promise<void>;
}
const question: FeatureScreen = {
	component: QuestionPage,
	when: (session) => session.questions.creatingQuestion,
};
/** Add native feature pages here. A native page needs no Figma frame or scene fixture. */
export const featureScreens: Partial<Record<RouteName, FeatureScreen>> = {
	'questions.type': question,
	'questions.options.rating': question,
	'questions.options.text': question,
	'questions.options.photo': question,
	'questions.options.single': question,
	'questions.options.multiple': question,
};
export function screenFor(
	route: RouteName,
	session: DashboardSession,
): FeatureScreen | undefined {
	const screen = featureScreens[route];
	return screen && (!screen.when || screen.when(session)) ? screen : undefined;
}
