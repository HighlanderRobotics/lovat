<script lang="ts">
	import {
		Button,
		TextField,
		Switch,
		Checkbox,
		Radio,
		TextArea,
	} from "@highlanderrobotics/magnolia-svelte/v2";
	import {
		questionTypes,
		questionIcons,
		questionSubtitle,
		validateQuestion,
		nextOptionId,
		type QuestionType,
	} from "./questions.ts";
	import { Submission, submitMock } from "./submission.svelte.ts";
	import SubmissionNotice from "./SubmissionNotice.svelte";
	import type { DesignRuntime } from "./runtime.svelte.ts";
	let {
		runtime,
		phase,
		onphase,
		onback,
		onsave,
	}: {
		runtime: DesignRuntime;
		phase: "Type" | "Options";
		onphase: (phase: "Type" | "Options") => void;
		onback: () => void;
		onsave: () => void;
	} = $props();
	const submission = new Submission();
	let preview = $state(false),
		answer = $state<string | null>(null);
	const draft = $derived(runtime.draft);
	function select(kind: QuestionType) {
		if (kind === "Multiple Select" && draft.kind !== kind) {
			draft.minimum = 0;
			draft.maximum = Math.max(2, draft.options.length);
		}
		draft.kind = kind;
		runtime.questionType = kind;
		runtime.typeDirty = true;
		submission.reset();
	}
	function addOption() {
		const count = draft.options.length;
		draft.options = [
			...draft.options,
			{ id: nextOptionId(draft.options), label: "", hint: "" },
		];
		if (draft.kind === "Multiple Select" && draft.maximum === count)
			draft.maximum = draft.options.length;
	}
	async function save() {
		if (phase === "Type") {
			if (draft.kind) onphase("Options");
			return;
		}
		const saved = await submission.run(
			() => validateQuestion(draft),
			() => submitMock(() => runtime.saveDraft()),
		);
		if (saved) onsave();
	}
</script>

<div class="question-editor" data-figma-node="runtime:question-editor">
	<header>
		<Button
			variant="tertiary"
			aria-label="Back"
			onclick={() => (preview ? (preview = false) : onback())}
			><img src="/design-assets/0ccbb.svg" alt="" /></Button
		>
		<h1>{runtime.editingQuestionId ? "Edit question" : "New question"}</h1>
		<Button
			variant="tertiary"
			aria-label="Preview question"
			disabled={!draft.kind}
			onclick={() => (preview = true)}
			><img src="/design-assets/87068.svg" alt="" /></Button
		>
	</header>
	<div class="question-editor-scroll" data-layout-role="body">
		<div
			class="question-editor-tabs"
			role="tablist"
			aria-label="Question editor"
		>
			<Button
				variant="tertiary"
				role="tab"
				aria-selected={phase === "Type"}
				onclick={() => onphase("Type")}>Type</Button
			><Button
				variant="tertiary"
				role="tab"
				aria-selected={phase === "Options"}
				disabled={!draft.kind}
				onclick={() => onphase("Options")}>Options</Button
			>
		</div>
		<SubmissionNotice {submission} onretry={save} />
		{#if phase === "Type"}
			<div
				class="question-type-list"
				role="radiogroup"
				aria-label="Question type"
			>
				{#each questionTypes as kind}<button
						class="question-type-card"
						role="radio"
						aria-checked={draft.kind === kind}
						onclick={() => select(kind)}
						><span
							class="question-type-glyph"
							style={`mask-image:url('${questionIcons[kind]}')`}
						></span>{kind}</button
					>{/each}
			</div>
		{:else}
			<TextField
				label="Title"
				placeholder="Question title"
				bind:value={draft.title}
				error={submission.errors.title}
				oninput={() => submission.reset()}
			/>
			<Switch label="Required" bind:checked={draft.required} />
			<TextField label="Hint" placeholder="Hint" bind:value={draft.hint} />
			{#if draft.kind === "Rating"}
				<div class="question-editor-range">
					<TextField
						label="Minimum value"
						type="number"
						value={String(draft.minimum)}
						oninput={(event) =>
							(draft.minimum = Number(event.currentTarget.value))}
					/><TextField
						label="Maximum value"
						type="number"
						value={String(draft.maximum)}
						oninput={(event) =>
							(draft.maximum = Number(event.currentTarget.value))}
					/>
				</div>
				{#if submission.errors.range}<p
						class="question-field-error"
						role="alert"
					>
						{submission.errors.range}
					</p>{/if}
			{:else if draft.kind === "Photo"}
				<TextField
					label="Maximum photos"
					type="number"
					min="1"
					value={String(draft.maxPhotos)}
					oninput={(event) =>
						(draft.maxPhotos = Number(event.currentTarget.value))}
					error={submission.errors.maxPhotos}
				/>
			{:else if draft.kind === "Single select" || draft.kind === "Multiple Select"}
				{#if draft.kind === "Multiple Select"}<div
						class="question-editor-range"
					>
						<TextField
							label="Minimum selections"
							type="number"
							min="0"
							value={String(draft.minimum)}
							oninput={(event) =>
								(draft.minimum = Number(event.currentTarget.value))}
						/><TextField
							label="Maximum selections"
							type="number"
							min="1"
							value={String(draft.maximum)}
							oninput={(event) =>
								(draft.maximum = Number(event.currentTarget.value))}
						/>
					</div>
					{#if submission.errors.range}<p
							class="question-field-error"
							role="alert"
						>
							{submission.errors.range}
						</p>{/if}{/if}
				<h2>Options</h2>
				{#if submission.errors.options}<p
						class="question-field-error"
						role="alert"
					>
						{submission.errors.options}
					</p>{/if}
				{#each draft.options as option, index (option.id)}<div
						class="question-option-editor"
					>
						<TextField
							label={`Option ${index + 1}`}
							placeholder="Option label"
							bind:value={option.label}
							error={submission.errors[`option:${option.id}`]}
						/><TextField
							label={`Option ${index + 1} hint`}
							placeholder="Hint"
							bind:value={option.hint}
						/><Button
							variant="tertiary"
							onclick={() =>
								(draft.options = draft.options.filter(
									(item) => item.id !== option.id,
								))}>Remove option {index + 1}</Button
						>
					</div>{/each}
				<Button variant="secondary" onclick={addOption}>Add option</Button>
			{/if}
		{/if}
	</div>
	<footer data-layout-role="footer">
		<Button
			disabled={!draft.kind || submission.status === "pending"}
			onclick={save}
			>{submission.status === "pending" ? "Saving…" : "Save changes"}</Button
		>
	</footer>
</div>
{#if preview && draft.kind}
	<div
		class="question-preview-backdrop"
		role="presentation"
		onclick={(event) => {
			if (event.target === event.currentTarget) preview = false;
		}}
	>
		<div
			class="question-preview-card"
			role="dialog"
			aria-modal="true"
			aria-label="Question preview"
			tabindex="-1"
		>
			<header>
				<img src={questionIcons[draft.kind]} alt="" />
				<div>
					<h2>{draft.title || "Question title"}</h2>
					<p>{questionSubtitle(draft.kind, draft.required)}</p>
					{#if draft.hint}<p>{draft.hint}</p>{/if}
				</div>
			</header>
			{#if draft.kind === "Rating"}<input
					aria-label="Rating"
					type="range"
					min={draft.minimum}
					max={draft.maximum}
				/>
			{:else if draft.kind === "Photo"}<label class="question-upload"
					>Add photos<input
						type="file"
						accept="image/png,image/jpeg"
						multiple
					/></label
				>
			{:else if draft.kind === "Short Answer Text"}<TextArea
					label="Answer"
					placeholder={draft.hint || "Type your answer"}
					value=""
				/>
			{:else}{#each draft.options as option}<div>
						{#if draft.kind === "Single select"}<Radio
								label={option.label || "Option label"}
								value={option.id}
								bind:group={answer}
							/>{:else}<Checkbox
								label={option.label || "Option label"}
							/>{/if}{#if option.hint}<p class="question-option-hint">
								{option.hint}
							</p>{/if}
					</div>{/each}{/if}
			<Button variant="tertiary" onclick={() => (preview = false)}
				>Close preview</Button
			>
		</div>
	</div>
{/if}

<style>
	.question-editor {
		position: absolute;
		inset: 0;
		bottom: var(--keyboard-inset, 0px);
		display: flex;
		flex-direction: column;
		color: #e6e6e6;
		background: #1f1f1f;
	}
	.question-editor > header {
		display: flex;
		align-items: center;
		padding: 12px 4px 8px;
		flex: none;
	}
	.question-editor > header h1 {
		flex: 1;
		text-align: center;
		margin: 0;
		font:
			500 17px/24px Roboto,
			sans-serif;
	}
	.question-editor > header :global(button) {
		width: 44px;
		height: 44px;
		padding: 10px;
	}
	.question-editor-scroll {
		flex: 1;
		min-height: 0;
		overflow: auto;
		display: flex;
		flex-direction: column;
		gap: 16px;
		padding: 8px 26px 20px;
	}
	.question-editor-tabs {
		display: flex;
		gap: 4px;
		margin-bottom: 4px;
	}
	.question-editor-tabs :global(button) {
		flex: 1;
		min-height: 36px;
	}
	.question-editor-tabs :global([aria-selected="true"]) {
		background: #3c3c3c;
	}
	.question-type-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.question-type-card {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px;
		border-radius: 12px;
		background: #262626;
		outline: 1px solid #424242;
		color: #e6e6e6;
		font:
			500 15px/22px Roboto,
			sans-serif;
		text-align: left;
	}
	.question-type-card[aria-checked="true"] {
		background: #34323c;
		outline-color: #b59aff;
	}
	.question-type-glyph {
		width: 24px;
		height: 24px;
		mask-size: 24px 24px;
		mask-repeat: no-repeat;
		background: #e6e6e6;
	}
	.question-type-card[aria-checked="true"] .question-type-glyph {
		background: #b59aff;
	}
	.question-editor footer {
		flex: none;
		padding: 12px 26px 26px;
	}
	.question-editor footer :global(button) {
		width: 100%;
		height: 44px;
	}
	.question-editor-range {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}
	.question-option-editor {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px;
		border-radius: 10px;
		background: #262626;
	}
	.question-editor h2 {
		margin: 0;
		font:
			500 15px/22px Roboto,
			sans-serif;
	}
	.question-field-error {
		color: #f4c7c3;
		font:
			400 13px/18px Roboto,
			sans-serif;
	}
	.question-preview-backdrop {
		position: fixed;
		inset: 0;
		z-index: 60;
		background: #0004;
		backdrop-filter: blur(5px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 26px;
	}
	.question-preview-card {
		max-height: calc(100% - var(--keyboard-inset, 0px) - 48px);
		overflow: auto;
		width: 341px;
		padding: 16px;
		border-radius: 12px;
		background: #262626;
		outline: 1px solid #424242;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.question-preview-card header {
		display: flex;
		gap: 12px;
	}
	.question-preview-card header img {
		flex: none;
	}
	.question-preview-card h2 {
		margin: 0;
		font:
			500 15px/22px Roboto,
			sans-serif;
	}
	.question-preview-card p {
		margin: 2px 0;
		color: #b7b7b7;
		font:
			400 13px/18px Roboto,
			sans-serif;
	}
	.question-upload {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 16px;
		border: 1px dashed #666;
		border-radius: 8px;
	}
</style>
