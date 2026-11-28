<script lang="ts">
	import type { FeaturePageProps } from '#lib/app/screens.ts';
	import QuestionEditor from '#lib/features/questions/QuestionEditor.svelte';
	let { session, route, onaction }: FeaturePageProps = $props();
</script>

<QuestionEditor
	runtime={session.questions}
	phase={route === 'questions.type' ? 'Type' : 'Options'}
	onphase={(phase) => onaction({ type: 'questions.phase', phase })}
	onback={() => onaction({ type: 'navigation.back' })}
	onsave={() => onaction({ type: 'questions.saved' })}
/>
