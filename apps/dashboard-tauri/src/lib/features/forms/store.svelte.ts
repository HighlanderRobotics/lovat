export class FormsStore {
	formKind = $state<'team' | 'match' | 'alliance'>('team');
	formTab = $state<string>();
}
