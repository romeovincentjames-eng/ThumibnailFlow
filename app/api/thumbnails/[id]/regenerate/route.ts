import { NextResponse, type NextRequest } from "next/server";
import { getAuthorizedThumbnail } from "@/lib/access";
import { enqueueThumbnailRegeneration } from "@/lib/jobs/queue";
import { estimateThumbnailPoints, isInsufficientPointsError } from "@/lib/points";
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
    const access = await getAuthorizedThumbnail(params.id);
    const thumbnail = access.thumbnail;
    if (!thumbnail) {
      return NextResponse.json({ error: "Thumbnail not found." }, { status: 404 });
    }

    if (!access.authorized) {
      return NextResponse.json({ error: "You do not have access to this thumbnail." }, { status: 403 });
    }

    const batch = access.batch;
    if (!batch) {
      return NextResponse.json({ error: "Batch not found." }, { status: 404 });
    }

    const account = access.account;

    const pointsRequired = estimateThumbnailPoints();
    if (account.pointsBalance < pointsRequired) {
      return NextResponse.json(
        {
          error: `Regenerating this image needs ${pointsRequired} points. You have ${account.pointsBalance} points.`,
          pointsRequired,
          pointsBalance: account.pointsBalance
        },
        { status: 402 }
      );
    }

    const reservationReference = `thumbnail:${thumbnail.id}:regenerate:${crypto.randomUUID()}`;
    await repository.applyPointsDelta({
      accountId: account.id,
      delta: -pointsRequired,
      reason: "thumbnail_regenerate_reserve",
      reference: reservationReference,
      metadata: {
        thumbnailId: thumbnail.id,
        videoId: thumbnail.videoId,
        format: thumbnail.format
      }
    });

    await enqueueThumbnailRegeneration(params.id, {
      accountId: account.id,
      reservedPoints: pointsRequired,
      reservationReference,
      refundReference: `${reservationReference}:refund`
    });
    return NextResponse.json({ ok: true, pointsReserved: pointsRequired });
  } catch (error) {
    if (isInsufficientPointsError(error)) {
      return NextResponse.json({ error: "You do not have enough points to regenerate this image." }, { status: 402 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not regenerate this image." },
      { status: 400 }
    );
  }
}
