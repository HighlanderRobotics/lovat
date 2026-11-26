// Locally saved picklist weight configurations (the Flutter `picklists` pref).

import type { ConfiguredPicklist, PicklistWeight } from '$lib/api/endpoints';
import { picklistWeights } from '$lib/metrics';
import { prefs } from '$lib/storage';

interface StoredPicklist {
	title: string;
	uuid: string;
	weights: PicklistWeight[];
	userName?: string;
}

export function defaultWeights(values: Record<string, number> = {}): PicklistWeight[] {
	return picklistWeights.map((w) => ({ ...w, value: values[w.path] ?? 0 }));
}

export function defaultPicklists(): ConfiguredPicklist[] {
	return [{ id: crypto.randomUUID(), title: 'Average total', weights: defaultWeights({ totalPoints: 1 }) }];
}

/** Keep stored weights aligned with this season's weight list. */
function normalize(weights: PicklistWeight[]): PicklistWeight[] {
	return picklistWeights.map((w) => ({ ...w, value: weights.find((x) => x.path === w.path)?.value ?? 0 }));
}

export function getPicklists(): ConfiguredPicklist[] {
	const stored = prefs.getJSON<StoredPicklist[]>('picklists');
	if (!stored) return [];
	return stored.map((p) => ({ id: p.uuid, title: p.title, weights: normalize(p.weights), author: p.userName ?? null }));
}

export function setPicklists(picklists: ConfiguredPicklist[]) {
	prefs.setJSON(
		'picklists',
		picklists.map<StoredPicklist>((p) => ({
			title: p.title,
			uuid: p.id,
			weights: p.weights,
			...(p.author ? { userName: p.author } : {})
		}))
	);
}

export function ensureDefaultPicklists() {
	if (!prefs.has('picklists')) setPicklists(defaultPicklists());
	if (!prefs.has('picklist_flags')) prefs.setJSON('picklist_flags', []);
}
