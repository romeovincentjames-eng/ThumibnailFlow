import OpenAI, { toFile } from "openai";
import { FORMAT_DIMENSIONS, type CreativePack, type OutputFormat, type YouTubeMetadata } from "@/lib/types";
import { getEnv, hasOpenAIConfig } from "@/lib/env";

type CreativeInput = {
  url: string;
  metadata: YouTubeMetadata;
  notes: string | null;
  transcript: string | null;
  hasReferenceImage?: boolean;
};

type ThumbnailInput = {
  format: OutputFormat;
  conceptNumber: number;
  conceptCount: number;
  metadata: YouTubeMetadata;
  creative: CreativePack;
  referenceImage: {
    buffer: Buffer;
    contentType: string;
  } | null;
};

let client: OpenAI | null = null;

function getClient() {
  if (!hasOpenAIConfig()) return null;

  if (!client) {
    client = new OpenAI({ apiKey: getEnv("OPENAI_API_KEY") });
  }

  return client;
}

export async function generateCreativePack(input: CreativeInput): Promise<CreativePack> {
  const openai = getClient();

  if (!openai) {
    return fallbackCreativePack(input);
  }

  const system = [
    "You are ThumbnailFlow Batch, a video packaging strategist.",
    "Return only strict JSON with improvedTitle, improvedDescription, hashtags, and thumbnailPrompt.",
    "Make thumbnails highly clickable, readable, and honest to the video's topic."
  ].join(" ");

  const user = `
Source: ${input.url}
Video title: ${input.metadata.title}
Video description: ${input.metadata.description || "None provided"}
Channel: ${input.metadata.channelTitle || "Unknown"}
Creator direction and notes: ${input.notes || "None"}
Transcript: ${input.transcript || "None"}

Create:
- 1 improved YouTube title under 72 characters
- 1 improved YouTube description, 2 compact paragraphs
- 5 to 8 hashtags
- 1 detailed thumbnail prompt

Thumbnail prompt requirements:
- ${input.hasReferenceImage ? "Use the uploaded reference image only as style/layout inspiration" : "No reference image was uploaded, so create the thumbnail from the video topic and creator notes"}
- ${input.hasReferenceImage ? "Do not copy pixel-for-pixel" : "Do not mention or depend on a missing reference image"}
- If creator thumbnail direction is provided, honor it as the main visual direction unless it conflicts with the video topic
- Create a new original thumbnail for this video's topic
- Prioritize bold readable text, clear focal subject, contrast, and emotional curiosity
`;

  try {
    const response = await openai.responses.create({
      model: getEnv("OPENAI_TEXT_MODEL") || "gpt-4.1-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    } as any);

    const output = response.output_text ?? "";
    return normalizeCreativePack(JSON.parse(extractJson(output)), input);
  } catch (error) {
    console.error("OpenAI text generation failed", error);
    throw new Error("OpenAI text generation failed. No points were spent for unfinished generation.");
  }
}

export async function generateThumbnailImage(input: ThumbnailInput) {
  const openai = getClient();

  if (!openai) {
    return generateSvgPlaceholder(input);
  }

  const size = getOpenAIImageSize(input.format);
  const prompt = buildImagePrompt(input);

  try {
    const response = input.referenceImage
      ? await openai.images.edit({
          model: getEnv("OPENAI_IMAGE_MODEL") || "gpt-image-1.5",
          image: await toFile(input.referenceImage.buffer, "reference-image.png", {
            type: input.referenceImage.contentType || "image/png"
          }),
          prompt,
          size,
          quality: getEnv("OPENAI_IMAGE_QUALITY") || "medium",
          background: "opaque",
          output_format: "png"
        } as any)
      : await openai.images.generate({
          model: getEnv("OPENAI_IMAGE_MODEL") || "gpt-image-1.5",
          prompt,
          size,
          quality: getEnv("OPENAI_IMAGE_QUALITY") || "medium",
          background: "opaque",
          output_format: "png"
        } as any);

    const first = response.data?.[0];
    if (first?.b64_json) {
      return Buffer.from(first.b64_json, "base64");
    }

    if (first?.url) {
      const imageResponse = await fetch(first.url);
      if (imageResponse.ok) {
        return Buffer.from(await imageResponse.arrayBuffer());
      }
    }

    throw new Error("Image response did not include a usable image.");
  } catch (error) {
    console.error("OpenAI image generation failed", error);
    throw new Error("OpenAI image generation failed. The unfinished image was refunded.");
  }
}

export async function normalizeThumbnailBuffer(buffer: Buffer, format: OutputFormat) {
  const dimensions = FORMAT_DIMENSIONS[format];

  try {
    const sharp = (await import("sharp")).default;
    return await sharp(buffer)
      .resize(dimensions.width, dimensions.height, { fit: "cover", position: "center" })
      .png()
      .toBuffer();
  } catch {
    return buffer;
  }
}

function buildImagePrompt(input: ThumbnailInput) {
  const dimensions = FORMAT_DIMENSIONS[input.format];
  const conceptDirection = getConceptDirection(input.conceptNumber);
  const referenceBehavior = input.referenceImage
    ? [
        "Reference behavior:",
        "- Treat the uploaded image as loose style/layout inspiration only",
        "- Do not recreate the same people, text, composition, or pixels",
        "- Change the scene and focal subject to match the new video's topic"
      ].join("\n")
    : [
        "Reference behavior:",
        "- No reference image was uploaded",
        "- Create an original thumbnail from the topic, metadata, transcript, and notes",
        "- Use a fresh composition with no dependency on a source image"
      ].join("\n");

  return `
Create concept ${input.conceptNumber} of ${input.conceptCount} as a new original video thumbnail for:
Title: ${input.creative.improvedTitle}
Topic context: ${input.metadata.description || input.metadata.title}
Format: ${input.format}, final crop ${dimensions.width}x${dimensions.height}

Creative direction:
${input.creative.thumbnailPrompt}

Concept variation:
${conceptDirection}

${referenceBehavior}
- Use bold readable thumbnail text only when it improves clickability
- High contrast, clean focal hierarchy, mobile-readable, no watermarks
`;
}

function getConceptDirection(conceptNumber: number) {
  const directions = [
    "Big promise composition: bold headline, obvious payoff, strong focal subject, clean contrast.",
    "Curiosity gap composition: visual tension, one surprising object or expression, minimal readable text.",
    "Authority composition: polished editorial look, confident subject, high-trust typography, crisp hierarchy.",
    "Before-after composition: split visual or transformation cue, immediate contrast, simple text.",
    "Problem-solution composition: clear pain point on one side, aspirational outcome on the other.",
    "High-energy composition: dynamic angle, motion cues, punchy text, saturated accents.",
    "Minimal premium composition: one iconic subject, large negative space, sharp typography.",
    "Data/proof composition: visible evidence cue, chart or metric motif, strong headline.",
    "Story/drama composition: cinematic lighting, emotional face or object, cliffhanger feel.",
    "Contrarian composition: unexpected claim, visual reversal, readable provocative text."
  ];

  return directions[(conceptNumber - 1) % directions.length];
}

function getOpenAIImageSize(format: OutputFormat) {
  if (format === "1:1") return "1024x1024";
  if (format === "16:9") return "1536x1024";
  return "1024x1536";
}

function normalizeCreativePack(candidate: Partial<CreativePack>, input: CreativeInput): CreativePack {
  const fallback = fallbackCreativePack(input);
  const hashtags = Array.isArray(candidate.hashtags)
    ? candidate.hashtags
        .map((tag) => String(tag).trim())
        .filter(Boolean)
        .map((tag) => (tag.startsWith("#") ? tag : `#${tag.replace(/^#+/, "")}`))
        .slice(0, 8)
    : fallback.hashtags;

  return {
    improvedTitle: clean(candidate.improvedTitle, fallback.improvedTitle, 90),
    improvedDescription: clean(candidate.improvedDescription, fallback.improvedDescription, 900),
    hashtags,
    thumbnailPrompt: clean(candidate.thumbnailPrompt, fallback.thumbnailPrompt, 1600)
  };
}

function clean(value: unknown, fallback: string, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text.slice(0, maxLength) : fallback;
}

function extractJson(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }

  return text;
}

function fallbackCreativePack(input: CreativeInput): CreativePack {
  const topic = input.metadata.title || "This YouTube video";
  const shortTopic = topic.length > 54 ? `${topic.slice(0, 51)}...` : topic;

  return {
    improvedTitle: `${shortTopic}: What Viewers Need to Know`,
    improvedDescription: [
      `A sharper look at ${topic}, built for viewers who want the key ideas without the noise.`,
      input.notes ? `Creator notes: ${input.notes}` : "This batch was generated in local demo mode."
    ].join("\n\n"),
    hashtags: ["#YouTube", "#CreatorTools", "#ThumbnailDesign", "#VideoMarketing", "#ContentStrategy"],
    thumbnailPrompt: [
      `Create a high-click YouTube thumbnail about "${topic}".`,
      "Use a bold focal subject, dramatic lighting, strong contrast, and two to five words of readable headline text.",
      input.hasReferenceImage
        ? "Use the uploaded reference only as loose layout and style inspiration; do not copy the image."
        : "No reference image was uploaded, so create an original layout from the topic."
    ].join(" ")
  };
}

function generateSvgPlaceholder(input: ThumbnailInput) {
  const { width, height } = FORMAT_DIMENSIONS[input.format];
  const safeTitle = escapeXml(input.creative.improvedTitle).slice(0, 90);
  const label = escapeXml(`${input.format} / concept ${input.conceptNumber}`);
  const fontSize = Math.max(46, Math.floor(width / 16));
  const subSize = Math.max(24, Math.floor(width / 38));

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1f5ed6"/>
      <stop offset="0.54" stop-color="#07936b"/>
      <stop offset="1" stop-color="#ff7a35"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <rect x="${Math.floor(width * 0.05)}" y="${Math.floor(height * 0.08)}" width="${Math.floor(width * 0.9)}" height="${Math.floor(height * 0.84)}" rx="36" fill="rgba(17,24,39,0.42)" stroke="rgba(255,255,255,0.42)" stroke-width="6"/>
  <text x="${Math.floor(width * 0.08)}" y="${Math.floor(height * 0.22)}" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="${subSize}" font-weight="800">THUMBNAILFLOW ${label}</text>
  <foreignObject x="${Math.floor(width * 0.08)}" y="${Math.floor(height * 0.3)}" width="${Math.floor(width * 0.66)}" height="${Math.floor(height * 0.48)}">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial,Helvetica,sans-serif;color:white;font-size:${fontSize}px;font-weight:900;line-height:0.96;text-transform:uppercase;overflow-wrap:anywhere;">${safeTitle}</div>
  </foreignObject>
  <circle cx="${Math.floor(width * 0.84)}" cy="${Math.floor(height * 0.55)}" r="${Math.floor(Math.min(width, height) * 0.16)}" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.72)" stroke-width="8"/>
  <path d="M ${Math.floor(width * 0.81)} ${Math.floor(height * 0.46)} L ${Math.floor(width * 0.81)} ${Math.floor(height * 0.64)} L ${Math.floor(width * 0.91)} ${Math.floor(height * 0.55)} Z" fill="#ffffff"/>
</svg>`;

  return Buffer.from(svg);
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
