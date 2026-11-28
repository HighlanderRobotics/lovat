import { describe, it, expect, vi } from 'vitest';
import { dispatch, type ActionContext } from '#lib/app/actions.ts';
import { DashboardSession } from '#lib/app/session.svelte.ts';
function context(): ActionContext {
	return {
		session: new DashboardSession(),
		route: 'home',
		open: vi.fn(),
		back: vi.fn(),
		notify: vi.fn(),
		submit: vi.fn(),
		choice: () => undefined,
	};
}
describe('typed feature actions', () => {
	it('creates an empty question and changes type without navigating to options', () => {
		const c = context();
		dispatch({ type: 'questions.create' }, c);
		expect(c.session.questions.draft.title).toBe('');
		expect(c.open).toHaveBeenCalledWith('questions.type');
		vi.mocked(c.open).mockClear();
		dispatch({ type: 'questions.selectType', kind: 'Photo' }, c);
		expect(c.session.questions.questionType).toBe('Photo');
		expect(c.open).not.toHaveBeenCalled();
		dispatch({ type: 'questions.phase', phase: 'Options' }, c);
		expect(c.open).toHaveBeenCalledWith('questions.options.photo', false);
	});
	it('replaces a form tab with a kind-specific named route', () => {
		const c = context();
		c.session.forms.formKind = 'alliance';
		dispatch({ type: 'forms.tab', tab: 'Responses' }, c);
		expect(c.open).toHaveBeenCalledWith('forms.responses.alliance', false);
	});
	it('keeps API key selection stable through rename and deletion', () => {
		const c = context(),
			keys = c.session.apikeys;
		keys.createKey('First');
		keys.createKey('Second');
		const selected = keys.apiRecords![1].id;
		keys.selectKey(selected, true);
		keys.renameKey('Renamed');
		expect(keys.apiRecords!.map((r) => r.name)).toEqual(['First', 'Renamed']);
		dispatch({ type: 'apiKeys.delete' }, c);
		expect(keys.apiRecords!.map((r) => r.name)).toEqual(['First']);
		expect(keys.apiLastAffected).toBe(1);
	});
	it('promotes selected members and clears their selection', () => {
		const c = context();
		c.session.choices.analysts = [
			{ key: 'one', label: 'Leo K', initial: false },
			{ key: 'two', label: 'Jack S', initial: false },
		];
		c.session.checks.one = true;
		dispatch({ type: 'members.promoteSelected' }, c);
		expect(c.session.members.promoted).toEqual({ 'Leo K': true });
		expect(c.session.checks.one).toBe(false);
		expect(c.notify).toHaveBeenCalledWith('Promoted 1 analyst');
		expect(c.open).toHaveBeenCalledWith('members.list', false);
	});
	it('autoassigns within the limit without changing team identity', () => {
		const c = context(),
			a = c.session.assignments;
		a.assignmentItems = ['1', '2', '3'].map((id) => ({
			id,
			number: id,
			name: 'Team',
			assignee: 'Unassigned',
		}));
		a.selectedScouters = ['Jack S', 'Collin C'];
		c.session.values['assignments.limit'] = '1';
		dispatch({ type: 'assignments.autoassign' }, c);
		expect(a.assignmentItems.map((t) => t.assignee)).toEqual([
			'Jack S',
			'Collin C',
			'Unassigned',
		]);
		expect(a.assignmentItems.map((t) => t.id)).toEqual(['1', '2', '3']);
		expect(a.dirty).toBe(true);
	});
	it('uses browser back for cancel without adding a route', () => {
		const c = context();
		dispatch({ type: 'navigation.cancel' }, c);
		expect(c.back).toHaveBeenCalledOnce();
		expect(c.open).not.toHaveBeenCalled();
	});
});
