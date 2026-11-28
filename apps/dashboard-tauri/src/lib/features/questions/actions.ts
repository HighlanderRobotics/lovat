import type { QuestionType } from '#lib/features/questions/model.ts';
import type { AppAction, ActionContext } from '#lib/app/actions.ts';
import type { RouteName } from '#lib/app/routing/routes.ts';
import { optionScreens } from '#lib/features/questions/routes.ts';
export type QuestionAction =
	| { type: 'questions.create' }
	| { type: 'questions.edit'; id: string }
	| { type: 'questions.openReference'; route: RouteName }
	| {
			type: 'questions.editOption';
			option: { key: string; label: string; hint?: string };
	  }
	| { type: 'questions.selectType'; kind: QuestionType }
	| { type: 'questions.phase'; phase: 'Type' | 'Options' }
	| { type: 'questions.preview' }
	| { type: 'questions.optionSave' }
	| { type: 'questions.saved' }
	| {
			type: 'questions.step';
			key: string;
			delta: number;
			minKey?: string;
			maxKey?: string;
	  };
export function handleQuestionAction(a: AppAction, c: ActionContext): boolean {
	const s = c.session,
		q = s.questions;
	switch (a.type) {
		case 'questions.create':
			s.questions.startQuestion();
			s.submission.reset();
			c.open('questions.type');
			break;
		case 'questions.edit':
			q.editQuestion(a.id);
			c.open(optionScreens[q.draft.kind] ?? 'questions.type');
			break;
		case 'questions.openReference':
			q.creatingQuestion = false;
			c.open(a.route);
			break;
		case 'questions.editOption':
			q.editingOption = a.option;
			c.open('questions.option-edit');
			break;
		case 'questions.selectType':
			q.selectType(a.kind);
			break;
		case 'questions.phase':
			c.open(
				a.phase === 'Type'
					? 'questions.type'
					: (optionScreens[
							q.creatingQuestion ? q.draft.kind : q.questionType
						] ?? 'questions.type'),
				false,
			);
			break;
		case 'questions.preview':
			c.open(
				(
					{
						Rating: 'questions.preview.rating',
						Photo: 'questions.preview.photo',
						'Single select': 'questions.preview.single',
						'Multiple Select': 'questions.preview.multiple',
						'Short Answer Text': 'questions.preview.text',
					} as Record<string, RouteName>
				)[q.questionType] ?? 'questions.preview.rating',
			);
			break;
		case 'questions.optionSave':
			if (q.editingOption) {
				q.optionLabels[q.editingOption.key] =
					s.values['questions.option.label'];
				q.optionHints[q.editingOption.key] =
					s.values['questions.option.hint'] ?? '';
				q.formDirty = true;
			}
			c.open(c.returnRoute ?? 'questions.options.single', false);
			break;
		case 'questions.saved':
			c.notify('Question saved');
			c.open('forms.questions');
			break;
		case 'questions.step': {
			q.formDirty = true;
			let next = (q.numbers[a.key] ?? 0) + a.delta;
			if (a.key === a.minKey)
				next = Math.min(next, q.numbers[a.maxKey!] ?? next);
			if (a.key === a.maxKey)
				next = Math.max(next, q.numbers[a.minKey!] ?? next);
			q.numbers[a.key] = Math.max(0, next);
			break;
		}
		default:
			return false;
	}
	return true;
}
