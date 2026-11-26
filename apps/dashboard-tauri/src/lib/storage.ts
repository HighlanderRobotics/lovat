// Small synchronous preference store. The Flutter app used SharedPreferences;
// localStorage persists in both browsers and the Tauri webview.

const memory = new Map<string, string>();

function backend(): Storage | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		return null;
	}
}

export const prefs = {
	getString(key: string): string | null {
		const store = backend();
		return store ? store.getItem(key) : (memory.get(key) ?? null);
	},
	setString(key: string, value: string) {
		const store = backend();
		if (store) store.setItem(key, value);
		else memory.set(key, value);
	},
	remove(key: string) {
		const store = backend();
		if (store) store.removeItem(key);
		else memory.delete(key);
	},
	has(key: string): boolean {
		return this.getString(key) !== null;
	},
	getJSON<T>(key: string): T | null {
		const raw = this.getString(key);
		if (raw === null) return null;
		try {
			return JSON.parse(raw) as T;
		} catch {
			return null;
		}
	},
	setJSON(key: string, value: unknown) {
		this.setString(key, JSON.stringify(value));
	},
	getInt(key: string): number | null {
		const raw = this.getString(key);
		if (raw === null) return null;
		const value = Number.parseInt(raw, 10);
		return Number.isNaN(value) ? null : value;
	},
	setInt(key: string, value: number) {
		this.setString(key, String(value));
	}
};
