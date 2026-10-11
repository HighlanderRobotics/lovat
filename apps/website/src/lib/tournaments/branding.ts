const colors = new Map<string, string>();

// Read the imported raster avatar so roster gradients follow each season's team branding.
export function avatarGradient(node: HTMLElement, selector = 'img') {
	const image = node.querySelector<HTMLImageElement>(selector);

	if (!image) return;

	function apply() {
		if (!image || !image.naturalWidth) return;

		let color = colors.get(image.src);

		if (!color) {
			const canvas = document.createElement('canvas');
			canvas.width = canvas.height = 32;
			const context = canvas.getContext('2d');

			if (!context) return;

			context.drawImage(image, 0, 0, 32, 32);
			const pixels = context.getImageData(0, 0, 32, 32).data;
			const buckets = new Map<string, { sum: number[]; weight: number }>();

			for (let i = 0; i < pixels.length; i += 4) {
				const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]];
				const high = Math.max(...rgb);
				const low = Math.min(...rgb);

				if (pixels[i + 3] < 64 || high < 45 || low > 220) continue;

				const weight = (pixels[i + 3] / 255) * (1 + (high - low) / 128);
				const key = rgb.map((channel) => Math.floor(channel / 32)).join(',');
				const bucket = buckets.get(key) ?? { sum: [0, 0, 0], weight: 0 };
				bucket.weight += weight;
				rgb.forEach((channel, index) => (bucket.sum[index] += channel * weight));
				buckets.set(key, bucket);
			}

			const dominant = [...buckets.values()].sort((a, b) => b.weight - a.weight)[0];
			color = dominant
				? dominant.sum.map((value) => Math.round(value / dominant.weight)).join(', ')
				: '130, 130, 130';
			colors.set(image.src, color);
		}

		node.style.setProperty('--team-color', color);
	}

	image.addEventListener('load', apply);
	apply();

	return { destroy: () => image.removeEventListener('load', apply) };
}

// Defer avatar requests until their row approaches the viewport.
export function lazyAvatar(image: HTMLImageElement) {
	const observer = new IntersectionObserver(
		(entries) => {
			if (!entries.some((entry) => entry.isIntersecting)) return;

			image.src = image.dataset.src ?? '';
			observer.disconnect();
		},
		{ rootMargin: '200px' }
	);

	observer.observe(image);

	return { destroy: () => observer.disconnect() };
}
