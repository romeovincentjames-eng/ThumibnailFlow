import { NextResponse } from "next/server";
import { clearYouTubeTokenCookie } from "@/lib/youtubeOAuth";

export const runtime = "nodejs";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearYouTubeTokenCookie(response);
  return response;
}
