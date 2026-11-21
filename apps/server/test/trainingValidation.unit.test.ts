import { describe, expect, it } from "vitest";
import z from "zod";
import { trainingValidationError } from "../src/handler/training/validationError.js";

describe("training request validation guidance", () => {
  it("explains the malformed scout ID observed in the preview database", () => {
    const result = z.object({ scouterUuid: z.uuid() }).safeParse({
      scouterUuid: "4f609778-1f19-44gb-8d81-29a893f84c73",
    });
    expect(result.success).toBe(false);
    if (result.success) throw new Error("Expected invalid scout ID");

    expect(trainingValidationError(result.error)).toEqual({
      displayError:
        "Your selected scout has an invalid ID. Choose your scout again in Collection, then retry joining training.",
      invalidFields: ["scouterUuid"],
    });
  });

  it.each([
    ["code", "Choose your team again"],
    ["deviceId", "Restart Collection"],
    ["pairingToken", "Scan a new code"],
    ["deviceName", "between 1 and 80 characters"],
    ["unknownField", "Invalid training request."],
  ])("returns safe recovery guidance for %s", (field, message) => {
    const error = new z.ZodError([
      { code: "custom", path: [field], message: "Sensitive submitted value" },
      { code: "custom", path: [field], message: "Sensitive submitted value" },
    ]);
    const result = trainingValidationError(error);
    expect(result.displayError).toContain(message);
    expect(result.invalidFields).toEqual([field]);
    expect(JSON.stringify(result)).not.toContain("Sensitive submitted value");
  });
});
