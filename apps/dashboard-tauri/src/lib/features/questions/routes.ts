import type { RouteName } from '#lib/app/routing/routes.ts';
export const optionScreens: Record<string, RouteName> = {
	Rating: 'questions.options.rating',
	Photo: 'questions.options.photo',
	'Single select': 'questions.options.single',
	'Multiple Select': 'questions.options.multiple',
	'Short Answer Text': 'questions.options.text',
};
