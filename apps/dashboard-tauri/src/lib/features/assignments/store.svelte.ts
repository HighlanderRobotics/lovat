import type { AssignmentTeam } from '#lib/features/assignments/model.ts';

export class AssignmentsStore {
	dirty = $state(false);
	assignmentItems = $state<AssignmentTeam[]>([]);
	selectedScouters = $state<string[]>(['Jack S', 'Collin C']);
	moveTeam(id: string, assignee: string) {
		this.dirty = true;
		this.assignmentItems = this.assignmentItems.map((team) =>
			team.id === id ? { ...team, assignee } : team,
		);
	}
	autoAssign(limit = 10) {
		this.dirty = true;
		const maximum = Math.max(1, limit),
			people = this.selectedScouters;
		this.assignmentItems = this.assignmentItems.map((team, index) => ({
			...team,
			assignee:
				people.length && index < maximum * people.length
					? people[index % people.length]
					: 'Unassigned',
		}));
	}
}
