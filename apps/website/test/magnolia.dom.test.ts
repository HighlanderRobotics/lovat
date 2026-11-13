import { expect, test, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/svelte';
import { mount, unmount, flushSync } from 'svelte';
import MagnoliaForm from './fixtures/MagnoliaForm.svelte';

test('released Magnolia submits native fields and forwards cancellable actions without accidental submit', async () => {
	const submit = vi.fn();
	const activate = vi.fn((event: MouseEvent) => event.preventDefault());
	const target = document.createElement('div');
	document.body.append(target);
	const component = mount(MagnoliaForm, { target, props: { submit, activate } });
	flushSync();
	const { getByRole } = screen;
	try {
		const preview = getByRole('button', { name: 'Preview report' });
		const event = new MouseEvent('click', { bubbles: true, cancelable: true });
		preview.dispatchEvent(event);
		expect(activate.mock.calls.length).toBe(1);
		expect(activate.mock.calls[0][0] === event).toBe(true);
		expect(event.defaultPrevented).toBe(true);
		expect(submit).not.toHaveBeenCalled();
		await fireEvent.click(getByRole('button', { name: 'Send report' }));
		expect(submit).toHaveBeenCalledOnce();
		expect(submit.mock.calls[0][0].get('team')).toBe('8033');
		expect(getByRole('textbox', { name: 'Team' })).toBeRequired();
	} finally {
		await unmount(component);
		target.remove();
	}
});
