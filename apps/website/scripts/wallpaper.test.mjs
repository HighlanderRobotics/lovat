import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFile, access } from 'node:fs/promises';
import { createServer } from 'vite';

const vite = await createServer({
	server: { middlewareMode: true, hmr: false },
	appType: 'custom'
});

after(() => vite.close());

const { eventWallpaper, districtWallpaper } = await vite.ssrLoadModule(
	'/src/lib/tournaments/wallpaper.ts'
);

test('event keys keep their fallback photo independently of lookup order', () => {
	const keys = ['2026alhu', '2026arli', '2026azva', '2026cofr'];
	const before = keys.map((key) => eventWallpaper(undefined, null, key));
	const after = [...keys].reverse().map((key) => eventWallpaper(undefined, null, key));

	assert.deepEqual(before, after.reverse());
	assert.deepEqual(eventWallpaper(undefined, 'Unknown town', keys[0]), before[0]);
});

test('unmapped competitions use a variety of fallback photos', () => {
	const images = new Set(
		Array.from(
			{ length: 50 },
			(_, index) => eventWallpaper(undefined, null, `2026regional${index}`).image
		)
	);

	assert.ok(images.size >= 5, `Expected variety, found ${images.size} images`);
});

test('event, location, and district overrides retain their precedence', () => {
	assert.equal(eventWallpaper('ca', 'Houston', '2026cur').image, '/assets/worlds/cur.jpg');
	assert.equal(
		eventWallpaper('ont', 'Rochester', '2026nyro').image,
		'/assets/cities/rochester.jpg'
	);
	assert.deepEqual(eventWallpaper('ont', 'Unknown town', '2026unknown'), districtWallpaper('ont'));
});

test('every fallback image is local and includes its license credits', async () => {
	const photos = JSON.parse(await readFile('src/lib/event-backgrounds.json', 'utf8'));

	for (const photo of photos) {
		assert.match(photo.image, /^\/assets\/frc\/[a-z-]+\.jpg$/);
		assert.ok(photo.author && photo.license && photo.source);
		await access(`static${photo.image}`);
	}
});
