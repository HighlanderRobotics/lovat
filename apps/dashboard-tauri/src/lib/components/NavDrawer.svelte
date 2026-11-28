<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { session } from '#lib/session.svelte.ts';
	import { currentTournament } from '#lib/tournament.svelte.ts';
	import { ui } from '#lib/ui.svelte.ts';
	import Icon from './Icon.svelte';

	const tournament = $derived(currentTournament.value);
	const isLead = $derived(session.isScoutingLead && !!session.profile?.team);

	interface Destination {
		label: string;
		href: string;
		icon: string;
		show: boolean;
	}

	const utilities: Destination[] = $derived([
		{
			label: 'Match Schedule',
			href: '/match_schedule',
			icon: 'today',
			show: !!tournament,
		},
		{ label: 'Home', href: '/home', icon: 'home', show: true },
		{ label: 'Forms', href: '/forms', icon: 'assignment', show: true },
		{
			label: 'Design screens',
			href: '/design',
			icon: 'grid_view',
			show: import.meta.env.DEV,
		},
		{
			label: 'Scouters',
			href: '/scouters',
			icon: 'supervised_user_circle',
			show: isLead,
		},
		{
			label: 'Scan QR Codes',
			href: '/scan_qr_codes',
			icon: 'qr_code_scanner',
			show: !!tournament,
		},
	]);

	const analysis: Destination[] = $derived([
		{ label: 'Team Lookup', href: '/team_lookup', icon: 'search', show: true },
		{
			label: 'Picklist',
			href: '/picklists',
			icon: 'format_list_numbered',
			show: !!tournament,
		},
		{
			label: 'Match Predictor',
			href: '/match_predictor_opener',
			icon: 'psychology',
			show: true,
		},
		{
			label: 'My Alliance',
			href: '/my_alliance',
			icon: 'group_work',
			show: true,
		},
	]);

	$effect(() => {
		untrack(() => {
			session.loadCached();
			void session.refresh();
		});
	});

	const close = () => (ui.drawerOpen = false);
</script>

{#snippet destination(d: Destination)}
	{@const selected = page.url.pathname === d.href}
	<a
		class="destination"
		class:selected
		href={d.href}
		onclick={close}
		aria-current={selected ? 'page' : undefined}
	>
		<Icon name={d.icon} fill={selected} />
		<span>{d.label}</span>
	</a>
{/snippet}

<div
	class="scrim"
	class:open={ui.drawerOpen}
	onclick={close}
	aria-hidden="true"
></div>
<nav class="drawer" class:open={ui.drawerOpen} aria-label="Main">
	<div class="header">
		<span class="section">Lovat Dashboard</span>
		<a
			class="icon-btn"
			href="/settings"
			onclick={close}
			aria-label="Settings"
			title="Settings"><Icon name="settings" /></a
		>
	</div>
	<hr class="divider" />
	<div class="section">{tournament?.name ?? 'No tournament selected'}</div>
	<hr class="divider" />
	{#if tournament || isLead}<div class="section">Data &amp; Utilities</div>{/if}
	{#each utilities.filter((d) => d.show) as d (d.href)}{@render destination(
			d,
		)}{/each}
	<div class="section">Analysis &amp; Strategy</div>
	{#each analysis.filter((d) => d.show) as d (d.href)}{@render destination(
			d,
		)}{/each}
</nav>

<style>
	.drawer {
		position: fixed;
		inset: 0 auto 0 0;
		z-index: 50;
		width: var(--drawer-width);
		max-width: 85vw;
		padding: calc(12px + var(--safe-top)) 12px 12px;
		background: var(--surface);
		border-right: 1px solid var(--surface-high);
		overflow-y: auto;
		transform: translateX(-100%);
		transition: transform 200ms ease;
	}
	.drawer.open {
		transform: none;
	}
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 49;
		background: rgba(0, 0, 0, 0.5);
		opacity: 0;
		pointer-events: none;
		transition: opacity 200ms;
	}
	.scrim.open {
		opacity: 1;
		pointer-events: auto;
	}
	@media (min-width: 1100px) {
		.drawer {
			transform: none;
		}
		.scrim {
			display: none;
		}
	}
	.header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.section {
		display: block;
		padding: 18px 8px 18px 16px;
		font-weight: 500;
		color: var(--on-surface-variant);
	}
	.divider {
		margin: 0 4px;
	}
	.destination {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px;
		border-radius: 100px;
		color: var(--on-surface-variant);
		font-weight: 500;
		text-decoration: none;
	}
	.destination:hover {
		background: rgba(255, 255, 255, 0.05);
	}
	.destination.selected {
		background: var(--secondary-container);
		color: var(--on-secondary-container);
	}
</style>
