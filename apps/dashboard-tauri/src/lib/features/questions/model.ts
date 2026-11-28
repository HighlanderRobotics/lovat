export const questionTypes = [
	'Rating',
	'Photo',
	'Single select',
	'Multiple Select',
	'Short Answer Text',
] as const;
export type QuestionType = (typeof questionTypes)[number];
export function isQuestionType(value: string): value is QuestionType {
	return (questionTypes as readonly string[]).includes(value);
}
export const questionIcons: Record<QuestionType, string> = {
	Rating: '/design-assets/8dc48.svg',
	Photo: '/design-assets/9d7f9.svg',
	'Single select': '/design-assets/1e9b7.svg',
	'Multiple Select': '/design-assets/f2888.svg',
	'Short Answer Text': '/design-assets/d943f.svg',
};
export interface QuestionDraft {
	kind: QuestionType | '';
	title: string;
	hint: string;
	required: boolean;
	minimum: number;
	maximum: number;
	maxPhotos: number;
	options: { id: string; label: string; hint: string }[];
}
export function emptyQuestion(): QuestionDraft {
	return {
		kind: '',
		title: '',
		hint: '',
		required: false,
		minimum: 0,
		maximum: 10,
		maxPhotos: 1,
		options: [],
	};
}
export function questionSubtitle(kind: string, required: boolean): string {
	return required ? kind : `${kind} · Optional`;
}
export function validateQuestion(draft: QuestionDraft): Record<string, string> {
	const errors: Record<string, string> = {};
	if (!draft.kind) errors.kind = 'Choose a question type.';
	if (!draft.title.trim()) errors.title = 'Enter a question title.';
	if (
		draft.kind === 'Rating' &&
		(!Number.isFinite(draft.minimum) ||
			!Number.isFinite(draft.maximum) ||
			draft.minimum >= draft.maximum)
	)
		errors.range = 'Maximum must be greater than minimum.';
	if (
		draft.kind === 'Photo' &&
		(!Number.isInteger(draft.maxPhotos) || draft.maxPhotos < 1)
	)
		errors.maxPhotos = 'Allow at least one photo.';
	if (['Single select', 'Multiple Select'].includes(draft.kind)) {
		if (draft.options.length < 2) errors.options = 'Add at least two options.';
		for (const option of draft.options)
			if (!option.label.trim())
				errors[`option:${option.id}`] = 'Enter an option label.';
		if (
			draft.kind === 'Multiple Select' &&
			(!Number.isInteger(draft.minimum) ||
				!Number.isInteger(draft.maximum) ||
				draft.minimum < 0 ||
				draft.maximum < 1 ||
				draft.minimum > draft.maximum ||
				draft.maximum > draft.options.length)
		)
			errors.range = 'Selection limits must fit the available options.';
		const labels = draft.options.map((option) =>
			option.label.trim().toLowerCase(),
		);
		if (new Set(labels).size !== labels.length)
			errors.options = 'Each option needs a different label.';
	}
	return errors;
}

export function nextOptionId(options: QuestionDraft['options']): string {
	let index = 1;
	while (options.some((option) => option.id === `draft:${index}`)) index++;
	return `draft:${index}`;
}
