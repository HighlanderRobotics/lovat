import { randomBytes } from "node:crypto";
import type { Prisma } from "@lovat/db";
import { enqueue } from "./effects.js";
import { HttpError } from "../errors.js";
export async function verificationEmail(
  tx: Prisma.TransactionClient,
  email: string,
  teamNumber: number,
  website: string,
) {
  // Team lock makes the resend budget effective across API replicas.
  await tx.$queryRawUnsafe(
    'SELECT number FROM "RegisteredTeam" WHERE number = $1 FOR UPDATE',
    teamNumber,
  );
  const recent = await tx.emailVerificationRequest.count({
    where: { teamNumber, expiresAt: { gt: new Date(Date.now() + 18 * 60000) } },
  });
  if (recent >= 2)
    throw new HttpError(
      429,
      "EMAIL_RATE_LIMITED",
      "Wait two minutes before requesting another email",
    );
  const code = randomBytes(16).toString("hex");
  await tx.emailVerificationRequest.create({
    data: {
      verificationCode: code,
      email,
      teamNumber,
      expiresAt: new Date(Date.now() + 20 * 60000),
    },
  });
  await enqueue(tx, "verify:" + code, {
    kind: "email.send",
    to: email,
    subject: "Lovat Email Verification",
    text: "Verify your team email: " + new URL("/verify/" + code, website).href,
  });
}
