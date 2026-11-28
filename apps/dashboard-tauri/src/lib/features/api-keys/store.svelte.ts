import type { ApiKeyRecord } from '#lib/features/api-keys/model.ts';

export class ApiKeysStore {
	apiRecords = $state<ApiKeyRecord[]>();
	apiSelected = $state<Record<string, boolean>>({});
	apiLastAffected = $state(0);
	private apiSequence = 0;
	selectKey(id: string, checked: boolean) {
		this.apiSelected[id] = checked;
	}
	selectAllKeys(checked: boolean) {
		for (const record of this.apiRecords ?? [])
			this.apiSelected[record.id] = checked;
	}
	renameKey(name: string) {
		this.apiRecords = (this.apiRecords ?? []).map((record) =>
			this.apiSelected[record.id]
				? { ...record, name: name.trim() || record.name }
				: record,
		);
	}
	createKey(name: string) {
		this.apiRecords = [
			...(this.apiRecords ?? []),
			{
				id: `local:${++this.apiSequence}`,
				name: name.trim() || 'New key',
				lastUsed: 'Never',
				requests: '0',
			},
		];
		this.apiSelected = {};
	}
	deleteKeys() {
		this.apiLastAffected = (this.apiRecords ?? []).filter(
			(record) => this.apiSelected[record.id],
		).length;
		this.apiRecords = (this.apiRecords ?? []).filter(
			(record) => !this.apiSelected[record.id],
		);
		this.apiSelected = {};
	}
}
