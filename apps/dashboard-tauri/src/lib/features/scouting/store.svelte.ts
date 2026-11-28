export class ScoutingStore {
	filters = $state<Record<string, string>>({});
	matchLevels = $state<string[]>(['Quals', 'Elims']);
}
