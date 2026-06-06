import { NextResponse } from "next/server";
import { getYouTubeOAuthStatus } from "@/lib/youtubeOAuth";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getYouTubeOAuthStatus());
}
