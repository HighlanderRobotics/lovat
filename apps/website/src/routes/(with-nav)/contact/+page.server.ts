import type { Actions } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { sendSignedRequest } from '$lib/util/sendSignedRequest';
import { env } from '$env/dynamic/private';

export const actions = {
	default: async ({ request }) => {
		const data = await request.formData();

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
			name,
			team,
			email,
			message
		};

		const response = await sendSignedRequest(
			`/v1/tickets/website`,
			'POST',
			JSON.stringify(body),
			env.LOVAT_SUPPORT_BASE
		);
		if (response.ok) {
			throw redirect(303, '/contact/success');
		} else {
			console.log(`Received an error from Slack when attempting to POST to the webhook:
            ${response.status} ${response.statusText}
            ${response.body}`);
			throw error(500, "We weren't able to get your message through.");
		}
	}
} satisfies Actions;
