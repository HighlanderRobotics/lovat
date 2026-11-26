<script lang="ts">
	import { goto } from '$app/navigation';
	import Spinner from '#lib/components/Spinner.svelte';
	import { prefs } from '#lib/storage.ts';
	import { currentTournament } from '#lib/tournament.svelte.ts';

	$effect(() => {
		const onboardingVersion = prefs.getInt('onboardingVersion');
		if (onboardingVersion === null || onboardingVersion < 1) void goto('/onboarding', { replace: true });
		else if (!currentTournament.value) void goto('/team_lookup', { replace: true });
		else void goto('/home', { replace: true });
	});
</script>

<div class="center" style="min-height: 100vh"><Spinner /></div>
