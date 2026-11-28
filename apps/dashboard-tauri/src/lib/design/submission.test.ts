import { describe, it, expect } from "vitest";
import { Submission } from "./submission.svelte.ts";
describe("submission lifecycle", () => {
	it("keeps validation errors out of the transport", async () => {
		const submission = new Submission();
		let calls = 0;
		expect(
			await submission.run(
				() => ({ title: "Required" }),
				async () => {
					calls++;
				},
			),
		).toBe(false);
		expect(submission.status).toBe("invalid");
		expect(calls).toBe(0);
	});
	it("supports retry after a failure", async () => {
		const submission = new Submission();
		expect(
			await submission.run(
				() => ({}),
				async () => {
					throw new Error("Connection lost");
				},
			),
		).toBe(false);
		expect(submission.status).toBe("failed");
		expect(submission.message).toBe("Connection lost");
		expect(
			await submission.run(
				() => ({}),
				async () => {},
			),
		).toBe(true);
		expect(submission.status).toBe("success");
	});
	it("prevents duplicate pending submissions", async () => {
		const submission = new Submission();
		let finish = () => {};
		const pending = submission.run(
			() => ({}),
			() => new Promise<void>((resolve) => (finish = resolve)),
		);
		expect(submission.status).toBe("pending");
		expect(
			await submission.run(
				() => ({}),
				async () => {
					throw new Error("duplicate");
				},
			),
		).toBe(false);
		finish();
		expect(await pending).toBe(true);
	});
});
