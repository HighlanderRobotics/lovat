export interface TabFocusOptions {
	key: string;
	active: string;
	variant: 'nav' | 'tabs';
}
interface Position {
	x: number;
	y: number;
	width: number;
	height: number;
	active: string;
}
const positions = new Map<string, Position>();

/** One moving highlight; positions survive the remount of a tab's page content. */
export function tabFocus(
	element: HTMLElement,
	initial: TabFocusOptions | undefined,
) {
	let options = initial,
		frame = 0,
		readyFrame = 0,
		started = false;
	function place(position: Position) {
		element.style.setProperty('--tab-x', `${position.x}px`);
		element.style.setProperty('--tab-y', `${position.y}px`);
		element.style.setProperty('--tab-width', `${position.width}px`);
		element.style.setProperty('--tab-height', `${position.height}px`);
	}
	function measure() {
		if (!options) {
			delete element.dataset.motionGroup;
			return;
		}
		const target = Array.from(
			element.querySelectorAll<HTMLElement>('[data-motion-tab]'),
		).find((tab) => tab.dataset.motionTab === options!.active);
		if (!target) {
			element.dataset.motionVisible = 'false';
			return;
		}
		if (!element.clientWidth || !target.offsetWidth || !target.offsetHeight)
			return;
		// offset dimensions are in the app's coordinate system, independent of viewport scaling.
		const inset = options.variant === 'nav' ? 6 : 0;
		const position: Position = {
			x: target.offsetLeft + inset,
			y: target.offsetTop + (inset ? 2 : 0),
			width: target.offsetWidth - inset * 2,
			height:
				Math.min(target.offsetHeight, element.clientHeight - target.offsetTop) -
				(inset ? 4 : 0),
			active: options.active,
		};
		element.dataset.motionGroup = options.variant;
		element.dataset.motionActive = options.active;
		element.dataset.motionVisible = 'true';
		const previous = positions.get(options.key);
		if (!started) {
			started = true;
			place(
				previous && previous.active !== options.active ? previous : position,
			);
			// Commit the initial geometry before enabling interpolation, including after a page remount.
			void getComputedStyle(element, '::before').transform;
			element.dataset.motionReady = 'true';
		}
		cancelAnimationFrame(readyFrame);
		readyFrame = requestAnimationFrame(() => place(position));
		positions.set(options.key, position);
	}
	function schedule() {
		cancelAnimationFrame(frame);
		frame = requestAnimationFrame(measure);
	}
	let resize: ResizeObserver | undefined,
		children: MutationObserver | undefined;
	function observe() {
		resize ??= new ResizeObserver(schedule);
		children ??= new MutationObserver(schedule);
		resize.observe(element);
		children.observe(element, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ['data-motion-tab'],
		});
	}
	if (options) {
		observe();
		schedule();
	}

	return {
		update(next: TabFocusOptions | undefined) {
			const wasEnabled = !!options;
			options = next;
			if (!next) {
				cancelAnimationFrame(frame);
				cancelAnimationFrame(readyFrame);
				resize?.disconnect();
				children?.disconnect();
				delete element.dataset.motionGroup;
				delete element.dataset.motionReady;
				delete element.dataset.motionVisible;
				started = false;
				return;
			}
			if (next && !wasEnabled) {
				observe();
			}
			if (next) schedule();
		},
		destroy() {
			cancelAnimationFrame(frame);
			cancelAnimationFrame(readyFrame);
			resize?.disconnect();
			children?.disconnect();
		},
	};
}
