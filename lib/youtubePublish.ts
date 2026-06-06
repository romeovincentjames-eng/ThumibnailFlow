import { getStoredFileBuffer } from "@/lib/storage";
import { extractVideoId } from "@/lib/youtube";
import type { Thumbnail, VideoWithThumbnails } from "@/lib/types";

const MAX_YOUTUBE_THUMBNAIL_BYTES = 2 * 1024 * 1024;

type YouTubeSnippet = {
  title?: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  defaultLanguage?: string;
  defaultAudioLanguage?: string;
};

export type YouTubeApplyResult = {
  videoId: string;
  titleUpdated: boolean;
  descriptionUpdated: boolean;
  thumbnailUpdated: boolean;
  thumbnailFormat: string | null;
};

export async function applyVideoToYouTube(input: {
  video: VideoWithThumbnails;
  accessToken: string;
}) {
  const youtubeVideoId = input.video.sourceUrl ? extractVideoId(input.video.sourceUrl) : null;

  if (!youtubeVideoId) {
    throw new Error("This result is not connected to a valid YouTube video URL.");
  }

  if (!input.video.generatedTitle || !input.video.generatedDescription) {
    throw new Error("Wait for the generated title and description before applying to YouTube.");
  }

  const existingSnippet = await fetchVideoSnippet(youtubeVideoId, input.accessToken);
  await updateVideoSnippet({
    videoId: youtubeVideoId,
    accessToken: input.accessToken,
    existingSnippet,
    title: input.video.generatedTitle,
    description: withHashtags(input.video.generatedDescription, input.video.hashtags)
  });

  const thumbnail = chooseYouTubeThumbnail(input.video.thumbnails);
  let thumbnailUpdated = false;
  let thumbnailFormat: string | null = null;

  if (thumbnail) {
    const stored = await getStoredFileBuffer(thumbnail.storagePath);
    if (stored?.buffer) {
      const prepared = await prepareThumbnailForYouTube(stored.buffer);
      await uploadYouTubeThumbnail({
        videoId: youtubeVideoId,
        accessToken: input.accessToken,
        buffer: prepared.buffer,
        contentType: prepared.contentType
      });
      thumbnailUpdated = true;
      thumbnailFormat = thumbnail.format;
    }
  }

  return {
    videoId: youtubeVideoId,
    titleUpdated: true,
    descriptionUpdated: true,
    thumbnailUpdated,
    thumbnailFormat
  } satisfies YouTubeApplyResult;
}

async function fetchVideoSnippet(videoId: string, accessToken: string): Promise<YouTubeSnippet> {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("id", videoId);

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Could not load the YouTube video snippet.");
  }

  const snippet = payload.items?.[0]?.snippet;

  if (!snippet) {
    throw new Error("YouTube could not find this video for the connected account.");
  }

  return snippet;
}

async function updateVideoSnippet(input: {
  videoId: string;
  accessToken: string;
  existingSnippet: YouTubeSnippet;
  title: string;
  description: string;
}) {
  if (!input.existingSnippet.categoryId) {
    throw new Error("YouTube did not return a category for this video, so the snippet cannot be updated safely.");
  }

  const snippet: YouTubeSnippet = {
    title: input.title.slice(0, 100),
    description: input.description.slice(0, 5000),
    categoryId: input.existingSnippet.categoryId
  };

  if (input.existingSnippet.tags?.length) {
    snippet.tags = input.existingSnippet.tags;
  }

  if (input.existingSnippet.defaultLanguage) {
    snippet.defaultLanguage = input.existingSnippet.defaultLanguage;
  }

  if (input.existingSnippet.defaultAudioLanguage) {
    snippet.defaultAudioLanguage = input.existingSnippet.defaultAudioLanguage;
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet");

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      id: input.videoId,
      snippet
    })
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Could not update the YouTube title and description.");
  }
}

async function uploadYouTubeThumbnail(input: {
  videoId: string;
  accessToken: string;
  buffer: Buffer;
  contentType: string;
}) {
  const url = new URL("https://www.googleapis.com/upload/youtube/v3/thumbnails/set");
  url.searchParams.set("videoId", input.videoId);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      "content-type": input.contentType
    },
    body: new Uint8Array(input.buffer)
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Could not upload the YouTube thumbnail.");
  }
}

function chooseYouTubeThumbnail(thumbnails: Thumbnail[]) {
  return (
    thumbnails.find((thumbnail) => thumbnail.format === "16:9" && thumbnail.status === "generated") ??
    thumbnails.find((thumbnail) => thumbnail.status === "generated") ??
    null
  );
}

async function prepareThumbnailForYouTube(buffer: Buffer) {
  try {
    const sharp = (await import("sharp")).default;
    const resized = await sharp(buffer).resize(1280, 720, { fit: "cover", position: "center" }).jpeg({ quality: 86 }).toBuffer();

    if (resized.length <= MAX_YOUTUBE_THUMBNAIL_BYTES) {
      return { buffer: resized, contentType: "image/jpeg" };
    }

    const compressed = await sharp(buffer)
      .resize(1280, 720, { fit: "cover", position: "center" })
      .jpeg({ quality: 72 })
      .toBuffer();

    return { buffer: compressed, contentType: "image/jpeg" };
  } catch {
    if (buffer.length > MAX_YOUTUBE_THUMBNAIL_BYTES) {
      throw new Error("The selected thumbnail is over YouTube's 2MB limit and could not be compressed.");
    }

    return { buffer, contentType: "image/png" };
  }
}

function withHashtags(description: string, hashtags: string[]) {
  const tags = hashtags.map((tag) => tag.trim()).filter(Boolean);
  if (!tags.length) return description;
  return `${description.trim()}\n\n${tags.join(" ")}`.trim();
}
