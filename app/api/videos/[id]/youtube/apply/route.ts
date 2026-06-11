import { NextResponse } from "next/server";
import { getAuthorizedVideo } from "@/lib/access";
import { POINT_COSTS, isInsufficientPointsError } from "@/lib/points";
import { getRepository } from "@/lib/repository";
import { applyVideoToYouTube } from "@/lib/youtubePublish";
import { getValidYouTubeTokens, setYouTubeTokenCookie } from "@/lib/youtubeOAuth";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  let reservation:
    | {
        accountId: string;
        points: number;
        reference: string;
      }
    | null = null;

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

    if (video.sourceType !== "youtube_link") {
      return NextResponse.json(
        { error: "Only YouTube URL sources can be applied back to YouTube." },
        { status: 400 }
      );
    }

    const batch = await repository.getBatch(video.batchJobId);
    const videoWithThumbnails = batch?.videos.find((item) => item.id === video.id);

    if (!batch || !videoWithThumbnails) {
      return NextResponse.json({ error: "Video results were not found." }, { status: 404 });
    }

    const account = access.account;
    const body = await request.json().catch(() => null);
    const selectedThumbnailId = typeof body?.thumbnailId === "string" ? body.thumbnailId.trim() : "";

    if (selectedThumbnailId) {
      const selectedThumbnail = videoWithThumbnails.thumbnails.find((thumbnail) => thumbnail.id === selectedThumbnailId);

      if (!selectedThumbnail || selectedThumbnail.status !== "generated") {
        return NextResponse.json(
          { error: "Choose one generated thumbnail photo before uploading to YouTube." },
          { status: 400 }
        );
      }
    }

    if (account.pointsBalance < POINT_COSTS.youtubeApply) {
      return NextResponse.json(
        {
          error: `Applying to YouTube needs ${POINT_COSTS.youtubeApply} points. You have ${account.pointsBalance} points.`,
          pointsRequired: POINT_COSTS.youtubeApply,
          pointsBalance: account.pointsBalance
        },
        { status: 402 }
      );
    }

    const reservationReference = `youtube:${video.id}:apply:${crypto.randomUUID()}`;
    await repository.applyPointsDelta({
      accountId: account.id,
      delta: -POINT_COSTS.youtubeApply,
      reason: "youtube_apply",
      reference: reservationReference,
      metadata: {
        videoId: video.id,
        sourceUrl: video.sourceUrl
      }
    });
    reservation = {
      accountId: account.id,
      points: POINT_COSTS.youtubeApply,
      reference: reservationReference
    };

    const { tokens, refreshed } = await getValidYouTubeTokens();
    const result = await applyVideoToYouTube({
      video: videoWithThumbnails,
      accessToken: tokens.accessToken,
      thumbnailId: selectedThumbnailId || null
    });

    await repository.updateVideo(video.id, {
      saved: true,
      statusDetail: result.thumbnailUpdated ? "Applied to YouTube" : "Title and description applied to YouTube"
    });

    const response = NextResponse.json({ ok: true, result });

    if (refreshed) {
      setYouTubeTokenCookie(response, tokens);
    }

    return response;
  } catch (error) {
    if (reservation) {
      try {
        await getRepository().applyPointsDelta({
          accountId: reservation.accountId,
          delta: reservation.points,
          reason: "youtube_apply_refund",
          reference: `${reservation.reference}:refund`,
          metadata: {
            reservationReference: reservation.reference
          }
        });
      } catch (refundError) {
        console.error("Could not refund failed YouTube apply", refundError);
      }
    }

    if (isInsufficientPointsError(error)) {
      return NextResponse.json({ error: "You do not have enough points to apply this source to YouTube." }, { status: 402 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not apply updates to YouTube." },
      { status: 400 }
    );
  }
}
