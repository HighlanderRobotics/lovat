<script lang="ts">
	import { SegmentedControl } from '@highlanderrobotics/magnolia-svelte/v2';
	let { tabs, selected = $bindable(0) }: { tabs: string[]; selected?: number } =
		$props();
</script>

<SegmentedControl
	label="View"
	items={tabs.map((label, index) => ({ value: String(index), label }))}
	bind:value={() => String(selected), (value) => (selected = Number(value))}
/>
