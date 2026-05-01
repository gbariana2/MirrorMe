export function extractYouTubeVideoId(rawUrl: string) {
  try {
    const url = new URL(rawUrl.trim());
    const host = url.hostname.toLowerCase();

    if (host === "youtu.be") {
      const id = url.pathname.replace("/", "").trim();
      return id || null;
    }

    if (host.endsWith("youtube.com")) {
      if (url.pathname === "/watch") {
        return url.searchParams.get("v");
      }

      if (url.pathname.startsWith("/shorts/")) {
        return url.pathname.split("/")[2] ?? null;
      }

      if (url.pathname.startsWith("/embed/")) {
        return url.pathname.split("/")[2] ?? null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export function isYouTubeUrl(rawUrl: string | null) {
  if (!rawUrl) {
    return false;
  }

  return extractYouTubeVideoId(rawUrl) !== null;
}
