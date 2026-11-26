<script lang="ts">
	let { name, size = 24, fill = false, class: className = '' }: { name: string; size?: number; fill?: boolean; class?: string } =
		$props();
</script>

<span
	class="material-symbols-outlined {className}"
	style:font-size="{size}px"
	style:font-variation-settings={fill ? "'FILL' 1" : undefined}
	aria-hidden="true">{name}</span
>
