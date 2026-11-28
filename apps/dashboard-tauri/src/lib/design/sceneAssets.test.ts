import { it, expect } from "vitest";
import { sceneAssetPaths } from "./sceneAssets.ts";
it("collects image and mask assets once without fetching inline glyphs", () => {
	expect(
		sceneAssetPaths({
			tag: "div",
			name: "",
			style: 'mask-image:url("/design-assets/icon.svg")',
			children: [
				{
					tag: "img",
					name: "",
					style: "",
					src: "/design-assets/icon.svg",
					children: [],
				},
				{
					tag: "img",
					name: "",
					style: "",
					src: "data:image/svg+xml,a",
					children: [],
				},
			],
		}),
	).toEqual(["/design-assets/icon.svg"]);
});
