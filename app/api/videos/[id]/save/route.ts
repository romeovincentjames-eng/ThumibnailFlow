import { NextResponse, type NextRequest } from "next/server";
import { getAuthorizedVideo } from "@/lib/access";
import { getRepository } from "@/lib/repository";

export const runtime = "nodejs";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(_request: NextRequest, { params }: RouteContext) {
  const access = await getAuthorizedVideo(params.id);

  if (!access.video) {
    return NextResponse.json({ error: "Video not found." }, { status: 404 });
  }

  if (!access.authorized) {
    return NextResponse.json({ error: "You do not have access to this video." }, { status: 403 });
  }

  await getRepository().updateVideo(params.id, { saved: true });
  return NextResponse.json({ ok: true });
}
