import townPhotos from '$lib/district-wallpapers.json';
import districtPhotos from '$lib/district-backgrounds.json';
import eventOverrides from '$lib/event-wallpaper-overrides.json';
import matchPhoto from '$lib/default-event-wallpaper.json';
import eventPhotos from '$lib/event-backgrounds.json';

type Wallpaper = {
	image: string;
	source: string;
	author: string;
	license: string;
	licenseUrl: string;
	position?: string;
	fit?: string;
};

const wallpapers: Record<string, Wallpaper> = townPhotos;

const districts: Record<string, Wallpaper> = districtPhotos;
const overrides: Record<string, Wallpaper> = eventOverrides;
const fallbackPhotos: Wallpaper[] = [matchPhoto, ...eventPhotos];

function photoScore(key: string, image: string) {
	let hash = 2166136261;

	for (const character of `${key}\0${image}`) {
		hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
	}

	return hash >>> 0;
}

function eventFallback(key: string) {
	// Score each image independently so adding a photo only moves events that prefer it.
	const photo = fallbackPhotos.reduce((best, candidate) =>
		photoScore(key, candidate.image) > photoScore(key, best.image) ? candidate : best
	);

	return {
		...photo,
		label: 'FRC match',
		position: photo.position ?? 'center',
		fit: photo.fit ?? 'cover'
	};
}

export function districtWallpaper(district: string) {
	const photo = districts[district];

	return photo
		? {
				...photo,
				label: district.toUpperCase(),
				position: photo.position ?? 'center',
				fit: photo.fit ?? 'cover'
			}
		: { ...matchPhoto, label: 'FRC match', position: 'center', fit: 'cover' };
}

export function eventWallpaper(district: string | undefined, city: string | null, key?: string) {
	const override = key ? overrides[key] : undefined;

	if (override) return { ...override, label: key!, position: override.position ?? 'center' };

	const custom = city ? wallpapers[city] : undefined;

	if (custom) return { ...custom, label: city!, position: custom.position ?? 'center' };

	if (district && districts[district]) return districtWallpaper(district);

	return eventFallback(key ?? city ?? district ?? 'event');
}
