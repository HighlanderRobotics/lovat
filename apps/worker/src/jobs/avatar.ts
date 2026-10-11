// TBA media contains base64 raster data. Detect its format instead of assuming PNG.
export function avatarDataUri(value: string | undefined) {
  if (!value) return null;

  const base64 = value
    .replace(/^data:image\/[a-z]+;base64,/, "")
    .replace(/\s/g, "");

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;

  const bytes = Buffer.from(base64, "base64");
  const signature = bytes.subarray(0, 12);
  const hex = signature.toString("hex");
  const mime = hex.startsWith("89504e470d0a1a0a")
    ? "image/png"
    : hex.startsWith("ffd8ff")
      ? "image/jpeg"
      : signature.toString("ascii").startsWith("GIF8")
        ? "image/gif"
        : signature.toString("ascii").startsWith("RIFF") &&
            signature.toString("ascii", 8, 12) === "WEBP"
          ? "image/webp"
          : null;

  return mime ? `data:${mime};base64,${bytes.toString("base64")}` : null;
}
