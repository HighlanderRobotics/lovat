<script lang="ts">
	export let stage = 'start';
	$: source = stage === 'start' ? 'backdrop' : `${stage}-backdrop`;
</script>

<div class="backdrop" aria-hidden="true">
	<img src={`/assets/training/${source}.svg`} alt="" width="1151.71" height="566.045" />
	<div
		class="fade"
		class:hero={stage === 'start' || stage === 'select'}
		class:results={stage === 'results'}
	></div>
</div>

<style>
	.backdrop {
		position: absolute;
		inset: 0;
		overflow: hidden;
		pointer-events: none;
	}
	img {
		position: absolute;
		left: calc(50% + 0.25px);
		top: calc(50% - 0.78px);
		max-width: none;
		transform: translate(-50%, -50%) rotate(170deg);
	}
	.fade {
		position: absolute;
		z-index: 1;
		left: 0;
		right: 3px;
		top: 84px;
		height: max(471px, calc(100% - 84px));
		background: linear-gradient(180deg, transparent 1.984%, #1f1f1f 75.929%);
	}
	.fade.results {
		height: 471px;
		mask-image: linear-gradient(180deg, black 80%, transparent 100%);
	}
	.fade.hero {
		top: 210px;
		height: max(345px, calc(100% - 210px));
	}
</style>
