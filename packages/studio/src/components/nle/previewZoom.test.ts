import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREVIEW_ZOOM,
  MAX_PREVIEW_ZOOM_PERCENT,
  MIN_PREVIEW_ZOOM_PERCENT,
  clampPreviewPan,
  clampPreviewZoomPercent,
  getNextPreviewZoomPercent,
  getPreviewWheelZoomPercent,
  resolvePreviewWheelZoom,
} from "./previewZoom";

describe("clampPreviewZoomPercent", () => {
  it("falls back to fit zoom for invalid input", () => {
    expect(clampPreviewZoomPercent(Number.NaN)).toBe(100);
  });

  it("clamps to supported preview zoom bounds", () => {
    expect(clampPreviewZoomPercent(1)).toBe(MIN_PREVIEW_ZOOM_PERCENT);
    expect(clampPreviewZoomPercent(5000)).toBe(MAX_PREVIEW_ZOOM_PERCENT);
  });
});

describe("getPreviewWheelZoomPercent", () => {
  it("zooms in on upward modifier-wheel motion", () => {
    expect(getPreviewWheelZoomPercent(-80, 100)).toBeGreaterThan(100);
  });

  it("zooms out on downward modifier-wheel motion", () => {
    expect(getPreviewWheelZoomPercent(80, 200)).toBeLessThan(200);
  });

  it("preserves the current zoom for invalid wheel input", () => {
    expect(getPreviewWheelZoomPercent(Number.NaN, 180)).toBe(180);
  });
});

describe("getNextPreviewZoomPercent", () => {
  it("steps preview zoom in and out", () => {
    expect(getNextPreviewZoomPercent("in", 100)).toBe(125);
    expect(getNextPreviewZoomPercent("out", 125)).toBe(100);
  });
});

describe("clampPreviewPan", () => {
  it("centers the preview when fit or zoomed out", () => {
    expect(
      clampPreviewPan({
        panX: 120,
        panY: -90,
        zoomPercent: 100,
        viewportWidth: 800,
        viewportHeight: 600,
      }),
    ).toEqual({ panX: 0, panY: 0 });
  });

  it("keeps pan within the zoomed preview bounds", () => {
    expect(
      clampPreviewPan({
        panX: 900,
        panY: -900,
        zoomPercent: 200,
        viewportWidth: 800,
        viewportHeight: 600,
      }),
    ).toEqual({ panX: 400, panY: -300 });
  });
});

describe("resolvePreviewWheelZoom", () => {
  it("keeps the cursor anchored when zooming in", () => {
    const next = resolvePreviewWheelZoom({
      state: DEFAULT_PREVIEW_ZOOM,
      deltaY: -120,
      pointerX: 600,
      pointerY: 200,
      viewportWidth: 800,
      viewportHeight: 600,
    });

    expect(next.zoomPercent).toBeGreaterThan(100);
    expect(next.panX).toBeLessThan(0);
    expect(next.panY).toBeGreaterThan(0);
  });

  it("resets pan when returning to fit or smaller", () => {
    const next = resolvePreviewWheelZoom({
      state: { zoomPercent: 30, panX: 20, panY: 20 },
      deltaY: 120,
      pointerX: 400,
      pointerY: 300,
      viewportWidth: 800,
      viewportHeight: 600,
    });

    expect(next.zoomPercent).toBe(MIN_PREVIEW_ZOOM_PERCENT);
    expect(next.panX).toBe(0);
    expect(next.panY).toBe(0);
  });
});
