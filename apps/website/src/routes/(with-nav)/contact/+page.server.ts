import type { Actions, PageServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import { error, fail, redirect } from '@sveltejs/kit';

export const load: PageServerLoad = () => ({
	recaptchaSiteKey: env.RECAPTCHA_SITE_KEY || ''
});

export const actions = {
	default: async ({ request }) => {
		const data = await request.formData();

		if (!env.RECAPTCHA_SECRET_KEY || !env.RECAPTCHA_SITE_KEY) {
			return fail(503, { message: 'Contact verification is unavailable. Please try again later.' });
		}

		const token = data.get('g-recaptcha-response');
		if (typeof token !== 'string' || !token.trim()) {
			return fail(400, { message: 'Please complete the reCAPTCHA verification.' });
		}

		let verification: { success?: boolean } | null;
		try {
			const response = await fetch('https://www.google.com/recaptcha/api/siteverify', {
				method: 'POST',
				body: new URLSearchParams({ secret: env.RECAPTCHA_SECRET_KEY, response: token }),
				signal: AbortSignal.timeout(10_000)
			});
			if (!response.ok) throw new Error('reCAPTCHA service unavailable');
			verification = await response.json();
		} catch {
			return fail(503, { message: 'Verification is unavailable. Please try again.' });
		}

		if (verification?.success !== true) {
			return fail(400, {
				message: 'Verification failed or expired. Please complete reCAPTCHA again.'
			});
		}

		const name = data.get('name');
		const email = data.get('email');
		const team = data.get('team');
		const message = data.get('message');

		// Silently reject messages from bots that just copy the placeholder
		if (team === '8033') {
			throw redirect(303, '/contact/success');
		}

		// Validate team number if provided
		if (team && team.toString().trim() !== '') {
			const teamNum = parseInt(team.toString());

			if (isNaN(teamNum)) {
				throw error(400, 'Team number must be a valid number');
			}

			// Silent rejection for length > 5 digits so bots don't catch on
			if (teamNum.toString().length > 5) {
				throw redirect(303, '/contact/success');
			}
		}

		const body = {
			blocks: [
				{
					type: 'section',
					text: {
						type: 'mrkdwn',
						text: 'Received a new submission from the website contact form.'
					}
				},
				{
					type: 'divider'
				},
				{
					type: 'section',
					text: {
						type: 'mrkdwn',
						text: `*Name*\n${name}\n\n*Email*\n${email}\n\n*Team Number*\n${
							team || '_None_'
						}\n\n*Message*\n${message}`
					}
				},
				{
					type: 'actions',
					elements: [
						{
							type: 'button',
							text: {
								type: 'plain_text',
								text: 'Reply',
								emoji: true
							},
							url: 'mailto:' + encodeURIComponent(email?.toString() || 'null')
						}
					]
				}
			]
		};

		if (env.SLACK_WEBHOOK == null) {
			throw error(500, "We weren't able to get your message through.");
		}

		const response = await fetch(env.SLACK_WEBHOOK, {
			method: 'POST',
			body: JSON.stringify(body)
		});

		if (!response.ok) {
			console.log(`Received an error from Slack when attempting to POST to the webhook:
            ${response.status} ${response.statusText}
            ${response.body}`);
			throw error(500, "We weren't able to get your message through.");
		}

		throw redirect(303, '/contact/success');
	}
} satisfies Actions;
