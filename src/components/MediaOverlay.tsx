import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { currentMediaFrame, type MediaFrame, subscribeMediaFrame } from "../media/mediaFrameBus";
import type { AudioItem } from "../model/audioItem";
import type { ImageItem } from "../model/image";
import { badgePalette } from "../model/mediaBadge";
import { getMedia } from "../persistence/media";
import { useBoardStore } from "../store/useBoardStore";

type RegisterEl = (itemId: string, el: HTMLElement | null) => void;

interface VideoItemViewProps {
  item: ImageItem;
  src: string | undefined;
  registerEl: RegisterEl;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

function PlayIcon({ color }: { color?: string }) {
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true">
      <path d="M4 2.5v11l9-5.5z" fill={color ?? "currentColor"} />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true">
      <path d="M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z" fill="currentColor" />
    </svg>
  );
}

function FullscreenIcon() {
  return (
    <svg viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true">
      <path
        d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const VideoItemView = memo(function VideoItemView({ item, src, registerEl }: VideoItemViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => {});
    else video.pause();
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;
    if (document.fullscreenElement === container) void document.exitFullscreen().catch(() => {});
    else void container.requestFullscreen?.().catch(() => {});
  };

  return (
    <div
      ref={(el) => {
        containerRef.current = el;
        registerEl(item.id, el);
      }}
      className="media-item media-video"
      style={{ left: item.x, top: item.y, width: item.width, height: item.height }}
    >
      {/* biome-ignore lint/a11y/useMediaCaption: user-inserted note videos carry no caption tracks */}
      <video
        ref={videoRef}
        src={src}
        playsInline
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onVolumeChange={(e) => setVolume(e.currentTarget.volume)}
      />
      <div className="media-controls">
        <button
          type="button"
          className="media-btn"
          title={playing ? "Pause" : "Play"}
          onClick={togglePlay}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <input
          type="range"
          className="media-seek"
          min={0}
          max={Number.isFinite(duration) ? duration : 0}
          step={0.05}
          value={Math.min(time, Number.isFinite(duration) ? duration : 0)}
          aria-label="Seek"
          onChange={(e) => {
            const video = videoRef.current;
            if (!video) return;
            video.currentTime = Number(e.target.value);
            setTime(video.currentTime);
          }}
        />
        <span className="media-time">
          {formatTime(time)} / {formatTime(duration)}
        </span>
        <input
          type="range"
          className="media-volume"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          aria-label="Volume"
          onChange={(e) => {
            const video = videoRef.current;
            if (!video) return;
            video.volume = Number(e.target.value);
          }}
        />
        <button type="button" className="media-btn" title="Fullscreen" onClick={toggleFullscreen}>
          <FullscreenIcon />
        </button>
      </div>
    </div>
  );
});

interface AudioBadgeViewProps {
  item: AudioItem;
  paperColor: string;
  src: string | undefined;
  registerEl: RegisterEl;
}

const AudioBadgeView = memo(function AudioBadgeView({
  item,
  paperColor,
  src,
  registerEl,
}: AudioBadgeViewProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const palette = badgePalette(paperColor);
  const fontSize = Math.max(9, item.height * 0.3);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => {});
    else audio.pause();
  };

  return (
    <div
      ref={(el) => registerEl(item.id, el)}
      className="media-item media-audio"
      style={{
        left: item.x,
        top: item.y,
        width: item.width,
        height: item.height,
        fontSize,
        borderRadius: item.height / 2,
        background: palette.background,
        color: palette.icon,
      }}
    >
      {/* biome-ignore lint/a11y/useMediaCaption: user-inserted note audio carries no caption tracks */}
      <audio
        ref={audioRef}
        src={src}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
      />
      <button
        type="button"
        className="media-audio-play"
        title={playing ? "Pause" : "Play"}
        style={{ background: palette.icon, color: palette.onIcon }}
        onClick={togglePlay}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <input
        type="range"
        className="media-audio-seek"
        min={0}
        max={Number.isFinite(duration) ? duration : 0}
        step={0.05}
        value={Math.min(time, Number.isFinite(duration) ? duration : 0)}
        aria-label="Seek"
        style={{ accentColor: palette.icon }}
        onChange={(e) => {
          const audio = audioRef.current;
          if (!audio) return;
          audio.currentTime = Number(e.target.value);
          setTime(audio.currentTime);
        }}
      />
      <span className="media-audio-time">{formatTime(time)}</span>
    </div>
  );
});

export function MediaOverlay() {
  const pages = useBoardStore((state) => state.pages);
  const tool = useBoardStore((state) => state.tool);
  const pageEls = useRef(new Map<string, HTMLElement>());
  const itemEls = useRef(new Map<string, HTMLElement>());
  const itemsById = useRef(
    new Map<string, { x: number; y: number; width: number; height: number }>(),
  );
  const [mediaUrls, setMediaUrls] = useState<ReadonlyMap<string, string>>(() => new Map());
  const allUrls = useRef(new Set<string>());

  const mediaPages = useMemo(
    () =>
      pages.filter((page) => page.audios.length > 0 || page.images.some((image) => image.videoId)),
    [pages],
  );

  useEffect(() => {
    const map = new Map<string, { x: number; y: number; width: number; height: number }>();
    for (const page of mediaPages) {
      for (const image of page.images) {
        if (image.videoId) map.set(image.id, image);
      }
      for (const audio of page.audios) map.set(audio.id, audio);
    }
    itemsById.current = map;
  }, [mediaPages]);

  useEffect(() => {
    const wanted = new Set<string>();
    for (const page of mediaPages) {
      for (const image of page.images) {
        if (image.videoId) wanted.add(image.videoId);
      }
      for (const audio of page.audios) wanted.add(audio.audioId);
    }
    const missing = [...wanted].filter((id) => !mediaUrls.has(id));
    const stale = [...mediaUrls.keys()].filter((id) => !wanted.has(id));
    if (missing.length === 0 && stale.length === 0) return;
    let cancelled = false;
    void (async () => {
      const loaded: (readonly [string, string])[] = [];
      for (const id of missing) {
        const record = await getMedia(id).catch(() => undefined);
        if (record) {
          const url = URL.createObjectURL(record.blob);
          allUrls.current.add(url);
          loaded.push([id, url] as const);
        }
      }
      if (cancelled) return;
      setMediaUrls((prev) => {
        const next = new Map(prev);
        for (const [id, url] of prev) {
          if (!wanted.has(id)) {
            URL.revokeObjectURL(url);
            next.delete(id);
          }
        }
        for (const [id, url] of loaded) {
          if (wanted.has(id) && !next.has(id)) next.set(id, url);
        }
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [mediaPages, mediaUrls]);

  useEffect(
    () => () => {
      for (const url of allUrls.current) URL.revokeObjectURL(url);
      allUrls.current.clear();
    },
    [],
  );

  useEffect(() => {
    const apply = (frame: MediaFrame) => {
      const origins = new Map(frame.pages.map((p) => [p.pageId, p]));
      for (const [pageId, el] of pageEls.current) {
        const origin = origins.get(pageId);
        if (!origin) {
          el.style.display = "none";
          continue;
        }
        el.style.display = "";
        el.style.transform = `translate(${origin.x}px, ${origin.y}px) scale(${frame.scale})`;
      }
      const selected = new Set([...frame.selectedVideoIds, ...frame.selectedAudioIds]);
      const gesture = frame.gesture;
      for (const [itemId, el] of itemEls.current) {
        const item = itemsById.current.get(itemId);
        if (!item || !gesture || !selected.has(itemId)) {
          el.style.transform = "";
          el.style.width = item ? `${item.width}px` : "";
          el.style.height = item ? `${item.height}px` : "";
          continue;
        }
        if (gesture.kind === "move") {
          el.style.transform = `translate(${gesture.dx}px, ${gesture.dy}px)`;
        } else {
          // Translate + explicit size (never scale()) keeps the badge capsule
          // and the video controls undistorted while tracking the handles;
          // the element stays exactly over the poster the engine repaints.
          const dx = (item.x - gesture.anchor.x) * (gesture.sx - 1);
          const dy = (item.y - gesture.anchor.y) * (gesture.sy - 1);
          el.style.transform = `translate(${dx}px, ${dy}px)`;
          el.style.width = `${item.width * gesture.sx}px`;
          el.style.height = `${item.height * gesture.sy}px`;
        }
      }
    };
    const unsubscribe = subscribeMediaFrame(apply);
    apply(currentMediaFrame());
    return unsubscribe;
  }, []);

  const registerEl = useCallback((itemId: string, el: HTMLElement | null) => {
    if (el) itemEls.current.set(itemId, el);
    else itemEls.current.delete(itemId);
  }, []);

  if (mediaPages.length === 0) return null;

  return (
    <div className={tool === "select" ? "media-layer media-interactive" : "media-layer"}>
      {mediaPages.map((page) => (
        <div
          key={page.id}
          ref={(el) => {
            if (el) pageEls.current.set(page.id, el);
            else pageEls.current.delete(page.id);
          }}
          className="media-page"
          style={{ display: "none" }}
        >
          {page.images
            .filter((image) => image.videoId)
            .map((image) => (
              <VideoItemView
                key={image.id}
                item={image}
                src={image.videoId ? mediaUrls.get(image.videoId) : undefined}
                registerEl={registerEl}
              />
            ))}
          {page.audios.map((audio) => (
            <AudioBadgeView
              key={audio.id}
              item={audio}
              paperColor={page.paperColor}
              src={mediaUrls.get(audio.audioId)}
              registerEl={registerEl}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
