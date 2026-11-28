import {
	emptyQuestion,
	type QuestionDraft,
	type QuestionType,
} from '#lib/features/questions/model.ts';

export class QuestionsStore {
	selectType(kind: QuestionType) {
		if (this.creatingQuestion) {
			if (kind === 'Multiple Select' && this.draft.kind !== kind) {
				this.draft.minimum = 0;
				this.draft.maximum = Math.max(2, this.draft.options.length);
			}
			this.draft.kind = kind;
		}
		if (this.questionType !== kind) this.typeDirty = true;
		this.questionType = kind;
	}

	creatingQuestion = $state(false);
	draft = $state<QuestionDraft>(emptyQuestion());
	editingQuestionId = $state<string>();
	savedQuestions = $state<(QuestionDraft & { id: string })[]>([]);
	private questionSequence = 0;
	editQuestion(id: string) {
		const saved = this.savedQuestions.find((question) => question.id === id);
		if (saved) {
			this.creatingQuestion = true;
			this.editingQuestionId = id;
			this.draft = JSON.parse(JSON.stringify(saved));
			this.questionType = saved.kind;
		}
	}
	saveDraft() {
		const question = {
			...JSON.parse(JSON.stringify(this.draft)),
			id: this.editingQuestionId ?? `question:${++this.questionSequence}`,
		};
		this.savedQuestions = [
			...this.savedQuestions.filter((item) => item.id !== question.id),
			question,
		];
		this.editingQuestionId = question.id;
	}

	optionHints = $state<Record<string, string>>({});
	optionLabels = $state<Record<string, string>>({});
	editingOption = $state<{ key: string; label: string; hint?: string }>();
	deleted = $state<Record<string, boolean>>({});
	formDirty = $state(false);
	numbers = $state<Record<string, number>>({});
	questionType = $state('Rating');
	typeDirty = $state(false);

	startQuestion() {
		this.creatingQuestion = true;
		this.editingQuestionId = undefined;
		this.draft = emptyQuestion();
		this.questionType = '';
		this.typeDirty = false;
	}
}
