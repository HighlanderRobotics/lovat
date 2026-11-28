export interface ApiKeyRecord {
	id: string;
	name: string;
	lastUsed: string;
	requests: string;
	initialSelected?: boolean;
}
