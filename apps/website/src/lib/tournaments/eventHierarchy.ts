type Event = {
	key: string;
	name: string;
	parentTournamentKey: string | null;
};

export function nestedEvents<T extends Event>(events: T[]) {
	const keys = new Set(events.map((event) => event.key));
	const children = new Map<string, T[]>();

	for (const event of events) {
		if (
			event.parentTournamentKey &&
			keys.has(event.parentTournamentKey) &&
			event.parentTournamentKey !== event.key
		) {
			const siblings = children.get(event.parentTournamentKey) ?? [];

			siblings.push(event);
			children.set(event.parentTournamentKey, siblings);
		}
	}

	return events
		.filter(
			(event) =>
				!event.parentTournamentKey ||
				!keys.has(event.parentTournamentKey) ||
				event.parentTournamentKey === event.key
		)
		.flatMap((event) => [
			{ event, nested: false, name: event.name },
			...(children.get(event.key) ?? []).map((child) => ({
				event: child,
				nested: true,
				name: child.name.split(' - ').at(-1) ?? child.name
			}))
		]);
}
