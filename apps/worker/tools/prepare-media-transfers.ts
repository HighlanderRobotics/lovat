// One-shot private Railway task. It opens no listener and needs no database.
// Capabilities authorize PUT only to the explicitly selected public-video keys.
import { S3Client } from "bun";

type MediaFile = {
  exists(): Promise<boolean>;
  presign(options: { method: "PUT"; expiresIn: number }): string;
};
export async function prepareMediaTransfers(
  store: { file(key: string): MediaFile },
  videos: string[],
  deadline: number,
  now = Date.now(),
) {
  if (!videos.length || videos.length > 59 || new Set(videos).size !== videos.length ||
      videos.some(v => !/^[A-Za-z0-9_-]{11}$/.test(v))) throw new Error("Invalid explicit CalGames video list");
  const expiresIn = Math.floor((deadline - now) / 1000);
  if (!Number.isFinite(expiresIn) || expiresIn < 1 || expiresIn > 3600)
    throw new Error("Transfer deadline must be within one hour");
  const transfers = [];
  for (const videoKey of videos) {
    const objectKey = `media/2026cacg/${videoKey}.mp4`;
    const file = store.file(objectKey);
    const exists = await file.exists();
    transfers.push({ videoKey, objectKey, exists, expiresAt: now + expiresIn * 1000,
      ...(exists ? {} : { putUrl: file.presign({ method: "PUT", expiresIn }) }) });
  }
  return transfers;
}

if (import.meta.main) {
  const endpoint = new URL(process.env.OCR_MEDIA_ENDPOINT!);
  if (endpoint.protocol !== "https:" || endpoint.hostname !== "t3.storageapi.dev")
    throw new Error("Unexpected private media endpoint");
  const bucket = process.env.OCR_MEDIA_BUCKET!;
  if (bucket !== "ocr-calgames-media-rg-qxw") throw new Error("Unexpected CalGames bucket");
  endpoint.hostname = `${bucket}.${endpoint.hostname}`;
  const store = new S3Client({ endpoint: endpoint.href, virtualHostedStyle: true,
    region: process.env.OCR_MEDIA_REGION ?? "auto",
    accessKeyId: process.env.OCR_MEDIA_ACCESS_KEY_ID,
    secretAccessKey: process.env.OCR_MEDIA_SECRET_ACCESS_KEY });
  const videos = (process.env.OCR_TRANSFER_VIDEOS ?? "").split(",");
  const transfers = await prepareMediaTransfers(store, videos, Number(process.env.OCR_TRANSFER_EXPIRES));
  // Railway project logs are the private transfer channel; never print these
  // capability URLs in public/user-facing summaries or commit them to Git.
  for (const transfer of transfers) console.info("media_transfer=" + JSON.stringify(transfer));
  console.info("media_transfer_complete=" + JSON.stringify({ videos: transfers.length }));
}
