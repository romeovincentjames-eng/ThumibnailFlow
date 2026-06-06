# ThumbnailFlow Batch

A Next.js batch workflow for generating YouTube thumbnail packages from up to 10 URLs at a time.

## What It Includes

- Batch creation page with up to 10 YouTube URLs
- Uploaded-video batches with manual title, description, transcript, and notes
- Global reference image upload
- Optional per-video reference images, notes, and transcript input
- Global thumbnail count with optional per-video overrides: `1`, `2`, `3`, `5`, or `10`
- Output format selection: `16:9`, `1:1`, `9:16`, `4:5`
- Image-count estimate and 200-image safety limit
- Results dashboard with image progress, statuses, generated copy, prompts, concepts, and thumbnail formats
- API routes for creating batches, polling progress, saving, regenerating, deleting
- Inngest handler for background processing
- Supabase database/storage integration with a local in-memory demo fallback
- OpenAI text and image generation integration with local placeholder fallback

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `.env.example` to `.env.local` and fill in the keys you want to use.

3. Create Supabase tables and the `thumbnails` storage bucket by running `supabase/schema.sql` in the Supabase SQL editor.

4. Start the app:

```bash
npm run dev
```

5. Open `http://localhost:3000`.

## Background Jobs

The app exposes an Inngest endpoint at:

```text
/api/inngest
```

With `INNGEST_DEV=1`, events are sent through Inngest dev tooling when available. If Inngest enqueueing is unavailable, the app falls back to a local background processor so the demo workflow still runs.

## Production Notes

- Use `SUPABASE_SERVICE_ROLE_KEY` only on the server.
- Keep the `thumbnails` bucket public if you want generated image URLs to render directly in the dashboard.
- Add `YOUTUBE_API_KEY` to get full video descriptions from the YouTube Data API; otherwise the app tries YouTube oEmbed and then falls back to URL-derived metadata.
- `OPENAI_IMAGE_MODEL` defaults to `gpt-image-1.5`; `OPENAI_TEXT_MODEL` defaults to `gpt-4.1-mini`.
- Each generated thumbnail row stores the batch, video, concept number, format, prompt, storage path, and status.
# ThumibnailFlow
