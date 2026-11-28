/** Animate existing layout boxes without adding wrappers or changing their resting geometry. */
export function collapse(element: HTMLElement, closed: boolean | undefined) {
	let animation: Animation | undefined;
	let previous = closed;
	const display = element.style.display,
		inert = element.inert;
	if (closed) element.inert = true;
	if (closed) element.style.display = 'none';
	function update(next: boolean | undefined) {
		if (next === undefined || next === previous) return;
		previous = next;
		const height = element.offsetHeight;
		const wasAnimating = !!animation;
		const currentStyle = getComputedStyle(element);
		const interrupted = {
			height: `${height}px`,
			minHeight: '0px',
			paddingTop: currentStyle.paddingTop,
			paddingBottom: currentStyle.paddingBottom,
			marginTop: currentStyle.marginTop,
			marginBottom: currentStyle.marginBottom,
			opacity: currentStyle.opacity,
			overflow: 'hidden',
		};
		animation?.cancel();
		element.inert = next || inert;
		element.style.display = display;
		if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
			if (next) element.style.display = 'none';
			return;
		}
		const style = getComputedStyle(element),
			full = element.offsetHeight;
		const expanded = {
			height: `${full}px`,
			minHeight: '0px',
			paddingTop: style.paddingTop,
			paddingBottom: style.paddingBottom,
			marginTop: style.marginTop,
			marginBottom: style.marginBottom,
			opacity: 1,
			overflow: 'hidden',
		};
		const parent = element.parentElement
			? getComputedStyle(element.parentElement)
			: undefined;
		const gap =
			element.previousElementSibling &&
			parent?.display.includes('flex') &&
			parent.flexDirection.startsWith('column')
				? parseFloat(parent.rowGap) || 0
				: 0;
		const folded = {
			height: '0px',
			minHeight: '0px',
			paddingTop: '0px',
			paddingBottom: '0px',
			marginTop: `${-gap}px`,
			marginBottom: '0px',
			opacity: 0,
			overflow: 'hidden',
		};
		const current = element.animate(
			wasAnimating
				? [interrupted, next ? folded : expanded]
				: next
					? [expanded, folded]
					: [folded, expanded],
			{ duration: 170, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' },
		);
		animation = current;
		void current.finished
			.then(() => {
				if (animation !== current) return;
				if (next) element.style.display = 'none';
				current.cancel();
				animation = undefined;
			})
			.catch(() => {});
	}
	return {
		update,
		destroy() {
			animation?.cancel();
		},
	};
}
