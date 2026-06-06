import { NextResponse, type NextRequest } from "next/server";
import {
  clearYouTubeStateCookie,
  exchangeYouTubeOAuthCode,
  setYouTubeTokenCookie,
  validateYouTubeOAuthState
} from "@/lib/youtubeOAuth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  try {
    if (error) {
      throw new Error(error);
    }

    if (!code) {
      throw new Error("Google did not return an OAuth code.");
    }

    const returnTo = validateYouTubeOAuthState(state);
    const tokens = await exchangeYouTubeOAuthCode(code);
    const redirectUrl = new URL(returnTo, request.nextUrl.origin);
    redirectUrl.searchParams.set("youtube", "connected");

    const response = NextResponse.redirect(redirectUrl);
    setYouTubeTokenCookie(response, tokens);
    clearYouTubeStateCookie(response);
    return response;
  } catch (caught) {
    const redirectUrl = new URL("/generate", request.nextUrl.origin);
    redirectUrl.searchParams.set("youtube", "error");
    redirectUrl.searchParams.set(
      "message",
      caught instanceof Error ? caught.message : "Could not connect YouTube."
    );

    const response = NextResponse.redirect(redirectUrl);
    clearYouTubeStateCookie(response);
    return response;
  }
}
