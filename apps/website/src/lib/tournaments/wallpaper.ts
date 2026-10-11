import townPhotos from '$lib/district-wallpapers.json';
import districtPhotos from '$lib/district-backgrounds.json';
import eventOverrides from '$lib/event-wallpaper-overrides.json';
import matchPhoto from '$lib/default-event-wallpaper.json';

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

	return custom
		? { ...custom, label: city!, position: custom.position ?? 'center' }
		: districtWallpaper(district ?? '');
}
