export type SubmissionStatus =
	"idle" | "pending" | "invalid" | "failed" | "success";

/** Shared form lifecycle; validation and persistence stay in the owning feature. */
export class Submission {
	status = $state<SubmissionStatus>("idle");
	errors = $state<Record<string, string>>({});
	message = $state("");
	reset() {
		this.status = "idle";
		this.errors = {};
		this.message = "";
	}
	invalid(errors: Record<string, string>) {
		this.errors = errors;
		this.status = "invalid";
		this.message = "Check the highlighted fields and try again.";
	}
	async run(
		validate: () => Record<string, string>,
		save: () => Promise<void>,
	): Promise<boolean> {
		if (this.status === "pending") return false;
		const errors = validate();
		if (Object.keys(errors).length) {
			this.invalid(errors);
			return false;
		}
		this.errors = {};
		this.message = "";
		this.status = "pending";
		try {
			await save();
			this.status = "success";
			return true;
		} catch (error) {
			this.status = "failed";
			this.message =
				error instanceof Error
					? error.message
					: "Could not save. Your changes are still here. Try again.";
			return false;
		}
	}
}

/** The mock transport can fail offline; replace this boundary with the API later. */
export async function submitMock(save: () => void): Promise<void> {
	if (typeof navigator !== "undefined" && !navigator.onLine)
		throw new Error(
			"You’re offline. Reconnect and try again. Your changes have been kept.",
		);
	save();
}
