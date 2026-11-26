<script lang="ts">
	import jsQR from 'jsqr';

	/** Camera viewfinder that reports each decoded QR payload. */
	let { ondetect }: { ondetect: (value: string) => void } = $props();

	let video: HTMLVideoElement | undefined = $state();
	let error = $state<string | null>(null);

	$effect(() => {
		if (!video) return;
		let stream: MediaStream | null = null;
		let frame = 0;
		let stopped = false;
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d', { willReadFrequently: true });

		const scan = () => {
			if (stopped || !video || !ctx) return;
			if (video.readyState === video.HAVE_ENOUGH_DATA) {
				const size = Math.min(video.videoWidth, video.videoHeight, 720);
				canvas.width = size;
				canvas.height = size;
				const sx = (video.videoWidth - size) / 2;
				const sy = (video.videoHeight - size) / 2;
				ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
				const image = ctx.getImageData(0, 0, size, size);
				const code = jsQR(image.data, size, size, { inversionAttempts: 'dontInvert' });
				if (code?.data) ondetect(code.data);
			}
			frame = requestAnimationFrame(scan);
		};

		navigator.mediaDevices
			?.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
			.then((s) => {
				if (stopped) return s.getTracks().forEach((t) => t.stop());
				stream = s;
				video!.srcObject = s;
				void video!.play();
				frame = requestAnimationFrame(scan);
			})
			.catch((e: Error) => {
				error = e.name === 'NotAllowedError' ? 'Camera access was denied.' : `Camera unavailable: ${e.message}`;
			});
		if (!navigator.mediaDevices) error = 'This device does not expose a camera to Lovat.';

		return () => {
			stopped = true;
			cancelAnimationFrame(frame);
			stream?.getTracks().forEach((t) => t.stop());
		};
	});
</script>

<div class="scanner">
	<!-- svelte-ignore a11y_media_has_caption -->
	<video bind:this={video} playsinline muted></video>
	<div class="mask"><img src="/images/qr_guide_lines.png" alt="" /></div>
	{#if error}<div class="error">{error}</div>{/if}
</div>

<style>
	.scanner {
		position: relative;
		width: 100%;
		aspect-ratio: 1;
		max-height: 60vh;
		max-width: 60vh;
		margin: 0 auto;
		overflow: hidden;
		border-radius: 16px;
		background: #000;
	}
	video {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.mask {
		position: absolute;
		inset: 8%;
	}
	.mask img {
		width: 100%;
		height: 100%;
	}
	.error {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 24px;
		background: rgba(0, 0, 0, 0.8);
	}
</style>
