import { isTauri } from '#lib/config.ts';

/**
 * Save text to a file: a browser download on the web, a native save dialog
 * in Tauri. Returns false if the user cancelled.
 */
export async function saveTextFile(filename: string, contents: string, mimeType = 'text/csv'): Promise<boolean> {
	if (isTauri) {
		const [{ save }, { writeTextFile }] = await Promise.all([
			import('@tauri-apps/plugin-dialog'),
			import('@tauri-apps/plugin-fs')
		]);
		const path = await save({ defaultPath: filename, filters: [{ name: 'CSV', extensions: ['csv'] }] });
		if (!path) return false;
		await writeTextFile(path, contents);
		return true;
	}
	const url = URL.createObjectURL(new Blob([contents], { type: mimeType }));
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.append(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
	return true;
}
