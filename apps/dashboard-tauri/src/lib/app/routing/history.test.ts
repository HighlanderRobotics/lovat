import { describe, it, expect } from 'vitest';
import { navbarDirection, revisitDelta } from '#lib/app/routing/history.ts';
describe('dashboard navigation', () => {
	it('uses the relative tab order in either direction', () => {
		expect(navbarDirection('forms.list', 'home')).toBe('back');
		expect(navbarDirection('forms.list', 'scouting.rankings')).toBe('back');
		expect(navbarDirection('scouting.rankings', 'forms.list')).toBe('forward');
		expect(navbarDirection('scouting.rankings.record', 'forms.list')).toBe(
			'forward',
		);
	});
	it('reuses an existing entry and leaves new pages to be pushed', () => {
		expect(revisitDelta(['home', 'forms.list'], 'home')).toBe(-2);
		expect(revisitDelta(['home'], 'forms.list')).toBe(0);
		expect(revisitDelta(['home.search'], 'home')).toBe(-1);
	});
});
