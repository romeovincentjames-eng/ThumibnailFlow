import { NextResponse, type NextRequest } from "next/server";
import { getAuthorizedVideo } from "@/lib/access";
import { enqueueVideoRegeneration } from "@/lib/jobs/queue";
import { estimateVideoPoints, isInsufficientPointsError } from "@/lib/points";
import { getRepository } from "@/lib/repository";

export const runtime = "nodejs";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(_request: NextRequest, { params }: RouteContext) {
  try {
    const repository = getRepository();
    const access = await getAuthorizedVideo(params.id);
    const video = access.video;

    if (!video) {
      return NextResponse.json({ error: "Thumbnail source not found." }, { status: 404 });
    }

    if (!access.authorized) {
      return NextResponse.json({ error: "You do not have access to this thumbnail source." }, { status: 403 });
    }

    const batch = access.batch;
    if (!batch) {
      return NextResponse.json({ error: "Batch not found." }, { status: 404 });
    }

    const account = access.account;

    const thumbnailCount = video.perVideoThumbnailCount ?? batch.globalThumbnailCount;
    const pointsRequired = estimateVideoPoints({
      thumbnailCount,
      formatCount: batch.selectedFormats.length
    });

    if (account.pointsBalance < pointsRequired) {
      return NextResponse.json(
        {
          error: `Regenerating this thumbnail source needs ${pointsRequired} points. You have ${account.pointsBalance} points.`,
          pointsRequired,
          pointsBalance: account.pointsBalance
        },
        { status: 402 }
      );
    }

    const reservationReference = `video:${video.id}:regenerate:${crypto.randomUUID()}`;
    await repository.applyPointsDelta({
      accountId: account.id,
      delta: -pointsRequired,
      reason: "video_regenerate_reserve",
      reference: reservationReference,
      metadata: {
        videoId: video.id,
        thumbnailCount,
        formatCount: batch.selectedFormats.length
      }
    });

    await repository.updateVideo(params.id, {
      status: "queued",
      statusDetail: "Queued for regeneration",
      errorMessage: null,
      saved: false
    });
    await enqueueVideoRegeneration(params.id, {
      accountId: account.id,
      reservedPoints: pointsRequired,
      reservationReference,
      refundReference: `${reservationReference}:refund`
    });

    return NextResponse.json({ ok: true, pointsReserved: pointsRequired });
  } catch (error) {
    if (isInsufficientPointsError(error)) {
      return NextResponse.json({ error: "You do not have enough points to regenerate this thumbnail source." }, { status: 402 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not regenerate this thumbnail source." },
      { status: 400 }
    );
  }
}
