import { describe, it, expect } from "vitest";
import {
	emptyQuestion,
	validateQuestion,
	questionSubtitle,
	nextOptionId,
} from "./questions.ts";
describe("question drafts", () => {
	it("starts without example content or a selected type", () => {
		const draft = emptyQuestion();
		expect(draft.kind).toBe("");
		expect(draft.title).toBe("");
		expect(draft.hint).toBe("");
		expect(draft.options).toEqual([]);
		expect(draft.required).toBe(false);
	});
	it("formats the optional status with the type", () => {
		expect(questionSubtitle("Photo", false)).toBe("Photo · Optional");
		expect(questionSubtitle("Rating", true)).toBe("Rating");
	});
	it("keeps option IDs unique after reopening a saved draft", () => {
		expect(
			nextOptionId([
				{ id: "draft:1", label: "Yes", hint: "" },
				{ id: "draft:2", label: "No", hint: "" },
			]),
		).toBe("draft:3");
	});
	it("validates titles and numeric ranges", () => {
		const draft = emptyQuestion();
		expect(validateQuestion(draft)).toHaveProperty("title");
		draft.kind = "Rating";
		draft.title = "Reliability";
		draft.minimum = 10;
		draft.maximum = 2;
		expect(validateQuestion(draft)).toHaveProperty("range");
		draft.maximum = 15;
		expect(validateQuestion(draft)).toEqual({});
	});
	it("validates multiple-select limits against its option count", () => {
		const draft = emptyQuestion();
		draft.kind = "Multiple Select";
		draft.title = "Broken parts";
		draft.options = [
			{ id: "1", label: "Intake", hint: "" },
			{ id: "2", label: "Shooter", hint: "" },
		];
		draft.minimum = 0;
		draft.maximum = 3;
		expect(validateQuestion(draft)).toHaveProperty("range");
		draft.maximum = 2;
		expect(validateQuestion(draft)).toEqual({});
	});
	it("rejects blank or duplicate choices", () => {
		const draft = emptyQuestion();
		draft.kind = "Single select";
		draft.title = "Broken?";
		expect(validateQuestion(draft)).toHaveProperty("options");
		draft.options = [
			{ id: "1", label: "Yes", hint: "" },
			{ id: "2", label: " YES ", hint: "" },
		];
		expect(validateQuestion(draft)).toHaveProperty("options");
		draft.options[1].label = "No";
		expect(validateQuestion(draft)).toEqual({});
	});
});
