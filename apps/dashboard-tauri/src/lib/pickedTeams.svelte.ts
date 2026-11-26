import { prefs } from '#lib/storage.ts';

/** Teams already picked during alliance selection, kept on this device. */
class PickedTeams {
	list = $state<number[]>(prefs.getJSON<number[]>('picked_teams') ?? []);

	private save() {
		prefs.setJSON('picked_teams', this.list);
	}

	add(team: number) {
		if (this.list.includes(team)) return;
		this.list = [...this.list, team];
		this.save();
	}

	remove(team: number) {
		this.list = this.list.filter((t) => t !== team);
		this.save();
	}
}

export const pickedTeams = new PickedTeams();
