export class MembersStore {
	activeMember = $state('Collin C');
	promoted = $state<Record<string, boolean>>({});
	promotionNotice = $state('');
}
