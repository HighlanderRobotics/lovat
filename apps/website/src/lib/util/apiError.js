/** Read shared JSON error codes while accepting older plain-text responses.
 * @param {string} body
 * @returns {string | undefined}
 */
export function apiErrorCode(body) {
	try {
		const data = JSON.parse(body);
		return data && typeof data.code === 'string' ? data.code : undefined;
	} catch {
		return body;
	}
}
