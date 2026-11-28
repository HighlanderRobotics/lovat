import { SettingsStore } from '#lib/features/settings/store.svelte.ts';
import { Submission } from '#lib/shared/forms/submission.svelte.ts';
import { selectionScope, type RouteName } from '#lib/app/routing/routes.ts';
import { QuestionsStore } from '#lib/features/questions/store.svelte.ts';
import { FormsStore } from '#lib/features/forms/store.svelte.ts';
import { MembersStore } from '#lib/features/members/store.svelte.ts';
import { ApiKeysStore } from '#lib/features/api-keys/store.svelte.ts';
import { AssignmentsStore } from '#lib/features/assignments/store.svelte.ts';
import { ScoutingStore } from '#lib/features/scouting/store.svelte.ts';
export const DASHBOARD_SESSION = Symbol('dashboard-session');
export type Choice = {
	kind: 'checkbox' | 'radio' | 'switch';
	key: string;
	group: string;
	initial: boolean;
	label: string;
	all?: boolean;
};
export class DashboardSession {
	readonly questions = new QuestionsStore();
	readonly forms = new FormsStore();
	readonly members = new MembersStore();
	readonly apikeys = new ApiKeysStore();
	readonly assignments = new AssignmentsStore();
	readonly scouting = new ScoutingStore();
	readonly settings = new SettingsStore();

	submission = new Submission();
	promoteAnalysts() {
		const selected = (this.choices.analysts ?? []).filter(
			(item) => this.checks[item.key] ?? item.initial,
		);
		for (const item of selected) {
			this.members.promoted[item.label] = true;
			this.checks[item.key] = false;
		}
		this.members.promotionNotice = `Promoted ${selected.length} analyst${selected.length === 1 ? '' : 's'}`;
	}
	currentTab = $state('Home');
	currentRoute = $state<RouteName>('home');
	required(kind: string) {
		return (
			this.checks[`question:${kind}:required`] ??
			['Rating', 'Single select'].includes(kind)
		);
	}
	allSelected(scope: string) {
		const total =
			scope === 'api-keys'
				? (this.apikeys.apiRecords?.length ?? 0)
				: (this.choices[scope]?.length ?? 0);
		return total > 0 && this.count(scope) === total;
	}
	searchOpen = $state<Record<string, boolean>>({});
	collapsed = $state<Record<string, boolean>>({});
	scrolls: Record<string, number> = {};
	values = $state<Record<string, string>>({});
	checks = $state<Record<string, boolean>>({});
	groups = $state<Record<string, string>>({});
	choices = $state<
		Record<string, { key: string; label: string; initial: boolean }[]>
	>({});
	scope(route: RouteName) {
		return selectionScope(route);
	}
	onSelectionChange?: (scope: string) => void;
	count(scope: string) {
		if (scope === 'api-keys' && this.apikeys.apiRecords)
			return this.apikeys.apiRecords.filter(
				(record) => this.apikeys.apiSelected[record.id],
			).length;
		return (this.choices[scope] ?? []).filter(
			(item) => this.checks[item.key] ?? item.initial,
		).length;
	}
	checked(choice: Choice): boolean {
		return choice.all
			? this.count(choice.group) === (this.choices[choice.group]?.length ?? 0)
			: (this.checks[choice.key] ?? choice.initial);
	}
	setChecked(choice: Choice, checked: boolean) {
		if (choice.kind === 'switch') this.questions.formDirty = true;
		if (choice.all) this.selectAll(choice.group, false, checked);
		else this.checks[choice.key] = checked;
		this.onSelectionChange?.(choice.group);
	}
	selectAll(scope: string, onlyFirst = false, checked = true) {
		for (const [index, item] of (this.choices[scope] ?? []).entries())
			this.checks[item.key] = checked && (!onlyFirst || index === 0);
	}
	apply(scope: string) {
		this.settings.apply(
			scope,
			this.choices[scope] ?? [],
			this.checks,
			this.groups.at,
		);
	}
}
