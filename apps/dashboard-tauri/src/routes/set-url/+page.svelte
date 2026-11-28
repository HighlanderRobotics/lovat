<script lang="ts">
	import { page } from '$app/state';
	import { lovatAPI } from '#lib/api/client.ts';
	import { prefs } from '#lib/storage.ts';

	// Development deep link: /set-url?u=https://dev-server.example
	const target = page.url.searchParams.get('u');
	const locked = lovatAPI.isBaseUrlLocked;
	let valid = false;
	try {
		valid = !!target && ['http:', 'https:'].includes(new URL(target).protocol);
	} catch {
		valid = false;
	}
	if (valid && !locked) {
		prefs.setString('api_base_url', target!);
		lovatAPI.baseUrl = target!;
	}
</script>

<div class="page-body stack" style="min-height: 100vh; justify-content: center">
	<h1 class="headline-large">
		{locked ? 'Sandbox server is fixed' : valid ? 'Connected to development server' : 'Invalid server URL'}
	</h1>
	<p>
		{#if locked}
			This sandbox build only connects to {new URL(lovatAPI.baseUrl).host}.
		{:else if valid}
			Lovat Dashboard will send API requests to {new URL(target!).host}. You can reset it to the default server in settings.
		{:else}
			The link did not include a valid http or https server address.
		{/if}
	</p>
	<a class="btn btn-filled" style="align-self: flex-start" href="/">Home</a>
</div>
