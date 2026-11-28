import { describe, expect, it } from 'vitest';
import { formatMetric, metricCategories, numToStringRounded } from './metrics.ts';

describe('metric formatting', () => {
	it('rounds to one decimal and trims zeros', () => {
		expect(numToStringRounded(3)).toBe('3');
		expect(numToStringRounded(3.04)).toBe('3');
		expect(numToStringRounded(3.25)).toBe('3.3');
		expect(numToStringRounded(null)).toBe('--');
	});

	it('applies units and custom formatters', () => {
		const metrics = metricCategories.flatMap((c) => c.metrics);
		const accuracy = metrics.find((m) => m.path === 'accuracy')!;
		const driver = metrics.find((m) => m.path === 'driverAbility')!;
		expect(formatMetric(accuracy, 72.44)).toBe('72.4%');
		expect(formatMetric(driver, 4)).toBe('4/5');
		expect(formatMetric(accuracy, null)).toBe('--');
	});
});
