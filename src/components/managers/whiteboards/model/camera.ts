// The camera: the only place that converts between screen and world coordinates. Pure — no React,
// no DOM — so the probe can run it in node and every later tool (sticky placement, selection box,
// connectors) asks the same two functions instead of redoing `/ zoom` by hand.
//
// `x`, `y` are the WORLD point at the viewport's top-left corner; `zoom` is screen px per world
// px. Screen points are relative to the viewport, not to the page.

export type Point = { x: number; y: number };
export type Size = { width: number; height: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type Camera = { x: number; y: number; zoom: number };

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
/** The stops the − / + buttons walk through; a wheel zoom lands anywhere in between. */
export const ZOOM_STOPS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4] as const;
/** Screen px left around the content when fitting. */
export const FIT_PADDING = 64;

export const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

export function screenToWorld(camera: Camera, p: Point): Point {
  return { x: camera.x + p.x / camera.zoom, y: camera.y + p.y / camera.zoom };
}

export function worldToScreen(camera: Camera, p: Point): Point {
  return { x: (p.x - camera.x) * camera.zoom, y: (p.y - camera.y) * camera.zoom };
}

/** Move the view by a screen delta (a drag of +dx moves the world right, so the camera left). */
export function panBy(camera: Camera, dx: number, dy: number): Camera {
  return { ...camera, x: camera.x - dx / camera.zoom, y: camera.y - dy / camera.zoom };
}

/** Zoom so that the world point under `anchor` (a screen point) stays under it. */
export function zoomAt(camera: Camera, anchor: Point, nextZoom: number): Camera {
  const zoom = clampZoom(nextZoom);
  const world = screenToWorld(camera, anchor);
  return { x: world.x - anchor.x / zoom, y: world.y - anchor.y / zoom, zoom };
}

/** The next stop up (`dir` 1) or down (-1) from the current zoom, never the same value. */
export function zoomStop(zoom: number, dir: 1 | -1): number {
  const eps = 1e-6;
  if (dir > 0) return ZOOM_STOPS.find((s) => s > zoom + eps) ?? MAX_ZOOM;
  return [...ZOOM_STOPS].reverse().find((s) => s < zoom - eps) ?? MIN_ZOOM;
}

/** The world rectangle the viewport shows. */
export function visibleWorld(camera: Camera, viewport: Size): Rect {
  return {
    x: camera.x,
    y: camera.y,
    width: viewport.width / camera.zoom,
    height: viewport.height / camera.zoom,
  };
}

/** A camera that puts world `point` in the middle of the viewport at `zoom`. */
export function centerOn(point: Point, viewport: Size, zoom = 1): Camera {
  const z = clampZoom(zoom);
  return { x: point.x - viewport.width / 2 / z, y: point.y - viewport.height / 2 / z, zoom: z };
}

/**
 * Fit `bounds` into the viewport with `FIT_PADDING` around it, never past 100% — a single sticky
 * should not fill the screen at 400%. No bounds (an empty whiteboard) centres the origin at 100%.
 */
export function fitBounds(bounds: Rect | null, viewport: Size): Camera {
  const center = bounds
    ? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
    : { x: 0, y: 0 };
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return centerOn(center, viewport, 1);
  const w = Math.max(1, viewport.width - FIT_PADDING * 2);
  const h = Math.max(1, viewport.height - FIT_PADDING * 2);
  const zoom = Math.min(1, w / bounds.width, h / bounds.height);
  return centerOn(center, viewport, zoom);
}

/**
 * Wheel delta → zoom factor. `deltaMode` 1 is lines (Firefox with a mouse wheel), so it is scaled
 * to pixels first; trackpad pinch arrives as small pixel deltas with ctrlKey set. The exponent keeps
 * zoom-in and zoom-out symmetric: +d then −d returns to the same zoom.
 */
export function wheelZoomFactor(deltaY: number, deltaMode = 0): number {
  const px = deltaMode === 1 ? deltaY * 16 : deltaY;
  return Math.exp(-px * 0.01);
}

/** The dot grid's spacing on screen: 24 world px, doubled while it would be denser than 12 px. */
export function gridStep(zoom: number, base = 24): number {
  let step = base * zoom;
  while (step < 12) step *= 2;
  return step;
}
