<script lang="ts">
	import { Button } from "@highlanderrobotics/magnolia-svelte/v2";
	import type { Submission } from "./submission.svelte.ts";
	let {
		submission,
		onretry,
	}: { submission: Submission; onretry?: () => void } = $props();
</script>

{#if submission.status === "invalid" || submission.status === "failed"}
	<div class="submission-notice" role="alert">
		<strong
			>{submission.status === "invalid"
				? "Couldn’t submit"
				: "Submission failed"}</strong
		>
		<p>{submission.message}</p>
		{#if submission.status === "failed" && onretry}<Button
				variant="secondary"
				onclick={onretry}>Try again</Button
			>{/if}
	</div>
{/if}

<style>
	.submission-notice {
		width: 100%;
		border: 1px solid #d69089;
		border-radius: 8px;
		padding: 12px;
		background: #3e2928;
		color: #f4c7c3;
		display: flex;
		flex-direction: column;
		gap: 8px;
		font:
			400 14px/20px Roboto,
			sans-serif;
	}
	.submission-notice p {
		margin: 0;
	}
</style>
