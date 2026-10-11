import townPhotos from '$lib/district-wallpapers.json';
import districtPhotos from '$lib/district-backgrounds.json';
import matchPhoto from '$lib/default-event-wallpaper.json';

type Wallpaper = {
	image: string;
	source: string;
	author: string;
	license: string;
	licenseUrl: string;
	position?: string;
};

const wallpapers: Record<string, Wallpaper> = townPhotos;

const districts: Record<string, Wallpaper> = districtPhotos;

export function districtWallpaper(district: string) {
	const photo = districts[district];

	return photo
		? { ...photo, label: district.toUpperCase(), position: photo.position ?? 'center' }
		: { ...matchPhoto, label: 'FRC match', position: 'center' };
}

export function eventWallpaper(district: string | undefined, city: string | null) {
	const custom = district === 'ca' && city ? wallpapers[city] : undefined;

	return custom
		? { ...custom, label: city!, position: custom.position ?? 'center' }
		: districtWallpaper(district ?? '');
}
