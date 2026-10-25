<script lang="ts">
	export let roles: unknown;
	export let correct = true;
	$: values = Array.isArray(roles) ? roles : [];
</script>

<span class="roles">
	{#each values as role}
		<span class="icon" title={String(role).toLowerCase()}>
			{#if role === 'OFFENCE'}
				<img src="/assets/training/offence.svg" width="24" height="24" alt="Offence" />
				<img class="flag" src="/assets/training/offence-mark.svg" width="14" height="16" alt="" />
			{:else if role === 'FEEDING'}
				<img
					src={`/assets/training/${correct ? 'cycling' : 'cycling-wrong'}.svg`}
					width="24"
					height="24"
					alt="Feeding"
				/>
			{:else if role === 'DEFENCE'}
				<img
					class="shield"
					src="/assets/training/defence.svg"
					width="16"
					height="20"
					alt="Defence"
				/>
			{:else}<span class="immobile" aria-label="Immobile">—</span>{/if}
		</span>
	{/each}
	{#if values.length === 0}<span>—</span>{/if}
</span>

<style>
	.roles {
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.icon {
		position: relative;
		width: 24px;
		height: 24px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.flag {
		position: absolute;
		left: 5px;
		top: 4px;
	}
	.shield {
		position: absolute;
		left: 4px;
		top: 2px;
	}
	.immobile {
		font-weight: 400;
	}
</style>
