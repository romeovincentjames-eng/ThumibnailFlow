import { NextResponse, type NextRequest } from "next/server";
import { getOrCreateBillingAccount } from "@/lib/billingSession";
import { enqueueBatch } from "@/lib/jobs/queue";
import { estimateBatchPoints, isInsufficientPointsError } from "@/lib/points";
import { getRepository } from "@/lib/repository";
import { uploadBrowserFile } from "@/lib/storage";
import {
  MAX_IMAGES_PER_BATCH,
  MAX_VIDEOS_PER_BATCH,
  SUPPORTED_FORMATS,
  THUMBNAIL_COUNT_OPTIONS,
  type OutputFormat,
  type SourceType,
  type ThumbnailCountOption
} from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let reserved:
    | {
        accountId: string;
        points: number;
        reference: string;
      }
    | null = null;

  try {
    const formData = await request.formData();
    const sourceType = parseSourceType(formData.get("sourceType"));
    const formats = parseFormats(formData.get("formats"));
    const globalThumbnailCount = parseRequiredThumbnailCount(formData.get("globalThumbnailCount"));
    const globalThumbnailDirection = nullableString(formData.get("globalThumbnailDirection"));
    const urls = parseUrls(formData.get("urls"));
    const uploadedVideos = formData
      .getAll("uploadedVideos")
      .filter((file): file is File => file instanceof File && file.size > 0);

    if (!formats.length) {
      return NextResponse.json({ error: "Select at least one output format." }, { status: 400 });
    }

    const sourceCount = sourceType === "youtube_link" ? urls.length : uploadedVideos.length;

    if (!sourceCount) {
      return NextResponse.json(
        {
          error:
            sourceType === "youtube_link"
              ? "Add at least one YouTube URL."
              : "Upload at least one video file."
        },
        { status: 400 }
      );
    }

    if (sourceCount > MAX_VIDEOS_PER_BATCH) {
      return NextResponse.json(
        { error: `ThumbnailFlow Batch supports up to ${MAX_VIDEOS_PER_BATCH} videos at once.` },
        { status: 400 }
      );
    }

    const perVideoCounts = Array.from({ length: sourceCount }, (_item, index) =>
      parseOptionalThumbnailCount(formData.get(`thumbnailCount-${index}`))
    );
    const totalImagesRequested = perVideoCounts.reduce(
      (total, count) => total + (count ?? globalThumbnailCount) * formats.length,
      0
    );

    if (totalImagesRequested > MAX_IMAGES_PER_BATCH) {
      return NextResponse.json(
        {
          error: `This batch would generate ${totalImagesRequested} images. Reduce videos, thumbnail count, or formats to stay at ${MAX_IMAGES_PER_BATCH} images or fewer.`
        },
        { status: 400 }
      );
    }

    const repository = getRepository();
    const account = await getOrCreateBillingAccount();
    const pointsRequired = estimateBatchPoints({
      videoCount: sourceCount,
      totalImages: totalImagesRequested
    });

    if (account.pointsBalance < pointsRequired) {
      return NextResponse.json(
        {
          error: `This batch needs ${pointsRequired} points. You have ${account.pointsBalance} points.`,
          pointsRequired,
          pointsBalance: account.pointsBalance
        },
        { status: 402 }
      );
    }

    const reservationRef = `batch:${crypto.randomUUID()}:reserve`;
    await repository.applyPointsDelta({
      accountId: account.id,
      delta: -pointsRequired,
      reason: "batch_reserve",
      reference: reservationRef,
      metadata: {
        sourceCount,
        totalImagesRequested,
        formats
      }
    });
    reserved = {
      accountId: account.id,
      points: pointsRequired,
      reference: reservationRef
    };

    const project = await repository.createProject(String(formData.get("projectName") || "Untitled batch"));
    const batch = await repository.createBatchJob({
      projectId: project.id,
      accountId: account.id,
      totalVideos: sourceCount,
      selectedFormats: formats,
      globalThumbnailCount,
      totalImagesRequested,
      pointsReserved: pointsRequired,
      pointsReservationRef: reservationRef
    });
    const globalReference = formData.get("globalReference");
    const globalStored =
      globalReference instanceof File && globalReference.size > 0
        ? await uploadBrowserFile(globalReference, `references/${batch.id}/global`)
        : null;

    await Promise.all(
      Array.from({ length: sourceCount }, async (_item, index) => {
        const perReference = formData.get(`reference-${index}`);
        const perStored =
          perReference instanceof File && perReference.size > 0
            ? await uploadBrowserFile(perReference, `references/${batch.id}/video-${index + 1}`)
            : null;
        const reference = perStored ?? globalStored;
        const notes = buildCreatorNotes({
          thumbnailDirection:
            nullableString(formData.get(`thumbnailDirection-${index}`)) ?? globalThumbnailDirection,
          notes: nullableString(formData.get(`notes-${index}`))
        });

        if (sourceType === "uploaded_video") {
          const uploaded = uploadedVideos[index];
          const storedVideo = await uploadBrowserFile(uploaded, `videos/${batch.id}/video-${index + 1}`);

          await repository.createVideo({
            batchJobId: batch.id,
            sourceType,
            sourceUrl: null,
            uploadedVideoPath: storedVideo.path,
            uploadedVideoUrl: storedVideo.publicUrl,
            uploadedVideoName: uploaded.name,
            referenceImagePath: reference?.path ?? null,
            referenceImageUrl: reference?.publicUrl ?? null,
            perVideoThumbnailCount: perVideoCounts[index],
            notes,
            transcript: nullableString(formData.get(`transcript-${index}`)),
            title: nullableString(formData.get(`title-${index}`)) ?? uploaded.name,
            description: nullableString(formData.get(`description-${index}`))
          });
          return;
        }

        await repository.createVideo({
          batchJobId: batch.id,
          sourceType,
          sourceUrl: urls[index],
          uploadedVideoPath: null,
          uploadedVideoUrl: null,
          uploadedVideoName: null,
          referenceImagePath: reference?.path ?? null,
          referenceImageUrl: reference?.publicUrl ?? null,
          perVideoThumbnailCount: perVideoCounts[index],
          notes,
          transcript: nullableString(formData.get(`transcript-${index}`)),
          title: null,
          description: null
        });
      })
    );

    await enqueueBatch(batch.id);

    return NextResponse.json({ batchId: batch.id });
  } catch (error) {
    console.error(error);

    if (reserved) {
      try {
        await getRepository().applyPointsDelta({
          accountId: reserved.accountId,
          delta: reserved.points,
          reason: "batch_refund",
          reference: `${reserved.reference}:create_failed`,
          metadata: {
            reservationReference: reserved.reference
          }
        });
      } catch (refundError) {
        console.error("Could not refund failed batch creation", refundError);
      }
    }

    if (isInsufficientPointsError(error)) {
      return NextResponse.json(
        { error: "You do not have enough points to generate this batch." },
        { status: 402 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create the batch." },
      { status: 500 }
    );
  }
}

function parseSourceType(value: FormDataEntryValue | null): SourceType {
  return value === "uploaded_video" ? "uploaded_video" : "youtube_link";
}

function parseUrls(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map(String).map((url) => url.trim()).filter(Boolean);
    }
  } catch {
    return [];
  }

  return [];
}

function parseFormats(value: FormDataEntryValue | null): OutputFormat[] {
  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((format): format is OutputFormat =>
        SUPPORTED_FORMATS.includes(format as OutputFormat)
      );
    }
  } catch {
    return [];
  }

  return [];
}

function parseRequiredThumbnailCount(value: FormDataEntryValue | null): ThumbnailCountOption {
  const parsed = Number(value);
  return THUMBNAIL_COUNT_OPTIONS.includes(parsed as ThumbnailCountOption)
    ? (parsed as ThumbnailCountOption)
    : 3;
}

function parseOptionalThumbnailCount(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value);
  return THUMBNAIL_COUNT_OPTIONS.includes(parsed as ThumbnailCountOption)
    ? (parsed as ThumbnailCountOption)
    : null;
}

function nullableString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function buildCreatorNotes(input: { thumbnailDirection: string | null; notes: string | null }) {
  const sections = [];

  if (input.thumbnailDirection) {
    sections.push(`Thumbnail direction: ${input.thumbnailDirection}`);
  }

  if (input.notes) {
    sections.push(`Creator notes: ${input.notes}`);
  }

  return sections.length ? sections.join("\n\n") : null;
}
