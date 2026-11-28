import type { DesignNode } from "./model.ts";

export function sceneAssetPaths(node: DesignNode): string[] {
	const paths = new Set<string>();
	function visit(node: DesignNode) {
		if (node.src && !node.src.startsWith("data:")) paths.add(node.src);
		for (const match of node.style.matchAll(
			/(?:url\(["']?)(\/design-assets\/[^)'"\s]+)/g,
		))
			paths.add(match[1]);
		for (const child of node.children)
			if (typeof child !== "string") visit(child);
	}
	visit(node);
	return [...paths];
}

const assets = new Map<string, Promise<void>>();
let fonts: Promise<unknown> | undefined;
export async function preloadSceneAssets(node: DesignNode): Promise<void> {
	if (typeof document === "undefined") return;
	fonts ??= Promise.all([
		document.fonts.load("400 15px Roboto"),
		document.fonts.load("500 15px Roboto"),
		document.fonts.load("500 20px Heebo"),
	]).catch((error) => {
		fonts = undefined;
		throw error;
	});
	await Promise.all([
		fonts,
		...sceneAssetPaths(node).map((path) => {
			let pending = assets.get(path);
			if (!pending) {
				pending = new Promise<void>((resolve, reject) => {
					const image = new Image();
					image.onload = () => {
						void image
							.decode()
							.then(() => resolve())
							.catch(() =>
								image.naturalWidth
									? resolve()
									: reject(new Error("An image could not be decoded.")),
							);
					};
					image.onerror = () =>
						reject(
							new Error(
								"An image could not be loaded. Check your connection and try again.",
							),
						);
					image.src = path;
				}).catch((error) => {
					assets.delete(path);
					throw error;
				});
				assets.set(path, pending);
			}
			return pending;
		}),
	]);
}
