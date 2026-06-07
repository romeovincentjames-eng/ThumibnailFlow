import { NextResponse, type NextRequest } from "next/server";
import { getAuthorizedVideo } from "@/lib/access";
import { getRepository } from "@/lib/repository";

export const runtime = "nodejs";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(request: NextRequest, { params }: RouteContext) {
  const access = await getAuthorizedVideo(params.id);

  if (!access.video) {
    return NextResponse.json({ error: "Video not found." }, { status: 404 });
  }

  if (!access.authorized) {
    return NextResponse.json({ error: "You do not have access to this video." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const selectedTitle = typeof body?.title === "string" ? body.title.trim().slice(0, 100) : "";

  if (!selectedTitle) {
    return NextResponse.json({ error: "Choose a title first." }, { status: 400 });
  }

  const allowedTitles = access.video.generatedTitleOptions.length
    ? access.video.generatedTitleOptions
    : access.video.generatedTitle
      ? [access.video.generatedTitle]
      : [];

  if (!allowedTitles.includes(selectedTitle)) {
    return NextResponse.json({ error: "Choose one of the generated title options." }, { status: 400 });
  }

  const video = await getRepository().updateVideo(params.id, {
    generatedTitle: selectedTitle
  });

  return NextResponse.json({ ok: true, video });
}
