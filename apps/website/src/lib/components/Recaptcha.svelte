<script lang="ts">
	import { onMount } from 'svelte';

	type RecaptchaApi = {
		render: (container: HTMLElement, options: Record<string, unknown>) => number;
		reset: (widgetId: number) => void;
	};

	export let siteKey: string;
	export let token = '';
	let container: HTMLDivElement;
	let api: RecaptchaApi | undefined;
	let widgetId: number | undefined;
	let loadError = '';

	export function reset() {
		token = '';
		if (api && widgetId !== undefined) api.reset(widgetId);
	}

	onMount(() => {
		let mounted = true;
		const captchaWindow = window as typeof window & {
			grecaptcha?: RecaptchaApi;
			lovatRecaptchaLoaded?: () => void;
		};
		const render = () => {
			if (!mounted || widgetId !== undefined) return;
			api = captchaWindow.grecaptcha;
			if (!api) return;
			widgetId = api.render(container, {
				sitekey: siteKey,
				callback: (response: string) => {
					token = response;
					loadError = '';
				},
				'expired-callback': () => (token = ''),
				'error-callback': () => {
					token = '';
					loadError = 'Verification failed to load. Please refresh the page and try again.';
				}
			});
		};

		let script: HTMLScriptElement | undefined;
		if (captchaWindow.grecaptcha?.render) {
			render();
		} else {
			captchaWindow.lovatRecaptchaLoaded = render;
			script = document.createElement('script');
			script.src =
				'https://www.google.com/recaptcha/api.js?onload=lovatRecaptchaLoaded&render=explicit';
			script.async = true;
			script.defer = true;
			script.onerror = () => {
				loadError = 'Verification failed to load. Please refresh the page and try again.';
			};
			document.head.appendChild(script);
		}

		return () => {
			mounted = false;
			if (api && widgetId !== undefined) api.reset(widgetId);
			if (captchaWindow.lovatRecaptchaLoaded === render) {
				delete captchaWindow.lovatRecaptchaLoaded;
			}
			script?.remove();
		};
	});
</script>

<div bind:this={container}></div>
{#if loadError}
	<p role="alert">{loadError}</p>
{/if}
<noscript>JavaScript is required to verify and send this form.</noscript>
