import type z from "zod";

const guidance: Record<string, string> = {
  scouterUuid:
    "Your selected scout has an invalid ID. Choose your scout again in Collection, then retry joining training.",
  code: "Choose your team again in Collection, then retry joining training.",
  deviceId: "Could not identify this device. Restart Collection and try again.",
  pairingToken:
    "This training QR code is invalid. Scan a new code on the website.",
  deviceName: "Enter a device name between 1 and 80 characters.",
};

export function trainingValidationError(error: z.ZodError): {
  displayError: string;
  invalidFields: string[];
} {
  // Return field names and recovery guidance, never submitted credentials.
  const invalidFields = [
    ...new Set(error.issues.map((issue) => issue.path.join("."))),
  ];
  const field = invalidFields.find((name) => guidance[name]);

  return {
    displayError: field ? guidance[field] : "Invalid training request.",
    invalidFields,
  };
}
