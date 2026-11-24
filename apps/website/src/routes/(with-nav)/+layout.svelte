<script>
	import Navbar from '$lib/Navbar.svelte';
	import { page } from '$app/stores';
</script>

<Navbar hasBanner={$page.url.pathname === '/'} />
<main class="main-content">
	<slot />
</main>
