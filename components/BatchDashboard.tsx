"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Download,
  RefreshCcw,
  Save,
  Trash2,
  Youtube
} from "lucide-react";
import { AppHeader } from "@/components/BatchCreator";
import type { BatchWithVideos, Thumbnail, VideoWithThumbnails } from "@/lib/types";

type BatchDashboardProps = {
  batchId: string;
  initialBatch: BatchWithVideos | null;
};

type YouTubeStatus = {
  configured: boolean;
  connected: boolean;
  expiresAt: number | null;
  scope: string;
  redirectUri: string;
  missingKeys: string[];
};

export function BatchDashboard({ batchId, initialBatch }: BatchDashboardProps) {
  const [batch, setBatch] = useState<BatchWithVideos | null>(initialBatch);
  const [error, setError] = useState<string | null>(null);
  const [processMessage, setProcessMessage] = useState<string | null>(null);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [youtubeStatus, setYouTubeStatus] = useState<YouTubeStatus | null>(null);

  const isRunning = useMemo(() => {
    if (!batch) return true;
    return batch.status === "queued" || batch.status === "running" || batch.videos.some(isVideoRunning);
  }, [batch]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(`/api/batches/${batchId}`, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not load this batch.");
        if (!cancelled) {
          setBatch(result.batch);
          setError(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Could not load this batch.");
        }
      }
    }

    load();
    const interval = window.setInterval(() => {
      if (isRunning) load();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [batchId, isRunning]);

  useEffect(() => {
    refreshYouTubeStatus(setYouTubeStatus);
  }, []);

  const requestedImages = batch?.totalImagesRequested ?? 0;
  const completedImages = batch?.totalImagesCompleted ?? 0;
  const progress = requestedImages ? Math.round((completedImages / requestedImages) * 100) : 0;
  const needsGeneration = Boolean(
    batch &&
      (batch.totalImagesCompleted < batch.totalImagesRequested ||
        batch.videos.some((video) => video.status === "queued" || video.status === "failed"))
  );

  async function runBatchProcessing() {
    setIsProcessingBatch(true);
    setProcessMessage(null);
    setError(null);

    try {
      const response = await fetch(`/api/batches/${batchId}/process`, { method: "POST" });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Could not run generation for this batch.");
      }

      if (result.batch) {
        setBatch(result.batch);
      } else {
        await refreshBatch(batchId, setBatch, setError);
      }

      setProcessMessage("Generation ran again. Check each source below for thumbnails or any specific error.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not run generation for this batch.");
    } finally {
      setIsProcessingBatch(false);
    }
  }

  return (
    <main className="app-shell">
      <AppHeader
        action={
          <Link className="ghost-link" href="/generate">
            <ArrowLeft aria-hidden="true" size={17} />
            New Batch
          </Link>
        }
      />
      <section className="shell-content">
        <div className="workspace-panel">
          <YouTubeConnection
            batchId={batchId}
            status={youtubeStatus}
            onRefresh={() => refreshYouTubeStatus(setYouTubeStatus)}
          />

          <div className="panel-heading">
            <div>
              <h2>{batch?.project?.name ?? "Batch Results"}</h2>
              <p>
                {batch
                  ? `${batch.totalVideos} source${batch.totalVideos === 1 ? "" : "s"}, ${batch.globalThumbnailCount} thumbnail${batch.globalThumbnailCount === 1 ? "" : "s"} per source, ${batch.selectedFormats.join(", ")}`
                  : "Loading batch..."}
              </p>
            </div>
            <span className="status-pill" data-status={batch?.status ?? "running"}>
              {formatStatus(batch?.status ?? "running")}
            </span>
          </div>

          <div className="progress-shell">
            <div className="progress-topline">
              <span>
                {completedImages} of {requestedImages} images generated
              </span>
              <span>{progress}%</span>
            </div>
            <div className="progress-bar" aria-label="Batch image progress">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="progress-topline">
              <span>
                {batch?.processedVideos ?? 0} of {batch?.totalVideos ?? 0} sources processed
              </span>
              <span>{batch?.selectedFormats.join(", ") ?? ""}</span>
            </div>
          </div>

          {needsGeneration ? (
            <div className="batch-recovery-card">
              <div>
                <h3>Generation needs attention</h3>
                <p>
                  This batch has queued or failed sources, or it has not saved all requested thumbnail images yet.
                </p>
              </div>
              <button className="primary-button" disabled={isProcessingBatch} onClick={runBatchProcessing}>
                <RefreshCcw aria-hidden="true" size={17} />
                {isProcessingBatch ? "Running generation" : "Run generation now"}
              </button>
            </div>
          ) : null}

          {processMessage ? <div className="notice-box">{processMessage}</div> : null}
          {error ? <div className="error-box">{error}</div> : null}

          <div className="results-list">
            {batch?.videos.length ? (
              batch.videos.map((video) => (
                <VideoResult
                  key={video.id}
                  video={video}
                  selectedFormats={batch.selectedFormats}
                  youtubeConnected={Boolean(youtubeStatus?.connected)}
                  onRefresh={() => refreshBatch(batchId, setBatch, setError)}
                />
              ))
            ) : (
              <div className="empty-state">Waiting for batch data.</div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function VideoResult({
  video,
  selectedFormats,
  youtubeConnected,
  onRefresh
}: {
  video: VideoWithThumbnails;
  selectedFormats: string[];
  youtubeConnected: boolean;
  onRefresh: () => Promise<void>;
}) {
  const [isBusy, setIsBusy] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const concepts = groupThumbnailsByConcept(video.thumbnails);
  const titleOptions = video.generatedTitleOptions.length
    ? video.generatedTitleOptions
    : video.generatedTitle
      ? [video.generatedTitle]
      : [];
  const sourceLabel =
    video.sourceType === "uploaded_video"
      ? video.uploadedVideoName ?? video.title ?? "Uploaded source file"
      : video.sourceUrl ?? "YouTube link";

  async function runVideoAction(action: "save" | "regenerate" | "delete") {
    setIsBusy(action);
    const method = action === "delete" ? "DELETE" : "POST";
    const url = action === "delete" ? `/api/videos/${video.id}` : `/api/videos/${video.id}/${action}`;

    try {
      await fetch(url, { method });
      await onRefresh();
    } finally {
      setIsBusy(null);
    }
  }

  async function applyToYouTube() {
    setIsBusy("youtube");
    setActionMessage(null);

    try {
      const response = await fetch(`/api/videos/${video.id}/youtube/apply`, { method: "POST" });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Could not apply updates to YouTube.");
      }

      setActionMessage(
        result.result?.thumbnailUpdated
          ? "Applied title, description, and thumbnail to YouTube."
          : "Applied title and description to YouTube."
      );
      await onRefresh();
    } catch (caught) {
      setActionMessage(caught instanceof Error ? caught.message : "Could not apply updates to YouTube.");
    } finally {
      setIsBusy(null);
    }
  }

  async function regenerateConcept(conceptNumber: number) {
    setIsBusy(`concept-${conceptNumber}`);
    try {
      await fetch(`/api/videos/${video.id}/concepts/${conceptNumber}/regenerate`, { method: "POST" });
      await onRefresh();
    } finally {
      setIsBusy(null);
    }
  }

  async function chooseTitle(title: string) {
    setIsBusy(`title-${title}`);
    setActionMessage(null);

    try {
      const response = await fetch(`/api/videos/${video.id}/title`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ title })
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "Could not choose this title.");
      }

      setActionMessage("Selected title updated for YouTube upload.");
      await onRefresh();
    } catch (caught) {
      setActionMessage(caught instanceof Error ? caught.message : "Could not choose this title.");
    } finally {
      setIsBusy(null);
    }
  }

  return (
    <article className="video-panel">
      <div className="video-panel-header">
        <div>
          <h2>{video.generatedTitle ?? video.title ?? "Queued thumbnail source"}</h2>
          {video.sourceUrl ? (
            <a className="source-url" href={video.sourceUrl} target="_blank" rel="noreferrer">
              {sourceLabel}
            </a>
          ) : (
            <span className="source-url">{sourceLabel}</span>
          )}
        </div>
        <span className="status-pill" data-status={video.saved ? "saved" : video.status}>
          {video.saved ? "Saved" : video.statusDetail ?? formatStatus(video.status)}
        </span>
      </div>

      <div className="result-grid">
        <div className="copy-stack">
          <div className="copy-block">
            <h3>Generated Titles</h3>
            {titleOptions.length ? (
              <ol className="title-options-list">
                {titleOptions.map((title, index) => (
                  <li key={`${title}-${index}`}>
                    <span>{index + 1}</span>
                    <div className="title-option-copy">
                      <strong>{title}</strong>
                      {title === video.generatedTitle ? <em>Selected for YouTube</em> : index === 0 ? <em>AI pick</em> : null}
                    </div>
                    {title === video.generatedTitle ? (
                      <span className="selected-title-mark">
                        <Check aria-hidden="true" size={14} />
                      </span>
                    ) : (
                      <button
                        className="secondary-button compact-button"
                        disabled={Boolean(isBusy)}
                        onClick={() => chooseTitle(title)}
                      >
                        Use Title
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p>Title ideas will appear after source and transcript analysis.</p>
            )}
          </div>

          <div className="copy-block">
            <h3>Generated Description</h3>
            <p>{video.generatedDescription ?? video.description ?? "Waiting for source analysis."}</p>
          </div>

          <div className="copy-block">
            <h3>Hashtags</h3>
            <div className="hashtag-row">
              {(video.hashtags.length ? video.hashtags : ["#Queued"]).map((tag) => (
                <span className="format-pill" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="copy-block">
            <h3>Thumbnail Prompt</h3>
            <pre className="prompt-box">{video.thumbnailPrompt ?? "Prompt will appear after source and transcript analysis."}</pre>
          </div>

          {video.errorMessage ? <div className="error-box">{video.errorMessage}</div> : null}
          {actionMessage ? <div className="notice-box">{actionMessage}</div> : null}

          <div className="button-row">
            {video.sourceType === "youtube_link" ? (
              <button
                className="primary-button"
                disabled={
                  Boolean(isBusy) ||
                  !youtubeConnected ||
                  !video.generatedTitle ||
                  !video.generatedDescription
                }
                onClick={applyToYouTube}
                title={
                  youtubeConnected
                    ? "Apply selected title, description, and best thumbnail to YouTube"
                    : "Connect YouTube first"
                }
              >
                <Youtube aria-hidden="true" size={17} />
                Apply to YouTube
              </button>
            ) : null}
            <button className="secondary-button" disabled={Boolean(isBusy)} onClick={() => runVideoAction("save")}>
              <Save aria-hidden="true" size={17} />
              Save Thumbnail Set
            </button>
            <button className="secondary-button" disabled={Boolean(isBusy)} onClick={() => runVideoAction("regenerate")}>
              <RefreshCcw aria-hidden="true" size={17} />
              Regenerate All
            </button>
            <button className="danger-button" disabled={Boolean(isBusy)} onClick={() => runVideoAction("delete")}>
              <Trash2 aria-hidden="true" size={17} />
              Delete Source
            </button>
          </div>
        </div>

        <div className="concept-stack">
          {concepts.length ? (
            concepts.map((concept) => (
              <section className="concept-panel" key={concept.conceptNumber}>
                <div className="concept-header">
                  <h3>Concept {concept.conceptNumber}</h3>
                  <button
                    className="secondary-button compact-button"
                    disabled={Boolean(isBusy)}
                    onClick={() => regenerateConcept(concept.conceptNumber)}
                  >
                    <RefreshCcw aria-hidden="true" size={15} />
                    Regenerate Concept
                  </button>
                </div>
                <div className="thumbnail-grid">
                  {concept.thumbnails.map((thumbnail) => (
                    <ThumbnailFrame key={thumbnail.id} thumbnail={thumbnail} onRefresh={onRefresh} />
                  ))}
                  {selectedFormats.length > concept.thumbnails.length ? (
                    <div className="empty-state">Waiting for remaining formats.</div>
                  ) : null}
                </div>
              </section>
            ))
          ) : (
            <div className="empty-state">{isVideoRunning(video) ? "Generating thumbnail images." : "No thumbnails yet."}</div>
          )}
        </div>
      </div>
    </article>
  );
}

function YouTubeConnection({
  batchId,
  status,
  onRefresh
}: {
  batchId: string;
  status: YouTubeStatus | null;
  onRefresh: () => Promise<void>;
}) {
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const connectHref = `/api/youtube/oauth/start?returnTo=${encodeURIComponent(`/batches/${batchId}`)}`;

  async function disconnect() {
    setIsDisconnecting(true);

    try {
      await fetch("/api/youtube/disconnect", { method: "POST" });
      await onRefresh();
    } finally {
      setIsDisconnecting(false);
    }
  }

  return (
    <div className="youtube-connect-card">
      <div className="youtube-connect-copy">
        <span className="feature-icon youtube-icon">
          <Youtube aria-hidden="true" size={21} />
        </span>
        <div>
          <h2>YouTube Publishing</h2>
          <p>
            {!status?.configured
              ? "Add the Google OAuth keys to enable YouTube connection and publishing."
              : status.connected
              ? "Connected. You can apply generated titles, descriptions, and thumbnails to source videos."
              : "Connect YouTube to publish generated title, description, and thumbnail updates."}
          </p>
          {!status?.configured ? (
            <div className="youtube-setup-panel">
              <strong>Required Vercel environment variables</strong>
              <code>GOOGLE_CLIENT_ID</code>
              <code>GOOGLE_CLIENT_SECRET</code>
              <code>YOUTUBE_REDIRECT_URI={status?.redirectUri || "https://thumibnail-flow.vercel.app/api/youtube/oauth/callback"}</code>
              <span>
                Add this redirect URL to your Google OAuth Web Client, then redeploy Vercel. The Connect
                YouTube button will appear here after the keys are live.
              </span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="button-row">
        {!status?.configured ? (
          <span className="status-pill" data-status="failed">
            {(status?.missingKeys?.length ? status.missingKeys.join(", ") : "Google keys")} missing
          </span>
        ) : status.connected ? (
          <>
            <span className="status-pill" data-status="completed">Connected</span>
            <button className="secondary-button compact-button" disabled={isDisconnecting} onClick={disconnect}>
              Disconnect
            </button>
          </>
        ) : (
          <a className="primary-button" href={connectHref}>
            <Youtube aria-hidden="true" size={17} />
            Connect YouTube
          </a>
        )}
      </div>
    </div>
  );
}

function ThumbnailFrame({
  thumbnail,
  onRefresh
}: {
  thumbnail: Thumbnail;
  onRefresh: () => Promise<void>;
}) {
  const [isBusy, setIsBusy] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  async function runThumbnailAction(action: "save" | "regenerate" | "delete") {
    setIsBusy(action);
    setActionMessage(null);
    const method = action === "delete" ? "DELETE" : "POST";
    const url = action === "delete" ? `/api/thumbnails/${thumbnail.id}` : `/api/thumbnails/${thumbnail.id}/${action}`;

    try {
      const response = await fetch(url, { method });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.error ?? `Could not ${action} this thumbnail.`);
      }

      if (action === "save") {
        setActionMessage("Photo saved.");
      } else if (action === "regenerate") {
        setActionMessage("Regeneration started.");
      }

      await onRefresh();
    } catch (caught) {
      setActionMessage(caught instanceof Error ? caught.message : `Could not ${action} this thumbnail.`);
    } finally {
      setIsBusy(null);
    }
  }

  return (
    <figure className="thumbnail-frame">
      <div className="thumbnail-image-wrap" data-format={thumbnail.format}>
        <Image
          src={thumbnail.publicUrl}
          alt={`${thumbnail.format} concept ${thumbnail.conceptNumber} generated thumbnail`}
          fill
          sizes="(max-width: 720px) 100vw, 360px"
          unoptimized
        />
      </div>
      <figcaption className="thumbnail-meta">
        <span>{thumbnail.format}</span>
        <span>
          {thumbnail.width}x{thumbnail.height}
        </span>
      </figcaption>
      <div className="thumbnail-actions">
        <button
          className="secondary-button thumbnail-action-button"
          disabled={Boolean(isBusy)}
          title={thumbnail.saved ? "Saved" : "Save"}
          aria-label={thumbnail.saved ? "Saved" : "Save"}
          onClick={() => runThumbnailAction("save")}
        >
          {thumbnail.saved ? <Check aria-hidden="true" size={15} /> : <Save aria-hidden="true" size={15} />}
          {thumbnail.saved ? "Saved" : "Save Photo"}
        </button>
        <a
          className="secondary-button thumbnail-action-button"
          href={thumbnail.publicUrl}
          download
          title="Download"
          aria-label="Download"
        >
          <Download aria-hidden="true" size={15} />
          Download
        </a>
        <button
          className="secondary-button thumbnail-action-button"
          disabled={Boolean(isBusy)}
          title="Regenerate this image"
          aria-label="Regenerate this image"
          onClick={() => runThumbnailAction("regenerate")}
        >
          <RefreshCcw aria-hidden="true" size={15} />
          Regenerate
        </button>
        <button
          className="danger-button thumbnail-action-button"
          disabled={Boolean(isBusy)}
          title="Delete"
          aria-label="Delete thumbnail"
          onClick={() => runThumbnailAction("delete")}
        >
          <Trash2 aria-hidden="true" size={15} />
          Delete
        </button>
      </div>
      {actionMessage ? <div className="thumbnail-action-message">{actionMessage}</div> : null}
    </figure>
  );
}

async function refreshBatch(
  batchId: string,
  setBatch: (batch: BatchWithVideos) => void,
  setError: (error: string | null) => void
) {
  try {
    const response = await fetch(`/api/batches/${batchId}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not load this batch.");
    setBatch(result.batch);
    setError(null);
  } catch (caught) {
    setError(caught instanceof Error ? caught.message : "Could not load this batch.");
  }
}

async function refreshYouTubeStatus(setStatus: (status: YouTubeStatus) => void) {
  try {
    const response = await fetch("/api/youtube/status", { cache: "no-store" });
    const result = await response.json();
    setStatus(result);
  } catch {
    setStatus({ configured: false, connected: false, expiresAt: null, scope: "", redirectUri: "", missingKeys: [] });
  }
}

function groupThumbnailsByConcept(thumbnails: Thumbnail[]) {
  const groups = new Map<number, Thumbnail[]>();

  for (const thumbnail of thumbnails) {
    groups.set(thumbnail.conceptNumber, [...(groups.get(thumbnail.conceptNumber) ?? []), thumbnail]);
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a - b)
    .map(([conceptNumber, items]) => ({
      conceptNumber,
      thumbnails: [...items].sort((a, b) => a.format.localeCompare(b.format))
    }));
}

function isVideoRunning(video: VideoWithThumbnails) {
  return [
    "queued",
    "analyzing",
    "analyzing_video",
    "writing_prompt",
    "generating_prompt",
    "generating_thumbnails"
  ].includes(video.status);
}

function formatStatus(status: string) {
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
