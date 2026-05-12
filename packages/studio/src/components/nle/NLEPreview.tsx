import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type Ref,
  type SetStateAction,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { Player } from "../../player";
import { RotateCcw, ZoomIn, ZoomOut } from "../../icons/SystemIcons";
import {
  DEFAULT_PREVIEW_ZOOM,
  clampPreviewPan,
  clampPreviewZoomPercent,
  getNextPreviewZoomPercent,
  resolvePreviewWheelZoom,
  type PreviewZoomState,
} from "./previewZoom";
import { readStudioUiPreferences, writeStudioUiPreferences } from "../../utils/studioUiPreferences";

interface NLEPreviewProps {
  projectId: string;
  iframeRef: Ref<HTMLIFrameElement>;
  onIframeLoad: () => void;
  onCompositionLoadingChange?: (loading: boolean) => void;
  portrait?: boolean;
  directUrl?: string;
  refreshKey?: number;
  suppressLoadingOverlay?: boolean;
}

export function getPreviewPlayerKey({
  projectId,
  directUrl,
}: {
  projectId: string;
  directUrl?: string;
  refreshKey?: number;
}): string {
  return directUrl ?? projectId;
}

/**
 * Manages the composition preview with crossfade on reload.
 *
 * When refreshKey changes, a new Player is mounted alongside the old one.
 * The old Player stays visible (opacity 1) until the new one fires onLoad,
 * at which point the old is removed. This avoids the flash that a simple
 * key-swap remount would cause.
 *
 * Uses the render-time state adjustment pattern (React-sanctioned) to detect
 * refreshKey changes — no useEffect needed.
 */
export const NLEPreview = memo(function NLEPreview({
  projectId,
  iframeRef,
  onIframeLoad,
  onCompositionLoadingChange,
  portrait,
  directUrl,
  refreshKey,
  suppressLoadingOverlay,
}: NLEPreviewProps) {
  const baseKey = getPreviewPlayerKey({ projectId, directUrl, refreshKey });
  const prevRefreshKeyRef = useRef(refreshKey);
  const viewportRef = useRef<HTMLDivElement>(null);
  const activeIframeRef = useRef<HTMLIFrameElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [retiringKey, setRetiringKey] = useState<string | null>(null);
  const retiringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previewZoom, setPreviewZoomRaw] = useState<PreviewZoomState>(() => {
    const stored = readStudioUiPreferences().previewZoom;
    return stored
      ? {
          zoomPercent: clampPreviewZoomPercent(stored.zoomPercent),
          panX: stored.panX,
          panY: stored.panY,
        }
      : DEFAULT_PREVIEW_ZOOM;
  });
  const isZoomed = previewZoom.zoomPercent !== DEFAULT_PREVIEW_ZOOM.zoomPercent;

  // Detect refreshKey change during render (React-sanctioned derived state pattern).
  // When the key changes, the current active player becomes the retiring player
  // and a new active player is mounted alongside it.
  if (refreshKey !== prevRefreshKeyRef.current) {
    const oldKey = `${baseKey}:${prevRefreshKeyRef.current ?? 0}`;
    prevRefreshKeyRef.current = refreshKey;
    setRetiringKey(oldKey);
  }

  const activeKey = `${baseKey}:${refreshKey ?? 0}`;

  const handleNewPlayerLoad = () => {
    onIframeLoad();
    if (retiringTimerRef.current) clearTimeout(retiringTimerRef.current);
    retiringTimerRef.current = setTimeout(() => {
      setRetiringKey(null);
      retiringTimerRef.current = null;
    }, 160);
  };

  const setActiveIframeRef = useCallback(
    (iframe: HTMLIFrameElement | null) => {
      activeIframeRef.current = iframe;
      if (typeof iframeRef === "function") {
        iframeRef(iframe);
      } else if (iframeRef) {
        (iframeRef as MutableRefObject<HTMLIFrameElement | null>).current = iframe;
      }
    },
    [iframeRef],
  );

  const setPreviewZoom = useCallback((action: SetStateAction<PreviewZoomState>) => {
    setPreviewZoomRaw((state) => {
      const nextInput = typeof action === "function" ? action(state) : action;
      const next = {
        zoomPercent: clampPreviewZoomPercent(nextInput.zoomPercent),
        panX: Number.isFinite(nextInput.panX) ? nextInput.panX : 0,
        panY: Number.isFinite(nextInput.panY) ? nextInput.panY : 0,
      };
      writeStudioUiPreferences({ previewZoom: next });
      return next;
    });
  }, []);

  const resolveWheelClientPoint = useCallback((event: WheelEvent): { x: number; y: number } => {
    const iframe = activeIframeRef.current;
    if (iframe?.contentWindow && event.currentTarget === iframe.contentWindow) {
      const iframeRect = iframe.getBoundingClientRect();
      return {
        x: iframeRect.left + event.clientX,
        y: iframeRect.top + event.clientY,
      };
    }
    return { x: event.clientX, y: event.clientY };
  }, []);

  const applyModifierWheelZoom = useCallback(
    (event: WheelEvent, clientPoint: { x: number; y: number }) => {
      if (!event.ctrlKey && !event.metaKey && !event.shiftKey) return;
      const viewport = viewportRef.current;
      if (!viewport) return;

      event.preventDefault();
      event.stopPropagation();

      const rect = viewport.getBoundingClientRect();
      setPreviewZoom((state) =>
        resolvePreviewWheelZoom({
          state,
          deltaY: event.deltaY,
          pointerX: clientPoint.x - rect.left,
          pointerY: clientPoint.y - rect.top,
          viewportWidth: rect.width,
          viewportHeight: rect.height,
        }),
      );
    },
    [setPreviewZoom],
  );

  const handleReactWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("[data-preview-zoom-control]")) return;
      applyModifierWheelZoom(event.nativeEvent, {
        x: event.clientX,
        y: event.clientY,
      });
    },
    [applyModifierWheelZoom],
  );

  useEffect(() => {
    const iframe = activeIframeRef.current;
    if (!iframe) return;

    const handleWheel = (event: WheelEvent) => {
      applyModifierWheelZoom(event, resolveWheelClientPoint(event));
    };

    iframe.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    iframe.contentWindow?.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    return () => {
      iframe.removeEventListener("wheel", handleWheel, { capture: true });
      iframe.contentWindow?.removeEventListener("wheel", handleWheel, { capture: true });
    };
  }, [applyModifierWheelZoom, resolveWheelClientPoint, activeKey]);

  const updateZoomFromButton = useCallback(
    (direction: "in" | "out") => {
      const viewport = viewportRef.current;
      if (!viewport) {
        setPreviewZoom((state) => ({
          ...state,
          zoomPercent: getNextPreviewZoomPercent(direction, state.zoomPercent),
        }));
        return;
      }
      const rect = viewport.getBoundingClientRect();
      setPreviewZoom((state) => {
        const nextZoomPercent = getNextPreviewZoomPercent(direction, state.zoomPercent);
        const pan = clampPreviewPan({
          panX: state.panX,
          panY: state.panY,
          zoomPercent: nextZoomPercent,
          viewportWidth: rect.width,
          viewportHeight: rect.height,
        });
        return { zoomPercent: nextZoomPercent, ...pan };
      });
    },
    [setPreviewZoom],
  );

  const resetPreviewZoom = useCallback(() => {
    setPreviewZoom(DEFAULT_PREVIEW_ZOOM);
  }, [setPreviewZoom]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (previewZoom.zoomPercent <= DEFAULT_PREVIEW_ZOOM.zoomPercent || event.button !== 0) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("[data-preview-zoom-control]")) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: previewZoom.panX,
        originY: previewZoom.panY,
      };
    },
    [previewZoom.panX, previewZoom.panY, previewZoom.zoomPercent],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      const viewport = viewportRef.current;
      if (!drag || !viewport || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const pan = clampPreviewPan({
        panX: drag.originX + event.clientX - drag.startX,
        panY: drag.originY + event.clientY - drag.startY,
        zoomPercent: previewZoom.zoomPercent,
        viewportWidth: rect.width,
        viewportHeight: rect.height,
      });
      setPreviewZoom((state) => ({ ...state, ...pan }));
    },
    [previewZoom.zoomPercent, setPreviewZoom],
  );

  const finishDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div
        ref={viewportRef}
        className={`relative flex-1 flex items-center justify-center p-2 overflow-hidden min-h-0 outline-none focus:ring-1 focus:ring-studio-accent/40 ${
          previewZoom.zoomPercent > DEFAULT_PREVIEW_ZOOM.zoomPercent
            ? "cursor-grab active:cursor-grabbing"
            : ""
        }`}
        tabIndex={0}
        aria-label="Composition preview"
        onWheel={handleReactWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <div
          className="absolute inset-2"
          style={{
            transform: `translate3d(${previewZoom.panX}px, ${previewZoom.panY}px, 0) scale(${previewZoom.zoomPercent / 100})`,
            transformOrigin: "center center",
            transition: dragRef.current ? undefined : "transform 120ms ease-out",
          }}
          data-testid="preview-zoom-stage"
        >
          {retiringKey && (
            <Player
              key={retiringKey}
              projectId={directUrl ? undefined : projectId}
              directUrl={directUrl}
              onLoad={() => {}}
              portrait={portrait}
              style={{ position: "absolute", inset: 0, zIndex: 0, opacity: 1 }}
            />
          )}
          <Player
            key={activeKey}
            ref={setActiveIframeRef}
            projectId={directUrl ? undefined : projectId}
            directUrl={directUrl}
            onLoad={retiringKey ? handleNewPlayerLoad : onIframeLoad}
            onCompositionLoadingChange={onCompositionLoadingChange}
            portrait={portrait}
            style={retiringKey ? { position: "absolute", inset: 0, zIndex: 1 } : undefined}
            suppressLoadingOverlay={suppressLoadingOverlay}
          />
        </div>
        <div
          className="absolute right-14 top-3 z-40 flex items-center gap-1 rounded-md border border-neutral-800/80 bg-neutral-950/90 p-1 shadow-lg shadow-black/30 backdrop-blur"
          data-preview-zoom-control=""
        >
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-100 disabled:opacity-40"
            title="Zoom preview out"
            aria-label="Zoom preview out"
            onClick={() => updateZoomFromButton("out")}
          >
            <ZoomOut className="pointer-events-none" size={15} />
          </button>
          <div className="min-w-[44px] text-center text-[10px] font-medium tabular-nums text-neutral-300">
            {isZoomed ? `${previewZoom.zoomPercent}%` : "Fit"}
          </div>
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-100 disabled:opacity-40"
            title="Zoom preview in"
            aria-label="Zoom preview in"
            onClick={() => updateZoomFromButton("in")}
          >
            <ZoomIn className="pointer-events-none" size={15} />
          </button>
          <button
            type="button"
            className="ml-1 flex h-7 w-7 items-center justify-center rounded border-l border-neutral-800 text-neutral-400 transition-colors hover:bg-neutral-900 hover:text-neutral-100 disabled:opacity-40"
            title="Reset preview zoom"
            aria-label="Reset preview zoom"
            disabled={!isZoomed}
            onClick={resetPreviewZoom}
          >
            <RotateCcw className="pointer-events-none" size={15} />
          </button>
        </div>
      </div>
    </div>
  );
});
