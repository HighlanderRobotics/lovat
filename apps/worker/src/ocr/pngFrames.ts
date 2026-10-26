// Decode FFmpeg's concatenated PNG stream without treating a chunk containing
// several images as one oversized frame. The input is a backpressured stream.
export async function* pngFrames(
  stream: AsyncIterable<Uint8Array>,
  maxFrameBytes = 16 * 1024 * 1024,
): AsyncGenerator<Buffer> {
  let pending = Buffer.alloc(0);
  for await (const data of stream) {
    for (let position = 0; position < data.length; position += 64 * 1024) {
      pending = Buffer.concat([
        pending,
        Buffer.from(data.subarray(position, position + 64 * 1024)),
      ]);
      let complete = true;
      while (complete && pending.length >= 8) {
        if (pending.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a")
          throw new Error("Invalid OCR frame stream");
        let offset = 8;
        complete = false;
        while (pending.length >= offset + 12) {
          const length = pending.readUInt32BE(offset);
          if (length > maxFrameBytes) throw new Error("Invalid OCR chunk");
          const end = offset + 12 + length;
          if (end > maxFrameBytes)
            throw new Error("OCR frame exceeds memory budget");
          if (end > pending.length) break;
          const final =
            pending.toString("ascii", offset + 4, offset + 8) === "IEND";
          offset = end;
          if (final) {
            const frame = pending.subarray(0, end);
            pending = pending.subarray(end);
            yield frame;
            complete = true;
            break;
          }
        }
      }
      if (pending.length > maxFrameBytes)
        throw new Error("OCR frame exceeds memory budget");
    }
  }
  if (pending.length) throw new Error("Incomplete OCR frame stream");
}
