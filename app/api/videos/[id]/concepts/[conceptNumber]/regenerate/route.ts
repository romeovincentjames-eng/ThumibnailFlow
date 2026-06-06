import { NextResponse, type NextRequest } from "next/server";
import { getAuthorizedVideo } from "@/lib/access";
import { enqueueConceptRegeneration } from "@/lib/jobs/queue";
import { estimateConceptPoints, isInsufficientPointsError } from "@/lib/points";
import { getRepository } from "@/lib/repository";

export const runtime = "nodejs";

type RouteContext = {
  params: {
    id: string;
    conceptNumber: string;
  };
};

export async function POST(_request: NextRequest, { params }: RouteContext) {
  try {
    const conceptNumber = Number(params.conceptNumber);

    if (!Number.isInteger(conceptNumber) || conceptNumber < 1 || conceptNumber > 10) {
      return NextResponse.json({ error: "Concept number must be between 1 and 10." }, { status: 400 });
    }

    const repository = getRepository();
    const access = await getAuthorizedVideo(params.id);
    const video = access.video;
    if (!video) {
      return NextResponse.json({ error: "Video not found." }, { status: 404 });
    }

    if (!access.authorized) {
      return NextResponse.json({ error: "You do not have access to this video." }, { status: 403 });
    }

    const batch = access.batch;
    if (!batch) {
      return NextResponse.json({ error: "Batch not found." }, { status: 404 });
    }

    const thumbnailCount = video.perVideoThumbnailCount ?? batch.globalThumbnailCount;
    if (conceptNumber > thumbnailCount) {
      return NextResponse.json({ error: "That concept does not exist for this video." }, { status: 400 });
    }

    const account = access.account;

    const pointsRequired = estimateConceptPoints(batch.selectedFormats);
    if (account.pointsBalance < pointsRequired) {
      return NextResponse.json(
        {
          error: `Regenerating this concept needs ${pointsRequired} points. You have ${account.pointsBalance} points.`,
          pointsRequired,
          pointsBalance: account.pointsBalance
        },
        { status: 402 }
      );
    }

    const reservationReference = `concept:${video.id}:${conceptNumber}:${crypto.randomUUID()}`;
    await repository.applyPointsDelta({
      accountId: account.id,
      delta: -pointsRequired,
      reason: "concept_regenerate_reserve",
      reference: reservationReference,
      metadata: {
        videoId: video.id,
        conceptNumber,
        formatCount: batch.selectedFormats.length
      }
    });

    await enqueueConceptRegeneration(params.id, conceptNumber, {
      accountId: account.id,
      reservedPoints: pointsRequired,
      reservationReference,
      refundReference: `${reservationReference}:refund`
    });
    return NextResponse.json({ ok: true, pointsReserved: pointsRequired });
  } catch (error) {
    if (isInsufficientPointsError(error)) {
      return NextResponse.json({ error: "You do not have enough points to regenerate this concept." }, { status: 402 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not regenerate this concept." },
      { status: 400 }
    );
  }
}
