import type { ReactNode } from 'react';

export type Point = readonly [x: number, y: number, z?: number];

export type PictureShape =
  | {
      kind: 'polygon';
      key: number;
      points: string;
      fill: string;
      stroke: string;
      strokeWidth: number;
    }
  | {
      kind: 'line';
      key: number;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      stroke: string;
      strokeWidth: number;
      dash?: string;
    };

export type OverlayTone = 'plain' | 'dimension' | 'danger' | 'size' | 'large' | 'muted';

export type PictureOverlay = {
  key: number;
  x: number;
  y: number;
  content: ReactNode;
  tone: OverlayTone;
};

export type PictureData = {
  shapes: PictureShape[];
  overlays: PictureOverlay[];
  viewBox: readonly [number, number, number, number];
  widthPx: number;
};

const DEFAULT_INK = 'var(--color-textColor)';

/** Geometry collector matching the approved mockup's centimetre-based projection. */
export class IsoPicture {
  readonly shapes: PictureShape[] = [];
  readonly overlays: PictureOverlay[] = [];

  private bounds = [Infinity, Infinity, -Infinity, -Infinity];
  private nextKey = 0;

  constructor(private readonly isometric = true) {}

  project([x, y, z = 0]: Point): readonly [number, number] {
    const projectedX = this.isometric ? (x - y) * 0.866 : x;
    const projectedY = this.isometric ? (x + y) * 0.5 - z : -y;

    this.bounds[0] = Math.min(this.bounds[0], projectedX);
    this.bounds[1] = Math.min(this.bounds[1], projectedY);
    this.bounds[2] = Math.max(this.bounds[2], projectedX);
    this.bounds[3] = Math.max(this.bounds[3], projectedY);

    return [projectedX, projectedY];
  }

  polygon(points: readonly Point[], fill: string, stroke = DEFAULT_INK, strokeWidth = 1.2) {
    const projected = points
      .map((point) =>
        this.project(point)
          .map((value) => value.toFixed(2))
          .join(','),
      )
      .join(' ');

    this.shapes.push({
      kind: 'polygon',
      key: this.nextKey++,
      points: projected,
      fill,
      stroke,
      strokeWidth,
    });
  }

  line(from: Point, to: Point, stroke = DEFAULT_INK, strokeWidth = 1.2, dash?: string) {
    const [x1, y1] = this.project(from);
    const [x2, y2] = this.project(to);
    this.shapes.push({
      kind: 'line',
      key: this.nextKey++,
      x1,
      y1,
      x2,
      y2,
      stroke,
      strokeWidth,
      dash,
    });
  }

  label(point: Point, content: ReactNode, tone: OverlayTone = 'plain') {
    const [x, y] = this.project(point);
    this.overlays.push({ key: this.nextKey++, x, y, content, tone });
  }

  finish(maxHeight = 330, paddingRatio = 0.12): PictureData {
    const [x0, y0, x1, y1] = this.bounds;
    const contentWidth = Math.max(1, x1 - x0);
    const contentHeight = Math.max(1, y1 - y0);
    const padding = Math.max(contentWidth, contentHeight) * paddingRatio;
    const viewBox = [
      x0 - padding,
      y0 - padding,
      contentWidth + padding * 2,
      contentHeight + padding * 2,
    ] as const;

    return {
      shapes: this.shapes,
      overlays: this.overlays.map((overlay) => ({
        ...overlay,
        x: ((overlay.x - viewBox[0]) / viewBox[2]) * 100,
        y: ((overlay.y - viewBox[1]) / viewBox[3]) * 100,
      })),
      viewBox,
      widthPx: Math.round((maxHeight * viewBox[2]) / viewBox[3]),
    };
  }
}
