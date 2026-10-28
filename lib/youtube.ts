/** Extracts the 11-character video id from a youtube.com, m.youtube.com, Shorts or youtu.be URL. */
export function extractYouTubeId(value: string): string | null {
  const input = value.trim();
  if (!input) return null;
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let id = "";
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname.startsWith("/shorts/")) id = url.pathname.split("/")[2] || "";
      else id = url.searchParams.get("v") || "";
    } else if (host === "youtu.be") {
      id = url.pathname.split("/").filter(Boolean)[0] || "";
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}
