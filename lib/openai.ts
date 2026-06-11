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
    throw new Error(
      "OpenAI is not configured. Add OPENAI_API_KEY in your environment and redeploy before generating."
    );
  }

  const system = [
    "You are ThumbnailFlow Batch, a YouTube thumbnail and packaging strategist.",
    "You create still thumbnail image concepts only; never create video files, animations, or motion sequences.",
    "Return only strict JSON with improvedTitle, titleOptions, improvedDescription, hashtags, and thumbnailPrompt.",
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
- 1 improved YouTube title under 72 characters. This must be the strongest overall title choice
- 5 title options under 72 characters each. Make the first title option exactly match improvedTitle
- 1 improved YouTube description, 2 compact paragraphs
- 5 to 8 hashtags
- 1 detailed thumbnail prompt

Thumbnail prompt requirements:
- Use the transcript as primary topic context when it is provided
- Describe one still YouTube thumbnail image, not a video, animation, or scene sequence
- ${input.hasReferenceImage ? "Use the uploaded reference image only as style/layout inspiration" : "No reference image was uploaded, so create the thumbnail from the video topic and creator notes"}
- ${input.hasReferenceImage ? "Do not copy pixel-for-pixel" : "Do not mention or depend on a missing reference image"}
- If creator thumbnail direction is provided, honor it as the main visual direction unless it conflicts with the video topic
- Create a new original thumbnail for this source topic
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
    throw new Error(
      "OpenAI image generation is not configured. Add OPENAI_API_KEY in your environment and redeploy before generating thumbnails."
    );
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
Create concept ${input.conceptNumber} of ${input.conceptCount} as a new original still YouTube thumbnail image for:
Title: ${input.creative.improvedTitle}
Topic context: ${input.metadata.description || input.metadata.title}
Format: ${input.format}, final crop ${dimensions.width}x${dimensions.height}

Creative direction:
${input.creative.thumbnailPrompt}

Concept variation:
${conceptDirection}

${referenceBehavior}
- Use bold readable thumbnail text only when it improves clickability
- High contrast, clean focal hierarchy, mobile-readable
- Do not create a video file, animation, filmstrip, playback controls, fake player UI, or watermark
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
  const improvedTitle = clean(candidate.improvedTitle, fallback.improvedTitle, 90);
  const titleOptions = normalizeTitleOptions(candidate.titleOptions, improvedTitle, fallback.titleOptions);
  const hashtags = Array.isArray(candidate.hashtags)
    ? candidate.hashtags
        .map((tag) => String(tag).trim())
        .filter(Boolean)
        .map((tag) => (tag.startsWith("#") ? tag : `#${tag.replace(/^#+/, "")}`))
        .slice(0, 8)
    : fallback.hashtags;

  return {
    improvedTitle,
    titleOptions,
    improvedDescription: clean(candidate.improvedDescription, fallback.improvedDescription, 900),
    hashtags,
    thumbnailPrompt: clean(candidate.thumbnailPrompt, fallback.thumbnailPrompt, 1600)
  };
}

function normalizeTitleOptions(value: unknown, improvedTitle: string, fallback: string[]) {
  const rawTitles = Array.isArray(value) ? value : fallback;
  const uniqueTitles = [improvedTitle, ...rawTitles]
    .map((title) => clean(title, "", 90))
    .filter(Boolean)
    .reduce<string[]>((titles, title) => {
      const normalized = title.toLowerCase();
      return titles.some((existing) => existing.toLowerCase() === normalized) ? titles : [...titles, title];
    }, []);

  return uniqueTitles.slice(0, 5);
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
    titleOptions: [
      `${shortTopic}: What Viewers Need to Know`,
      `The Fastest Way to Understand ${shortTopic}`,
      `${shortTopic}: The Big Takeaway`,
      `What Everyone Misses About ${shortTopic}`,
      `${shortTopic}: Before You Watch`
    ].map((title) => title.slice(0, 90)),
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
