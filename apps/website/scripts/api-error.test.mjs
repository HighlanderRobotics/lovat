import assert from 'node:assert/strict';
import { test } from 'node:test';
import { apiErrorCode } from '../src/lib/util/apiError.js';

for (const code of ['CODE_NOT_RECOGNIZED', 'CODE_EXPIRED', 'EMAIL_ALREADY_VERIFIED']) {
	test(`verification recognizes ${code} from new and legacy responses`, () => {
		assert.equal(
			apiErrorCode(JSON.stringify({ code, message: 'Safe message', displayError: 'Safe message' })),
			code
		);
		assert.equal(apiErrorCode(code), code);
	});
}
test('unexpected JSON does not become a verification code', () => {
	for (const body of ['null', '[]', '{"code":42}', '{"displayError":"Unexpected failure"}']) {
		assert.equal(apiErrorCode(body), undefined);
	}
});
