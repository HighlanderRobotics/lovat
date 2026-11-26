<script lang="ts">
	import { goto } from '$app/navigation';
	import Spinner from '$lib/components/Spinner.svelte';
	import { prefs } from '$lib/storage';
	import { currentTournament } from '$lib/tournament.svelte';

	$effect(() => {
		const onboardingVersion = prefs.getInt('onboardingVersion');
		if (onboardingVersion === null || onboardingVersion < 1) void goto('/onboarding', { replaceState: true });
		else if (!currentTournament.value) void goto('/team_lookup', { replaceState: true });
		else void goto('/home', { replaceState: true });
	});
</script>

<div class="center" style="min-height: 100vh"><Spinner /></div>
