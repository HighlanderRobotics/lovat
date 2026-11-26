<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { auth } from '#lib/auth/index.ts';
	import Spinner from '#lib/components/Spinner.svelte';
	import { isTauri } from '#lib/config.ts';
	import { prefs } from '#lib/storage.ts';
	import { currentTournament } from '#lib/tournament.svelte.ts';

	async function route() {
		// A browser redirect login returns here with ?code&state. Let the Auth0
		// SDK consume them before navigating, or the login is lost.
		const params = new URLSearchParams(location.search);
		if (!isTauri && params.has('code') && params.has('state')) {
			await auth.isAuthenticated().catch(() => false);
		}
		const onboardingVersion = prefs.getInt('onboardingVersion');
		if (onboardingVersion === null || onboardingVersion < 1) void goto('/onboarding', { replace: true });
		else if (!currentTournament.value) void goto('/team_lookup', { replace: true });
		else void goto('/home', { replace: true });
	}

	$effect(() => {
		untrack(route);
	});
</script>

<div class="center" style="min-height: 100vh"><Spinner /></div>
