<script lang="ts">
	import { uploadScoutReport } from '#lib/api/endpoints.ts';
	import AppBar from '#lib/components/AppBar.svelte';
	import QrScanner from '#lib/components/QrScanner.svelte';
	import { GameMatchIdentity, MatchType } from '#lib/models/match.ts';
	import { ChunkedReport, parseChunk } from '#lib/scoutReportChunks.ts';
	import { toast } from '#lib/toast.svelte.ts';

	let report = $state<ChunkedReport | null>(null);
	let version = $state(0);
	let uploading = $state(false);
	let previous: string | null = null;

	const matchTypes: Record<string, MatchType> = {
		QUALIFICATION: MatchType.qualifier,
		ELIMINATION: MatchType.elimination,
		PRACTICE: MatchType.practice
	};

	function vibrate(pattern: number | number[]) {
		navigator.vibrate?.(pattern);
	}

	function fail(message: string) {
		vibrate([200, 500, 50, 100, 50, 100, 50, 100, 50]);
		toast.error(message);
	}

	function detect(value: string) {
		if (uploading || value === previous) return;
		previous = value;
		let chunk;
		try {
			chunk = parseChunk(value);
		} catch {
			fail('That QR code is not from Lovat Collection.');
			return;
		}
		vibrate(40);
		if (!report) {
			report = new ChunkedReport(chunk);
		} else if (report.uuid !== chunk.uuid) {
			fail('You are scanning a different report. Tap "Clear" to start over.');
			return;
		} else {
			report.add(chunk);
		}
		version++;
	}

	const status = $derived.by(() => {
		void version;
		if (!report) return 'Scan QR codes from Lovat Collection';
		if (!report.isComplete) return `Scanned ${report.chunks.length} of ${report.total} codes`;
		try {
			const json = JSON.parse(report.data);
			const match = new GameMatchIdentity(matchTypes[json.matchType] ?? MatchType.qualifier, json.matchNumber, '');
			return `Data on ${json.teamNumber} in ${match.getLocalizedDescription({ includeTournament: false })}`;
		} catch {
			return 'Scanned report is unreadable. Clear and scan again.';
		}
	});

	async function upload() {
		if (!report?.isComplete) return;
		uploading = true;
		previous = null;
		try {
			await uploadScoutReport(report.data);
			toast.show('Report uploaded');
			report = null;
		} catch (e) {
			fail(e instanceof Error ? e.message : 'An error occurred');
		} finally {
			uploading = false;
		}
	}
</script>

<AppBar title="Scan QR Codes" />

<div class="page-body stack scan">
	<QrScanner ondetect={detect} />
	<p class="status">{status}</p>
	<div class="row actions">
		<button class="btn btn-tonal" disabled={!report || uploading} onclick={() => ((report = null), (previous = null))}>Clear</button>
		<button class="btn btn-filled" disabled={!report?.isComplete || uploading} onclick={upload}>
			{uploading ? 'Uploading…' : 'Upload Report'}
		</button>
	</div>
</div>

<style>
	.scan {
		align-items: stretch;
	}
	.status {
		min-height: 60px;
		margin: 16px 0 0;
		text-align: center;
	}
	.actions {
		justify-content: center;
	}
</style>
