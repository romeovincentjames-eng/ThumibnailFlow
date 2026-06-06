"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Film,
  Gauge,
  ImagePlus,
  Layers3,
  Link as LinkIcon,
  Loader2,
  Play,
  Rocket,
  Sparkles,
  UploadCloud
} from "lucide-react";
import {
  MAX_IMAGES_PER_BATCH,
  MAX_VIDEOS_PER_BATCH,
  SUPPORTED_FORMATS,
  THUMBNAIL_COUNT_OPTIONS,
  type OutputFormat,
  type SourceType,
  type ThumbnailCountOption
} from "@/lib/types";

const starterText = [
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "https://youtu.be/aqz-KE-bpKQ"
].join("\n");

type BillingStatus = {
  account: {
    pointsBalance: number;
    planKey: string;
  };
  pointCosts: {
    creativePackPerVideo: number;
    thumbnailImage: number;
    youtubeApply: number;
    clippingAnalyzer: number;
  };
  stripeConfigured: boolean;
};

export function BatchCreator() {
  const router = useRouter();
  const [projectName, setProjectName] = useState("Thumbnail batch");
  const [sourceType, setSourceType] = useState<SourceType>("youtube_link");
  const [urlsText, setUrlsText] = useState(starterText);
  const [uploadedVideos, setUploadedVideos] = useState<File[]>([]);
  const [globalThumbnailCount, setGlobalThumbnailCount] = useState<ThumbnailCountOption>(3);
  const [formats, setFormats] = useState<OutputFormat[]>(["16:9"]);
  const [globalReference, setGlobalReference] = useState<File | null>(null);
  const [globalThumbnailDirection, setGlobalThumbnailDirection] = useState("");
  const [references, setReferences] = useState<Record<number, File | null>>({});
  const [thumbnailDirections, setThumbnailDirections] = useState<Record<number, string>>({});
  const [thumbnailOverrides, setThumbnailOverrides] = useState<Record<number, string>>({});
  const [titles, setTitles] = useState<Record<number, string>>({});
  const [descriptions, setDescriptions] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [transcripts, setTranscripts] = useState<Record<number, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);

  const parsedUrls = useMemo(() => parseUrlText(urlsText), [urlsText]);
  const visibleUrls = parsedUrls.slice(0, MAX_VIDEOS_PER_BATCH);
  const visibleUploads = uploadedVideos.slice(0, MAX_VIDEOS_PER_BATCH);
  const videoCount = sourceType === "youtube_link" ? visibleUrls.length : visibleUploads.length;
  const extraCount =
    sourceType === "youtube_link"
      ? Math.max(0, parsedUrls.length - MAX_VIDEOS_PER_BATCH)
      : Math.max(0, uploadedVideos.length - MAX_VIDEOS_PER_BATCH);
  const tooManySources =
    sourceType === "youtube_link"
      ? parsedUrls.length > MAX_VIDEOS_PER_BATCH
      : uploadedVideos.length > MAX_VIDEOS_PER_BATCH;
  const rowIndexes = Array.from({ length: videoCount }, (_item, index) => index);
  const totalImages = rowIndexes.reduce(
    (total, index) => total + getRowThumbnailCount(index) * formats.length,
    0
  );
  const mixedCounts = rowIndexes.some((index) => getOverrideCount(index) !== null);
  const estimateText = mixedCounts
    ? `${videoCount} videos × mixed thumbnail counts × ${formats.length} formats = ${totalImages} images`
    : `${videoCount} videos × ${globalThumbnailCount} thumbnails × ${formats.length} formats = ${totalImages} images`;
  const estimateError =
    totalImages > MAX_IMAGES_PER_BATCH
      ? `This batch would generate ${totalImages} images. Reduce thumbnails or formats to stay at ${MAX_IMAGES_PER_BATCH} or fewer.`
      : null;
  const pointCosts = billing?.pointCosts ?? {
    creativePackPerVideo: 2,
    thumbnailImage: 10,
    youtubeApply: 5,
    clippingAnalyzer: 20
  };
  const requiredPoints = videoCount * pointCosts.creativePackPerVideo + totalImages * pointCosts.thumbnailImage;
  const pointsBalance = billing?.account.pointsBalance ?? 0;
  const hasEnoughPoints = Boolean(billing) && pointsBalance >= requiredPoints;
  const canSubmit =
    videoCount > 0 &&
    formats.length > 0 &&
    !tooManySources &&
    totalImages <= MAX_IMAGES_PER_BATCH &&
    Boolean(billing) &&
    hasEnoughPoints &&
    !isSubmitting;

  useEffect(() => {
    let cancelled = false;

    async function loadBilling() {
      try {
        const response = await fetch("/api/billing/account", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not load billing.");
        if (!cancelled) {
          setBilling(result);
          setBillingError(null);
        }
      } catch (caught) {
        if (!cancelled) {
          setBillingError(caught instanceof Error ? caught.message : "Could not load billing.");
        }
      }
    }

    loadBilling();

    return () => {
      cancelled = true;
    };
  }, []);

  function getOverrideCount(index: number) {
    const value = thumbnailOverrides[index];
    if (!value) return null;
    const parsed = Number(value);
    return THUMBNAIL_COUNT_OPTIONS.includes(parsed as ThumbnailCountOption)
      ? (parsed as ThumbnailCountOption)
      : null;
  }

  function getRowThumbnailCount(index: number) {
    return getOverrideCount(index) ?? globalThumbnailCount;
  }

  function toggleFormat(format: OutputFormat) {
    setFormats((current) =>
      current.includes(format) ? current.filter((item) => item !== format) : [...current, format]
    );
  }

  async function submitBatch() {
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError(null);

    const payload = new FormData();
    payload.set("projectName", projectName);
    payload.set("sourceType", sourceType);
    payload.set("urls", JSON.stringify(visibleUrls));
    payload.set("formats", JSON.stringify(formats));
    payload.set("globalThumbnailCount", String(globalThumbnailCount));
    payload.set("globalThumbnailDirection", globalThumbnailDirection);

    if (globalReference) {
      payload.set("globalReference", globalReference);
    }

    if (sourceType === "uploaded_video") {
      visibleUploads.forEach((file) => {
        payload.append("uploadedVideos", file);
      });
    }

    rowIndexes.forEach((index) => {
      const reference = references[index];
      if (reference) {
        payload.set(`reference-${index}`, reference);
      }
      payload.set(`thumbnailCount-${index}`, thumbnailOverrides[index] ?? "");
      payload.set(`thumbnailDirection-${index}`, thumbnailDirections[index] ?? "");
      payload.set(`title-${index}`, titles[index] ?? "");
      payload.set(`description-${index}`, descriptions[index] ?? "");
      payload.set(`notes-${index}`, notes[index] ?? "");
      payload.set(`transcript-${index}`, transcripts[index] ?? "");
    });

    try {
      const response = await fetch("/api/batches", {
        method: "POST",
        body: payload
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error ?? "The batch could not be created.");
      }

      router.push(`/batches/${result.batchId}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The batch could not be created.");
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <section className="generator-hero">
        <Image
          className="generator-hero-image"
          src="/landing/thumbnailflow-hero.png"
          alt="Thumbnail concepts and production dashboard"
          fill
          priority
          sizes="100vw"
        />
        <div className="generator-hero-shade" />
        <div className="generator-hero-inner">
          <div className="generator-hero-copy">
            <span className="hero-kicker generator-kicker">
              <Sparkles aria-hidden="true" size={17} />
              Creator batch studio
            </span>
            <h1>Generate thumbnail sets without the tab chaos.</h1>
            <p>
              Bring links, uploads, notes, transcripts, reference images, copy, prompts, and
              output crops into one focused production page.
            </p>
            <div className="generator-hero-actions">
              <a className="primary-button" href="#batch-builder">
                Build Batch
                <ArrowDown aria-hidden="true" size={18} />
              </a>
              <span className="generator-live-pill">
                <Gauge aria-hidden="true" size={17} />
                {totalImages} planned images
              </span>
            </div>
          </div>

          <aside className="generator-hero-card" aria-label="Batch preview">
            <div className="hero-card-topline">
              <span>Run Preview</span>
              <strong>{videoCount}/10 videos</strong>
            </div>
            <div className="thumbnail-preview thumbnail-preview-elevated" aria-hidden="true">
              <span>BATCH THUMBNAILS THAT CLICK</span>
            </div>
            <div className="generator-stage-list">
              <div className="generator-stage-item">
                <CheckCircle2 aria-hidden="true" size={17} />
                <span>Analyze sources</span>
              </div>
              <div className="generator-stage-item">
                <Sparkles aria-hidden="true" size={17} />
                <span>Write prompts</span>
              </div>
              <div className="generator-stage-item">
                <Rocket aria-hidden="true" size={17} />
                <span>Render crops</span>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="generator-workspace" id="batch-builder">
        <div className="generator-workspace-inner">
          <div className="generator-toolbar">
            <div>
              <span className="section-eyebrow">Generator</span>
              <h2>Batch setup</h2>
            </div>
            <span className="counter-pill">{videoCount}/10 videos</span>
          </div>

          <div className="batch-grid generator-grid">
            <div className="workspace-panel generator-panel">
              <div className="panel-heading generator-panel-heading">
              <div>
                <h2>Batch Setup</h2>
                <p>Build a batch from links or uploads, then generate every concept and crop.</p>
              </div>
              <Sparkles aria-hidden="true" size={22} />
            </div>

            <div className="field-stack">
              <div className="field">
                <label htmlFor="projectName">Project name</label>
                <input
                  id="projectName"
                  className="text-input"
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                />
              </div>

              <section className="step-block">
                <div className="step-heading">
                  <span>Step 1</span>
                  <h2>Add YouTube links or upload videos</h2>
                </div>
                <div className="source-toggle" role="group" aria-label="Source type">
                  <button
                    className={sourceType === "youtube_link" ? "primary-button" : "secondary-button"}
                    type="button"
                    onClick={() => setSourceType("youtube_link")}
                  >
                    <LinkIcon aria-hidden="true" size={17} />
                    YouTube Links
                  </button>
                  <button
                    className={sourceType === "uploaded_video" ? "primary-button" : "secondary-button"}
                    type="button"
                    onClick={() => setSourceType("uploaded_video")}
                  >
                    <Film aria-hidden="true" size={17} />
                    Upload Videos
                  </button>
                </div>

                {sourceType === "youtube_link" ? (
                  <div className="field">
                    <label htmlFor="urls">YouTube URLs</label>
                    <textarea
                      id="urls"
                      className="text-area"
                      value={urlsText}
                      onChange={(event) => setUrlsText(event.target.value)}
                      placeholder="Paste up to 10 YouTube URLs, one per line"
                    />
                    <span className="field-hint">
                      {extraCount > 0
                        ? `${extraCount} extra URL${extraCount === 1 ? "" : "s"} must be removed before generating.`
                        : "Line breaks, commas, and spaces are accepted."}
                    </span>
                  </div>
                ) : (
                  <div className="file-zone">
                    <span className="field-label">
                      <UploadCloud aria-hidden="true" size={16} /> Uploaded videos
                    </span>
                    <input
                      type="file"
                      accept="video/*"
                      multiple
                      onChange={(event) => setUploadedVideos(Array.from(event.target.files ?? []))}
                    />
                    <span className="field-hint">
                      {uploadedVideos.length
                        ? `${uploadedVideos.length} selected${extraCount ? `, remove ${extraCount} to stay under 10` : ""}.`
                        : "Choose up to 10 video files."}
                    </span>
                  </div>
                )}
              </section>

              <section className="step-block">
                <div className="step-heading">
                  <span>Step 2</span>
                  <h2>Add an optional reference image</h2>
                </div>
                <div className="file-zone">
                  <span className="field-label">
                    <UploadCloud aria-hidden="true" size={16} /> Global reference image optional
                  </span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => setGlobalReference(event.target.files?.[0] ?? null)}
                  />
                  <span className="field-hint">
                    {globalReference
                      ? globalReference.name
                      : "Skip this to generate from the video topic alone. Add one only when you want style or layout inspiration."}
                  </span>
                </div>
                <div className="field">
                  <label htmlFor="globalThumbnailDirection">Thumbnail direction optional</label>
                  <textarea
                    id="globalThumbnailDirection"
                    className="text-area compact"
                    value={globalThumbnailDirection}
                    onChange={(event) => setGlobalThumbnailDirection(event.target.value)}
                    placeholder="Example: bold face on the left, short yellow headline, dramatic contrast, clean background"
                  />
                  <span className="field-hint">
                    Applies to every video unless you add a different direction in the video details.
                  </span>
                </div>
              </section>

              <section className="step-block">
                <div className="step-heading">
                  <span>Step 3</span>
                  <h2>Choose thumbnails per video</h2>
                </div>
                <div className="field">
                  <label htmlFor="globalThumbnailCount">Thumbnails per video</label>
                  <select
                    id="globalThumbnailCount"
                    className="text-input"
                    value={globalThumbnailCount}
                    onChange={(event) =>
                      setGlobalThumbnailCount(Number(event.target.value) as ThumbnailCountOption)
                    }
                  >
                    {THUMBNAIL_COUNT_OPTIONS.map((count) => (
                      <option key={count} value={count}>
                        {count} thumbnail{count === 1 ? "" : "s"} per video
                      </option>
                    ))}
                  </select>
                </div>
              </section>

              <section className="step-block">
                <div className="step-heading">
                  <span>Step 4</span>
                  <h2>Choose output formats</h2>
                </div>
                <div className="format-grid">
                  {SUPPORTED_FORMATS.map((format) => (
                    <label className="format-option" key={format}>
                      <input
                        type="checkbox"
                        checked={formats.includes(format)}
                        onChange={() => toggleFormat(format)}
                      />
                      {format}
                    </label>
                  ))}
                </div>
              </section>

              <section className="step-block">
                <div className="step-heading">
                  <span>Step 5</span>
                  <h2>Review image count estimate</h2>
                </div>
                <div className={estimateError ? "estimate-box estimate-box-error" : "estimate-box"}>
                  <strong>{estimateText}</strong>
                  <span>
                    {requiredPoints} points required. Maximum: {MAX_IMAGES_PER_BATCH} generated images per batch.
                  </span>
                </div>
              </section>

              <section className="step-block">
                <div className="step-heading">
                  <span>Step 6</span>
                  <h2>Review video details</h2>
                </div>
                <div className="video-input-list">
                  {videoCount ? (
                    rowIndexes.map((index) => (
                      <div className="video-input-row" key={getRowKey(index, visibleUrls, visibleUploads, sourceType)}>
                        <div className="video-row-top">
                          <span className="video-url">
                            {index + 1}. {getRowLabel(index, visibleUrls, visibleUploads, sourceType)}
                          </span>
                          <span className="format-pill">
                            {getRowThumbnailCount(index)} × {formats.length} ={" "}
                            {getRowThumbnailCount(index) * formats.length} images
                          </span>
                        </div>

                        <div className="video-row-fields">
                          <div className="file-zone">
                            <span className="field-label">
                              <ImagePlus aria-hidden="true" size={16} /> Per-video reference optional
                            </span>
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              onChange={(event) =>
                                setReferences((current) => ({
                                  ...current,
                                  [index]: event.target.files?.[0] ?? null
                                }))
                              }
                            />
                            <span className="field-hint">Overrides the global reference only for this video.</span>
                          </div>
                          <div className="field">
                            <label htmlFor={`thumbnailCount-${index}`}>Thumbnail count override</label>
                            <select
                              id={`thumbnailCount-${index}`}
                              className="text-input"
                              value={thumbnailOverrides[index] ?? ""}
                              onChange={(event) =>
                                setThumbnailOverrides((current) => ({
                                  ...current,
                                  [index]: event.target.value
                                }))
                              }
                            >
                              <option value="">Use global ({globalThumbnailCount})</option>
                              {THUMBNAIL_COUNT_OPTIONS.map((count) => (
                                <option key={count} value={count}>
                                  {count}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {sourceType === "uploaded_video" ? (
                          <div className="video-row-fields">
                            <div className="field">
                              <label htmlFor={`title-${index}`}>Video title</label>
                              <input
                                id={`title-${index}`}
                                className="text-input"
                                value={titles[index] ?? visibleUploads[index]?.name ?? ""}
                                onChange={(event) =>
                                  setTitles((current) => ({ ...current, [index]: event.target.value }))
                                }
                              />
                            </div>
                            <div className="field">
                              <label htmlFor={`description-${index}`}>Video description</label>
                              <textarea
                                id={`description-${index}`}
                                className="text-area compact"
                                value={descriptions[index] ?? ""}
                                onChange={(event) =>
                                  setDescriptions((current) => ({
                                    ...current,
                                    [index]: event.target.value
                                  }))
                                }
                                placeholder="What is this video about?"
                              />
                            </div>
                          </div>
                        ) : null}

                        <div className="video-row-fields">
                          <div className="field wide-field">
                            <label htmlFor={`thumbnailDirection-${index}`}>Thumbnail direction optional</label>
                            <textarea
                              id={`thumbnailDirection-${index}`}
                              className="text-area compact"
                              value={thumbnailDirections[index] ?? ""}
                              onChange={(event) =>
                                setThumbnailDirections((current) => ({
                                  ...current,
                                  [index]: event.target.value
                                }))
                              }
                              placeholder="Describe the thumbnail style, subject, text, mood, colors, or layout for this video"
                            />
                            <span className="field-hint">
                              Leave blank to use the global direction or let the AI choose.
                            </span>
                          </div>
                        </div>

                        <div className="video-row-fields">
                          <div className="field">
                            <label htmlFor={`notes-${index}`}>Notes</label>
                            <textarea
                              id={`notes-${index}`}
                              className="text-area compact"
                              value={notes[index] ?? ""}
                              onChange={(event) =>
                                setNotes((current) => ({ ...current, [index]: event.target.value }))
                              }
                              placeholder="Angle, audience, visual ideas"
                            />
                          </div>
                          <div className="field">
                            <label htmlFor={`transcript-${index}`}>Transcript</label>
                            <textarea
                              id={`transcript-${index}`}
                              className="text-area compact"
                              value={transcripts[index] ?? ""}
                              onChange={(event) =>
                                setTranscripts((current) => ({ ...current, [index]: event.target.value }))
                              }
                              placeholder="Optional transcript excerpt"
                            />
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="empty-state">
                      {sourceType === "youtube_link" ? "Add at least one YouTube URL." : "Upload at least one video."}
                    </div>
                  )}
                </div>
              </section>

              {tooManySources ? (
                <div className="error-box">Keep the batch to {MAX_VIDEOS_PER_BATCH} videos or fewer.</div>
              ) : null}
              {estimateError ? <div className="error-box">{estimateError}</div> : null}
              {billingError ? <div className="error-box">{billingError}</div> : null}
              {billing && !hasEnoughPoints ? (
                <div className="error-box">
                  This batch needs {requiredPoints} points. You have {pointsBalance}. Add points to generate.
                </div>
              ) : null}
              {error ? <div className="error-box">{error}</div> : null}

              <div className="submit-row">
                <span className="field-hint">The batch job will update image progress as each file is saved.</span>
                <button className="primary-button" disabled={!canSubmit} onClick={submitBatch}>
                  {isSubmitting ? (
                    <Loader2 aria-hidden="true" size={18} className="spinner" />
                  ) : (
                    <Play aria-hidden="true" size={18} />
                  )}
                  {billing && !hasEnoughPoints ? "Add points to generate" : "Generate Batch"}
                </button>
              </div>
            </div>
          </div>

          <aside className="side-panel generator-side-panel">
            <div className="preview-stack">
              <div className="generator-side-header">
                <span className="section-eyebrow">Live Estimate</span>
                <h2>Run Overview</h2>
              </div>
              <div className="thumbnail-preview" aria-hidden="true">
                <span>BATCH THUMBNAILS THAT CLICK</span>
              </div>
              <div>
                <p>Each source gets metadata, copy, prompts, concepts, crops, and saved outputs.</p>
              </div>
              <div className="side-stat-grid">
                <div className="side-stat">
                  <strong>{videoCount}</strong>
                  <span>Videos</span>
                </div>
                <div className="side-stat">
                  <strong>{globalThumbnailCount}</strong>
                  <span>Global count</span>
                </div>
                <div className="side-stat">
                  <strong>{formats.length}</strong>
                  <span>Formats</span>
                </div>
                <div className="side-stat">
                  <strong>{totalImages}</strong>
                  <span>Images</span>
                </div>
              </div>
              <div className="points-card">
                <div>
                  <span className="section-eyebrow">Point Balance</span>
                  <strong>{billing ? pointsBalance : "..."}</strong>
                  <p>
                    This run costs {requiredPoints} points: {videoCount * pointCosts.creativePackPerVideo} for copy
                    and {totalImages * pointCosts.thumbnailImage} for images.
                  </p>
                </div>
                <a className="secondary-button compact-button" href="/pricing">
                  <CreditCard aria-hidden="true" size={16} />
                  Buy points
                </a>
              </div>
              <div className="button-row">
                <span className="status-pill" data-status="queued">
                  <ClipboardList aria-hidden="true" size={15} />
                  Queued
                </span>
                <span className="status-pill" data-status="generating_thumbnails">
                  <Layers3 aria-hidden="true" size={15} />
                  Image progress
                </span>
              </div>
            </div>
          </aside>
        </div>
        </div>
      </section>
    </>
  );
}

export function AppHeader({ action }: { action?: React.ReactNode }) {
  return (
    <header className="topbar">
      <div className="brand-lockup">
        <div className="brand-mark">
          <Layers3 aria-hidden="true" size={24} />
        </div>
        <div className="brand-copy">
          <h1>ThumbnailFlow Batch</h1>
          <p>Batch YouTube thumbnail generation workflow</p>
        </div>
      </div>
      {action}
    </header>
  );
}

function parseUrlText(value: string) {
  return value
    .split(/[\n,\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.startsWith("http://") || item.startsWith("https://"));
}

function getRowLabel(index: number, urls: string[], uploads: File[], sourceType: SourceType) {
  return sourceType === "youtube_link" ? urls[index] : uploads[index]?.name ?? "Uploaded video";
}

function getRowKey(index: number, urls: string[], uploads: File[], sourceType: SourceType) {
  return `${sourceType}-${index}-${getRowLabel(index, urls, uploads, sourceType)}`;
}
