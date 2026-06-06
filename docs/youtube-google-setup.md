# Google/YouTube Setup

Use the same Google Cloud project that has the YouTube Data API v3 enabled.

## 1. Enable YouTube Data API v3

1. Open Google Cloud Console.
2. Select your project.
3. Go to APIs & Services > Library.
4. Search for YouTube Data API v3.
5. Click Enable.

## 2. Create OAuth Consent Screen

1. Go to APIs & Services > OAuth consent screen.
2. Choose External unless this is only for a Google Workspace organization.
3. Add app name, user support email, and developer contact email.
4. Add yourself as a test user while the app is in testing mode.
5. Save.

## 3. Create OAuth Web Client

1. Go to APIs & Services > Credentials.
2. Create Credentials > OAuth client ID.
3. Application type: Web application.
4. Add this Authorized redirect URI:

```text
http://localhost:3000/api/youtube/oauth/callback
```

5. Copy the Client ID and Client Secret.

## 4. Add Local Environment Values

Add or fill these values in `.env.local`:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
YOUTUBE_REDIRECT_URI=http://localhost:3000/api/youtube/oauth/callback
```

Restart the local server after changing `.env.local`.

## 5. Connect From ThumbnailFlow

1. Open a generated batch results page.
2. Click Connect YouTube.
3. Sign in with the YouTube channel owner account.
4. Approve access.
5. Use Apply to YouTube on a generated video result.

The app updates the source YouTube video's generated title and description, then uploads the best generated `16:9` thumbnail if one exists.
