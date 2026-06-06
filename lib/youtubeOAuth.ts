import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { getEnv, getYouTubeRedirectUri, hasYouTubeOAuthConfig } from "@/lib/env";

export const YOUTUBE_OAUTH_SCOPES = ["https://www.googleapis.com/auth/youtube.force-ssl"];

const TOKEN_COOKIE = "thumbnailflow_youtube_tokens";
const STATE_COOKIE = "thumbnailflow_youtube_state";
const TOKEN_MARGIN_MS = 60_000;

type YouTubeTokenResponse = {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
};

export type YouTubeTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  scope: string;
  tokenType: string;
};

type OAuthState = {
  state: string;
  returnTo: string;
  createdAt: number;
};

export function getYouTubeOAuthStatus() {
  const tokens = readYouTubeTokens();
  return {
    configured: hasYouTubeOAuthConfig(),
    connected: Boolean(tokens?.accessToken || tokens?.refreshToken),
    expiresAt: tokens?.expiresAt ?? null,
    scope: tokens?.scope ?? YOUTUBE_OAUTH_SCOPES.join(" ")
  };
}

export function createYouTubeOAuthStart(returnTo: string) {
  if (!hasYouTubeOAuthConfig()) {
    throw new Error("Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local first.");
  }

  const state = randomBytes(24).toString("base64url");
  const safeReturnTo = returnTo.startsWith("/") ? returnTo : "/generate";
  const oauthState: OAuthState = { state, returnTo: safeReturnTo, createdAt: Date.now() };
  const stateToken = encryptJson(oauthState);
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");

  url.searchParams.set("client_id", getEnv("GOOGLE_CLIENT_ID"));
  url.searchParams.set("redirect_uri", getYouTubeRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", YOUTUBE_OAUTH_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", stateToken);

  return {
    url,
    stateCookie: stateToken
  };
}

export function setYouTubeStateCookie(response: NextResponse, value: string) {
  response.cookies.set(STATE_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 10 * 60,
    path: "/"
  });
}

export function clearYouTubeStateCookie(response: NextResponse) {
  response.cookies.set(STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/"
  });
}

export function validateYouTubeOAuthState(value: string | null) {
  const stateFromToken = value ? decryptJson<OAuthState>(value) : null;
  if (stateFromToken && Date.now() - stateFromToken.createdAt <= 10 * 60 * 1000) {
    return stateFromToken.returnTo;
  }

  const stored = cookies().get(STATE_COOKIE)?.value;
  const state = stored ? decodeJson<OAuthState>(stored) ?? decryptJson<OAuthState>(stored) : null;

  if (!value || !state || value !== state.state) {
    throw new Error("YouTube connection state did not match. Please try connecting again.");
  }

  return state.returnTo;
}

export async function exchangeYouTubeOAuthCode(code: string) {
  const existing = readYouTubeTokens();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getEnv("GOOGLE_CLIENT_ID"),
      client_secret: getEnv("GOOGLE_CLIENT_SECRET"),
      code,
      grant_type: "authorization_code",
      redirect_uri: getYouTubeRedirectUri()
    })
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error_description ?? payload.error ?? "Could not connect YouTube.");
  }

  return normalizeTokenResponse(payload, existing?.refreshToken ?? null);
}

export async function getValidYouTubeTokens() {
  const tokens = readYouTubeTokens();

  if (!tokens) {
    throw new Error("Connect YouTube before applying updates.");
  }

  if (tokens.expiresAt > Date.now() + TOKEN_MARGIN_MS) {
    return { tokens, refreshed: false };
  }

  if (!tokens.refreshToken) {
    throw new Error("The YouTube connection expired. Please connect YouTube again.");
  }

  const refreshed = await refreshYouTubeTokens(tokens.refreshToken);
  return { tokens: refreshed, refreshed: true };
}

export function setYouTubeTokenCookie(response: NextResponse, tokens: YouTubeTokens) {
  response.cookies.set(TOKEN_COOKIE, encryptJson(tokens), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/"
  });
}

export function clearYouTubeTokenCookie(response: NextResponse) {
  response.cookies.set(TOKEN_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/"
  });
}

function readYouTubeTokens() {
  const value = cookies().get(TOKEN_COOKIE)?.value;
  if (!value) return null;
  return decryptJson<YouTubeTokens>(value);
}

async function refreshYouTubeTokens(refreshToken: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getEnv("GOOGLE_CLIENT_ID"),
      client_secret: getEnv("GOOGLE_CLIENT_SECRET"),
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error_description ?? payload.error ?? "Could not refresh YouTube access.");
  }

  return normalizeTokenResponse(payload, refreshToken);
}

function normalizeTokenResponse(payload: YouTubeTokenResponse, existingRefreshToken: string | null): YouTubeTokens {
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? existingRefreshToken,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
    scope: payload.scope ?? YOUTUBE_OAUTH_SCOPES.join(" "),
    tokenType: payload.token_type ?? "Bearer"
  };
}

function encryptionKey() {
  const secret = getEnv("GOOGLE_CLIENT_SECRET");
  if (!secret) {
    throw new Error("GOOGLE_CLIENT_SECRET is required before storing YouTube tokens.");
  }

  return createHash("sha256").update(secret).digest();
}

function encryptJson(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

function decryptJson<T>(value: string) {
  try {
    const raw = Buffer.from(value, "base64url");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8")) as T;
  } catch {
    return null;
  }
}

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeJson<T>(value: string) {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
