/** "Today at 12:34 PM", "Yesterday at …", "Monday at …", or "12/31/2021 at …". */
export function localizeTimestamp(date: Date, now = new Date()): string {
	const time = date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
	const sameMonth = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
	if (sameMonth && date.getDate() === now.getDate()) return `Today at ${time}`;
	if (sameMonth && date.getDate() === now.getDate() - 1) return `Yesterday at ${time}`;
	if (sameMonth && now.getDate() - date.getDate() < 7 && now.getDate() >= date.getDate()) {
		return `${date.toLocaleDateString(undefined, { weekday: 'long' })} at ${time}`;
	}
	const d = `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
	return `${d} at ${time}`;
}
