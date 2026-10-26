// Temporary upload signer for public match videos. No database/report access.
import { S3Client } from "bun";
import { timingSafeEqual } from "node:crypto";

export function authorize(request: Request, token: string, expires: number) {
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${token}`;
  return (
    token.length >= 32 &&
    Date.now() < expires &&
    supplied.length === expected.length &&
    timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  );
}
export function mediaStore() {
  const endpoint = new URL(process.env.OCR_MEDIA_ENDPOINT!);
  endpoint.hostname = `${process.env.OCR_MEDIA_BUCKET}.${endpoint.hostname}`;
  return new S3Client({
    endpoint: endpoint.href,
    virtualHostedStyle: true,
    region: process.env.OCR_MEDIA_REGION ?? "auto",
    accessKeyId: process.env.OCR_MEDIA_ACCESS_KEY_ID,
    secretAccessKey: process.env.OCR_MEDIA_SECRET_ACCESS_KEY,
  });
}
export async function relay(request: Request) {
  const path = new URL(request.url).pathname;
  if (path === "/health") return new Response("ok");
  if (
    !authorize(
      request,
      process.env.OCR_UPLOAD_TOKEN ?? "",
      Number(process.env.OCR_UPLOAD_EXPIRES),
    )
  )
    return new Response("Unauthorized", { status: 401 });
  if (
    request.method !== "POST" ||
    path !== "/sign" ||
    Number(request.headers.get("content-length")) > 1024
  )
    return new Response("Invalid request", { status: 400 });
  try {
    const { videoKey } = (await request.json()) as { videoKey: string };
    const allowed = (process.env.OCR_UPLOAD_VIDEOS ?? "").split(",");
    if (!/^[\w-]{11}$/.test(videoKey) || !allowed.includes(videoKey))
      return new Response("Invalid video", { status: 400 });
    const file = mediaStore().file(`media/2026cacg/${videoKey}.mp4`);
    return Response.json({
      exists: await file.exists(),
      url: file.presign({ method: "PUT", expiresIn: 600 }),
    });
  } catch {
    return new Response("Upload signer unavailable", { status: 503 });
  }
}
if (import.meta.main)
  Bun.serve({
    port: Number(process.env.PORT ?? 8080),
    maxRequestBodySize: 1024,
    fetch: relay,
  });
