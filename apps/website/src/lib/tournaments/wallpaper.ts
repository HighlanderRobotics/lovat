import townPhotos from '$lib/district-wallpapers.json';
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

export function eventWallpaper(district: string | undefined, city: string | null) {
	const custom = district === 'ca' && city ? wallpapers[city] : undefined;

	return custom
		? { ...custom, label: city!, position: custom.position ?? 'center' }
		: { ...matchPhoto, label: 'FRC match', position: 'center' };
}
