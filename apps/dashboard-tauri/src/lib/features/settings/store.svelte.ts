export interface SourceSelection {
	key: string;
	label: string;
	initial: boolean;
}
export class SettingsStore {
	summaries = $state<Record<string, string>>({});
	apply(
		scope: string,
		items: SourceSelection[],
		checks: Record<string, boolean>,
		selectedRadio?: string,
	) {
		const selected =
			scope === 'at'
				? items.filter((item) => item.key === selectedRadio)
				: items.filter((item) => checks[item.key] ?? item.initial);
		this.summaries[scope] =
			selected.length === items.length && scope !== 'at'
				? 'All'
				: selected.length === 1
					? selected[0].label
					: selected.length
						? `${selected.length} ${scope === 'teams' ? 'teams' : 'tournaments'}`
						: 'None';
	}
}
