export function trainingOriginAllowed(
  origin: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  // Native clients may omit Origin; both native and browser clients must still
  // authenticate with a session token after the upgrade.
  if (!origin) {
    return true;
  }

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.origin !== origin) {
    return false;
  }
  if (
    env.NODE_ENV === "development" &&
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(url.hostname)
  ) {
    return true;
  }
  if (url.protocol !== "https:") {
    return false;
  }
  if (url.hostname === "lovat.app" || url.hostname.endsWith(".lovat.app")) {
    return true;
  }

  const configured = [
    ...(env.CORS_ALLOWED_ORIGINS ?? "").split(","),
    env.RAILWAY_SERVICE_WEBSITE_URL,
    env.RAILWAY_PUBLIC_DOMAIN,
  ];
  return configured.some((value) => {
    if (!value?.trim()) {
      return false;
    }
    try {
      const candidate = new URL(
        value.includes("://") ? value.trim() : `https://${value.trim()}`,
      );
      return candidate.protocol === "https:" && candidate.origin === origin;
    } catch {
      return false;
    }
  });
}
