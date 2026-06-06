import { getEnv } from "@/lib/env";
import type { YouTubeMetadata } from "@/lib/types";

export function extractVideoId(url: string) {
  try {
    const parsed = new URL(url);

    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.split("/").filter(Boolean)[0] ?? null;
    }

    if (parsed.searchParams.get("v")) {
      return parsed.searchParams.get("v");
    }

    const parts = parsed.pathname.split("/").filter(Boolean);
    const markerIndex = parts.findIndex((part) => ["shorts", "embed", "live"].includes(part));
    if (markerIndex >= 0) {
      return parts[markerIndex + 1] ?? null;
    }
  } catch {
    return null;
  }

  return null;
}

export async function extractYouTubeMetadata(sourceUrl: string): Promise<YouTubeMetadata> {
  const videoId = extractVideoId(sourceUrl);

  if (videoId && getEnv("YOUTUBE_API_KEY")) {
    const apiUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    apiUrl.searchParams.set("part", "snippet");
    apiUrl.searchParams.set("id", videoId);
    apiUrl.searchParams.set("key", getEnv("YOUTUBE_API_KEY"));

    try {
      const response = await fetch(apiUrl, { next: { revalidate: 3600 } });
      if (response.ok) {
        const payload = await response.json();
        const snippet = payload.items?.[0]?.snippet;
        if (snippet?.title) {
          return {
            title: snippet.title,
            description: snippet.description ?? "",
            channelTitle: snippet.channelTitle,
            thumbnailUrl:
              snippet.thumbnails?.maxres?.url ??
              snippet.thumbnails?.standard?.url ??
              snippet.thumbnails?.high?.url
          };
        }
      }
    } catch {
      // Continue to oEmbed/fallback when YouTube's API is unavailable.
    }
  }

  try {
    const oembed = new URL("https://www.youtube.com/oembed");
    oembed.searchParams.set("url", sourceUrl);
    oembed.searchParams.set("format", "json");

    const response = await fetch(oembed, { next: { revalidate: 3600 } });
    if (response.ok) {
      const payload = await response.json();
      return {
        title: payload.title ?? fallbackTitle(sourceUrl),
        description: payload.author_name ? `Video by ${payload.author_name}.` : "",
        channelTitle: payload.author_name,
        thumbnailUrl: payload.thumbnail_url
      };
    }
  } catch {
    // Local demos can run without outbound YouTube access.
  }

  return {
    title: fallbackTitle(sourceUrl),
    description: "",
    thumbnailUrl: videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : undefined
  };
}

function fallbackTitle(sourceUrl: string) {
  const id = extractVideoId(sourceUrl);
  return id ? `YouTube video ${id}` : "Untitled YouTube video";
}
