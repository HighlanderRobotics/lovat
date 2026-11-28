import { describe, expect, it } from 'vitest';
import { frameStyle } from '#lib/design/model.ts';

describe('native reference frame fitting', () => {
	it('keeps the browser reference and individual controls unchanged', () => {
		expect(frameStyle('height:787px;top:65px;width:393px', 0)).toBe(
			'height:787px;top:65px;width:393px',
		);
		expect(frameStyle('height:44px;top:65px;width:393px', 64)).toBe(
			'height:44px;top:65px;width:393px',
		);
	});
	it('shrinks page containers and moves bottom anchors below the status bar', () => {
		expect(frameStyle('height:787px;top:773px', 64)).toBe(
			'height:723px;top:709px',
		);
	});
});
