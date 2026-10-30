export class OcrMediaError extends Error {}
export class OcrMediaPending extends OcrMediaError {}
export class OcrProviderBlocked extends OcrMediaError {
  override name = "OcrProviderBlocked";
}
export function commandFailure(
  executable: string,
  diagnostic: string,
): OcrMediaError {
  if (executable === "yt-dlp") {
    if (
      /processing this video|video is (?:still )?(?:being processed|processing)/i.test(
        diagnostic,
      )
    )
      return new OcrMediaPending(
        "YouTube is still processing the match video; try again after it becomes available.",
      );
    if (
      /sign in|not a bot|http error (403|429)|too many requests/i.test(
        diagnostic,
      )
    )
      return new OcrProviderBlocked("The video provider blocked the download.");
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
