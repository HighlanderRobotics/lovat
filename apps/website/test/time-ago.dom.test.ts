import { test, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/svelte';
import TimeAgo from '../src/lib/components/TimeAgo.svelte';

test.each([
	[0, 'now'],
	[59_000, '59 seconds ago'],
	[60_000, '1 minute ago'],
	[3_600_000, '1 hour ago'],
	[86_400_000, 'yesterday']
])('renders elapsed boundary %s', (elapsed, label) => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
	render(TimeAgo, { date: new Date(Date.now() - elapsed) });
	expect(screen.getByText(label)).toBeInTheDocument();
});
test('updates after time passes and releases its interval on unmount', async () => {
	vi.useFakeTimers();
	vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
	const { unmount } = render(TimeAgo, { date: new Date(Date.now() - 59_000) });
	await act(() => vi.advanceTimersByTime(1000));
	expect(screen.getByText('1 minute ago')).toBeInTheDocument();
	await unmount();
	expect(vi.getTimerCount()).toBe(0);
});
