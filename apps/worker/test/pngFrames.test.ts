import { expect, test } from "bun:test";
import { pngFrames } from "../src/ocr/pngFrames";
const signature = Buffer.from("89504e470d0a1a0a", "hex");
function chunk(name: string, length = 0) {
  const out = Buffer.alloc(length + 12);
  out.writeUInt32BE(length);
  out.write(name, 4, "ascii");
  return out;
}
const image = Buffer.concat([
  signature,
  chunk("IHDR", 13),
  chunk("IDAT", 100),
  chunk("IEND"),
]);
async function* input(chunks: Uint8Array[]) {
  yield* chunks;
}
async function read(chunks: Uint8Array[], limit?: number) {
  return Array.fromAsync(pngFrames(input(chunks), limit));
}
test("reads split headers, chunks and adjacent PNG frames", async () => {
  const data = Buffer.concat([image, image]);
  const pieces = Array.from({ length: Math.ceil(data.length / 7) }, (_, i) =>
    data.subarray(i * 7, i * 7 + 7),
  );
  expect(await read(pieces)).toEqual([image, image]);
});
test("bounds each PNG rather than the combined size of many frames in a chunk", async () => {
  const images = Array.from({ length: 1000 }, () => image);
  expect((await read([Buffer.concat(images)], image.length)).length).toBe(1000);
});
test("rejects malformed, incomplete and oversized frames", async () => {
  await expect(read([Buffer.from("not a png")])).rejects.toThrow(
    "Invalid OCR frame stream",
  );
  await expect(read([image.subarray(0, image.length - 3)])).rejects.toThrow(
    "Incomplete OCR frame stream",
  );
  await expect(read([image], 50)).rejects.toThrow("Invalid OCR chunk");
  await expect(read([image], image.length - 1)).rejects.toThrow(
    "OCR frame exceeds memory budget",
  );
});
