export class OcrMediaError extends Error {}
export function commandFailure(
  executable: string,
  diagnostic: string,
): OcrMediaError {
  if (executable === "yt-dlp") {
    if (
      /sign in|not a bot|http error (403|429)|too many requests/i.test(
        diagnostic,
      )
    )
      return new OcrMediaError("The video provider blocked the download.");
    if (/requested format is not available/i.test(diagnostic))
      return new OcrMediaError(
        "No supported downloadable video format is available.",
      );
    return new OcrMediaError("The match video could not be downloaded.");
  }
  if (executable === "tesseract")
    return new OcrMediaError("The scoreboard crop could not be read.");
  return new OcrMediaError("The match video could not be decoded.");
}
