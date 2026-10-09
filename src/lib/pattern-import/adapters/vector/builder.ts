// F12 · IR page builder shared by the HPGL and SVG adapters: interns styles per page, numbers
// paths/texts, keeps layer order, drops degenerate polylines. Coordinates arrive FINAL (mm, y-up).

import type {
  BoxMm,
  FileId,
  IRPage,
  IRPath,
  IRText,
  PageIndex,
  PathSource,
  PtMm,
  SourceFileInfo,
  SourceKind,
  Style,
  StyleId,
} from '../../types';

export type StyleSpec = Omit<Style, 'id'>;

/** Two points closer than this (mm) are one point: consecutive duplicates and the closing vertex. */
export const SAME_POINT_MM = 1e-3;

export class PageBuilder {
  private styles: Style[] = [];
  private styleKey = new Map<string, StyleId>();
  private paths: IRPath[] = [];
  private texts: IRText[] = [];
  private layers: string[] = [];
  private layerSet = new Set<string>();
  dropped = 0;

  constructor(
    readonly file: FileId,
    readonly page: PageIndex,
  ) {}

  layer(name: string | null): void {
    if (name == null || this.layerSet.has(name)) return;
    this.layerSet.add(name);
    this.layers.push(name);
  }

  style(spec: StyleSpec): StyleId {
    const key = JSON.stringify([
      spec.strokeRgb,
      round(spec.widthMm),
      spec.dash?.map(round) ?? null,
      spec.layer,
      spec.fill,
      spec.clip,
    ]);
    const hit = this.styleKey.get(key);
    if (hit !== undefined) return hit;
    const id = this.styles.length;
    this.styles.push({ id, ...spec });
    this.styleKey.set(key, id);
    this.layer(spec.layer);
    return id;
  }

  /**
   * Adds a polyline. Consecutive duplicates are removed; a polyline whose last point returns to
   * its first is marked closed and the duplicate vertex dropped (`closed` may also be forced).
   */
  path(raw: PtMm[], closed: boolean, style: StyleId, src: PathSource): IRPath | null {
    const pts: PtMm[] = [];
    for (const p of raw) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      const last = pts[pts.length - 1];
      if (
        last &&
        Math.abs(last.x - p.x) <= SAME_POINT_MM &&
        Math.abs(last.y - p.y) <= SAME_POINT_MM
      )
        continue;
      pts.push(p);
    }
    if (pts.length >= 3) {
      const a = pts[0];
      const z = pts[pts.length - 1];
      if (Math.abs(a.x - z.x) <= SAME_POINT_MM && Math.abs(a.y - z.y) <= SAME_POINT_MM) {
        pts.pop();
        closed = true;
      }
    }
    if (pts.length < 2) {
      this.dropped++;
      return null;
    }
    if (pts.length === 2) closed = false;
    const p: IRPath = { id: this.paths.length, pts, closed, style, src };
    this.paths.push(p);
    return p;
  }

  text(t: Omit<IRText, 'id'>): IRText {
    const out: IRText = { id: this.texts.length, ...t };
    this.texts.push(out);
    this.layer(t.layer);
    return out;
  }

  build(widthMm: number, heightMm: number): IRPage {
    return {
      file: this.file,
      page: this.page,
      widthMm,
      heightMm,
      styles: this.styles,
      paths: this.paths,
      texts: this.texts,
      rasters: [],
      layers: this.layers,
    };
  }
}

const round = (v: number) => Math.round(v * 1e4) / 1e4;

export function bboxOf(pts: PtMm[]): BoxMm {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/** SHA-256 hex via WebCrypto — present in workers, browsers and node ≥ 19. */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const d = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function fileInfo(
  file: { id: FileId; name: string; bytes: ArrayBuffer },
  kind: SourceKind,
  producer?: string,
): Promise<SourceFileInfo> {
  const info: SourceFileInfo = {
    id: file.id,
    name: file.name,
    bytes: file.bytes.byteLength,
    sha256: await sha256Hex(file.bytes),
    kind,
    pages: 1,
  };
  if (producer) info.producer = producer;
  return info;
}
