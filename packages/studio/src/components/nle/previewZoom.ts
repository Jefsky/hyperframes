export interface PreviewZoomState {
  zoomPercent: number;
  panX: number;
  panY: number;
}

export const MIN_PREVIEW_ZOOM_PERCENT = 25;
export const MAX_PREVIEW_ZOOM_PERCENT = 400;
export const DEFAULT_PREVIEW_ZOOM: PreviewZoomState = {
  zoomPercent: 100,
  panX: 0,
  panY: 0,
};

const PREVIEW_WHEEL_ZOOM_SENSITIVITY = 0.002;

export function clampPreviewZoomPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 100;
  return Math.min(
    MAX_PREVIEW_ZOOM_PERCENT,
    Math.max(MIN_PREVIEW_ZOOM_PERCENT, Math.round(percent)),
  );
}

export function getPreviewWheelZoomPercent(deltaY: number, currentZoomPercent: number): number {
  if (!Number.isFinite(deltaY)) return clampPreviewZoomPercent(currentZoomPercent);
  const current = clampPreviewZoomPercent(currentZoomPercent);
  return clampPreviewZoomPercent(current * Math.exp(-deltaY * PREVIEW_WHEEL_ZOOM_SENSITIVITY));
}

export function getNextPreviewZoomPercent(
  direction: "in" | "out",
  currentZoomPercent: number,
): number {
  const current = clampPreviewZoomPercent(currentZoomPercent);
  const multiplier = direction === "in" ? 1.25 : 0.8;
  return clampPreviewZoomPercent(current * multiplier);
}

export function clampPreviewPan(input: {
  panX: number;
  panY: number;
  zoomPercent: number;
  viewportWidth: number;
  viewportHeight: number;
}): Pick<PreviewZoomState, "panX" | "panY"> {
  const scale = clampPreviewZoomPercent(input.zoomPercent) / 100;
  if (scale <= 1) return { panX: 0, panY: 0 };

  const maxPanX = ((scale - 1) * input.viewportWidth) / 2;
  const maxPanY = ((scale - 1) * input.viewportHeight) / 2;
  return {
    panX: Math.min(maxPanX, Math.max(-maxPanX, input.panX)),
    panY: Math.min(maxPanY, Math.max(-maxPanY, input.panY)),
  };
}

export function resolvePreviewWheelZoom(input: {
  state: PreviewZoomState;
  deltaY: number;
  pointerX: number;
  pointerY: number;
  viewportWidth: number;
  viewportHeight: number;
}): PreviewZoomState {
  const currentZoomPercent = clampPreviewZoomPercent(input.state.zoomPercent);
  const nextZoomPercent = getPreviewWheelZoomPercent(input.deltaY, currentZoomPercent);
  const currentScale = currentZoomPercent / 100;
  const nextScale = nextZoomPercent / 100;
  const originX = input.pointerX - input.viewportWidth / 2;
  const originY = input.pointerY - input.viewportHeight / 2;

  const nextPanX = originX - ((originX - input.state.panX) * nextScale) / currentScale;
  const nextPanY = originY - ((originY - input.state.panY) * nextScale) / currentScale;
  const pan = clampPreviewPan({
    panX: nextPanX,
    panY: nextPanY,
    zoomPercent: nextZoomPercent,
    viewportWidth: input.viewportWidth,
    viewportHeight: input.viewportHeight,
  });

  return {
    zoomPercent: nextZoomPercent,
    ...pan,
  };
}
