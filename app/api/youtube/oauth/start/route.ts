import { NextResponse, type NextRequest } from "next/server";
import { createYouTubeOAuthStart, setYouTubeStateCookie } from "@/lib/youtubeOAuth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const returnTo = request.nextUrl.searchParams.get("returnTo") ?? "/generate";
    const start = createYouTubeOAuthStart(returnTo);
    const response = NextResponse.redirect(start.url);
    setYouTubeStateCookie(response, start.stateCookie);
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not start YouTube connection." },
      { status: 400 }
    );
  }
}
