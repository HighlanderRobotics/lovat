import { Router } from "express";
import z from "zod";
import type { Response } from "express";
import {
  requireAuth,
  type AuthenticatedRequest,
} from "../../lib/middleware/requireAuth.js";
import { requireVerifiedTeam } from "../../lib/middleware/requireVerifiedTeam.js";
const router = Router();
router.use(requireAuth, requireVerifiedTeam);
export async function eventAnalysisProxy(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  if (
    req.tokenType === "apiKey" ||
    req.user.teamNumber !== 8033 ||
    !["ANALYST", "SCOUTING_LEAD"].includes(req.user.role)
  ) {
    res.status(403).json({
      displayError: "Event OCR is enabled for team 8033 analysts and leads.",
    });
    return;
  }
  const parsed = z
    .enum(["2026cacg", "2026casnf", "2026cagle"])
    .safeParse(req.params.event);
  if (!parsed.success) {
    res
      .status(400)
      .json({ displayError: "This event is not enabled for OCR." });
    return;
  }
  if (req.method === "POST" && req.body && Object.keys(req.body).length) {
    res
      .status(400)
      .json({ displayError: "No OCR request options are supported." });
    return;
  }
  const configured = process.env.OCR_WORKER_URL,
    token = process.env.OCR_CONTROL_TOKEN;
  if (!configured || !token || token.length < 32) {
    res.status(503).json({ displayError: "Event OCR is not configured." });
    return;
  }
  try {
    const url = new URL(configured);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !url.hostname.endsWith(".railway.internal") ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw Error("Invalid worker configuration");
    url.pathname = `/ocr/events/${parsed.data}`;
    const response = await fetch(url, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: req.method === "POST" ? "{}" : undefined,
      signal: AbortSignal.timeout(15000),
      redirect: "error",
    });
    const body = await response.json();
    res.status(response.status).json(body);
  } catch {
    res
      .status(503)
      .json({ displayError: "Event OCR is temporarily unavailable." });
  }
}
router.get("/events/:event", eventAnalysisProxy);
router.post("/events/:event", eventAnalysisProxy);
export default router;
