/**
 * R7 · ARTWORK ON THE PARTS — the model of the `artwork` tool of the PARTS canvas (FABRIC RENDER).
 *
 * An artwork is a BOM line of section DECORATION (a print, an embroidery, a patch); its picture is
 * per colourway through `design_asset_binding`, exactly like hardware. WHERE it sits is a
 * `design_asset_placement` row: ONE mark on ONE bench flat, its geometry the card's own
 * `TechCardAnnotation` — here a POLYGON of exactly four points, TL, TR, BR, BL, fractions of that
 * flat's picture (70-ROUND7-SPEC override 3: a quad, so a corner can move alone = free perspective).
 *
 * Pure functions only: the canvas (`parts-canvas.tsx`) owns the gestures and the optimistic copy.
 * Geometry that turns (rotation, uniform scale) is done in PIXELS of the side, never in fractions:
 * a flat is not square, and turning fractions would shear the box.
 */
import type {
  GetDesignBandResponse,
  common_DesignAsset,
  common_DesignAssetPlacement,
  common_DesignPicture,
  common_TechCardAnnotation,
} from 'api/proto-http/admin';

import { assetFull, assetLabel, placementsOnPicture } from '../assets/model';
import { boundAssetsByPair, pairKey, type ClothSlot } from '../pattern/slot-fabrics';
import { benchSides } from '../render/model';
import { normaliseViewKey, viewLabel } from '../views';

/** The server refuses a render with more placed artworks than this (`too_many_artworks`). */
export const MAX_RENDER_ARTWORKS = 4;

/** The BOM section an artwork slot is (mirrors `isLabelSlot`; MATERIALS reads the same rule). */
export const ARTWORK_SECTION = 'TECH_CARD_BOM_SECTION_DECORATION';

export const isArtworkSection = (section?: string | null): boolean =>
  (section ?? '').trim() === ARTWORK_SECTION;

/**
 * THE CUT-OUT MARKER (70-ROUND7-SPEC override 2): an artwork asset whose note carries `· cut` is
 * already an alpha PNG (the note ENDS with it — `pattern/fabrics-hardware.tsx`, `markCut`) and is drawn as is; anything else is the white-ground picture and is drawn
 * with `mix-blend-mode: multiply` so its white ground drops out over the cloth.
 * ⚠ The writer of the marker is the MATERIALS side (auto cut-out); this reader must match it.
 */
export const ARTWORK_CUT_MARK = '· cut';

export const artworkIsCut = (a?: common_DesignAsset | null): boolean =>
  (a?.note ?? '').trimEnd().endsWith(ARTWORK_CUT_MARK);

/** The asset's words without the cut-out marker. */
const wordsOf = (a: common_DesignAsset): string =>
  (a.note ?? '').replace(/\s*·\s*cut\s*$/, '').trim();

export type Pt = { x: number; y: number };
/** TL, TR, BR, BL. */
export type Quad = [Pt, Pt, Pt, Pt];

/** One artwork of the colourway, ready for the pack and the canvas. */
export type CanvasArtwork = {
  assetId: number;
  bomItemId: number;
  /** The slot's name — what the person called it («chest embroidery»). */
  name: string;
  /** The technique words (the slot's spec), the placement's note. */
  technique: string;
  url: string;
  cut: boolean;
  asset: common_DesignAsset;
};

/** The artworks bound to `colorwayId`, in slot order. Slots of other sections are ignored. */
export function artworksOf(
  band: GetDesignBandResponse,
  colorwayId: number,
  slots: readonly ClothSlot[] | undefined,
): CanvasArtwork[] {
  const byPair = boundAssetsByPair(band);
  const out: CanvasArtwork[] = [];
  const seen = new Set<number>();
  for (const slot of slots ?? []) {
    if (!isArtworkSection(slot.section) || slot.bomItemId <= 0) continue;
    const asset = byPair.get(pairKey(colorwayId, slot.bomItemId));
    const id = asset?.id ?? 0;
    if (!asset || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    out.push({
      assetId: id,
      bomItemId: slot.bomItemId,
      name: (slot.name ?? '').trim() || assetLabel(asset),
      technique: (slot.detail.trim() || wordsOf(asset)).slice(0, 200),
      url: assetFull(asset),
      cut: artworkIsCut(asset),
      asset,
    });
  }
  return out;
}

/** The flat picture standing in each side (view → picture id) — where a placement may hang. */
export function flatPictureIds(band: GetDesignBandResponse): Map<string, number> {
  const m = new Map<string, number>();
  for (const side of benchSides(band)) {
    const id = side.picture?.id ?? side.slot?.pictureId ?? 0;
    if (id > 0) m.set(side.view, id);
  }
  return m;
}

/**
 * T29 · ARTWORK MARKS LEFT ON A REPLACED FLAT. A mark hangs off a PICTURE; when a side's slot takes
 * a new flat the mark stays on the old picture, nothing draws it on the side and the render leaves
 * the artwork out. These are such marks of ONE side, each with the old picture it stands on:
 *
 *   stray   its picture stands in no bench row at all (any kind, any colourway) — a picture still
 *           standing somewhere is that slot's own mark and is never moved;
 *   known   its picture is in the band (bench, runs, batches, outputs) — its pixels are needed;
 *   mine    the side's saved colour map was painted on that picture (`mapBaseMediaId` = its media),
 *           or the side's flat is an edit / crop of it (replaced_by, derived_from), or — the
 *           weakest — its ghost view is this side. A picture claimed by several sides is nobody's.
 */
export type StrayMark = { placement: common_DesignAssetPlacement; picture: common_DesignPicture };

export function strayMarks(
  band: GetDesignBandResponse,
  sides: readonly { view: string; pictureId: number; mapBaseMediaId: number }[],
): Map<string, StrayMark[]> {
  const out = new Map<string, StrayMark[]>();
  const marks = band.assetPlacements ?? [];
  if (marks.length === 0) return out;
  const pics = new Map<number, common_DesignPicture>();
  const add = (p?: common_DesignPicture | null) => {
    const id = p?.id ?? 0;
    if (id > 0 && !pics.has(id)) pics.set(id, p as common_DesignPicture);
  };
  const standing = new Set<number>();
  for (const row of band.bench ?? []) {
    const id = row.picture?.id || row.pictureId || 0;
    if (id > 0) standing.add(id);
    add(row.picture);
  }
  // The band's pictures (as `bandPictures` reads them — not imported: that module is a screen).
  (band.runs ?? []).forEach((r) => (r.pictures ?? []).forEach(add));
  (band.batches ?? []).forEach((b) => (b.pictures ?? []).forEach(add));
  (band.outputs ?? []).forEach((o) => add(o.picture));

  /** `old` is an ancestor of `cur` through edits (replaced_by) or crops/flattens (derived_from). */
  const leadsTo = (old: common_DesignPicture, cur: number): boolean => {
    let p: common_DesignPicture | undefined = old;
    for (let i = 0; p && i < 16; i += 1) {
      const next = p.replacedBy ?? 0;
      if (next <= 0) break;
      if (next === cur) return true;
      p = pics.get(next);
    }
    let c = pics.get(cur);
    for (let i = 0; c && i < 16; i += 1) {
      const parent = c.derivedFrom ?? 0;
      if (parent <= 0) break;
      if (parent === old.id) return true;
      c = pics.get(parent);
    }
    return false;
  };

  for (const placement of marks) {
    const pid = placement.pictureId ?? 0;
    if (pid <= 0 || standing.has(pid)) continue;
    const picture = pics.get(pid);
    if (!picture) continue;
    const media = picture.media?.id ?? 0;
    const strong = sides.filter(
      (s) =>
        s.pictureId > 0 &&
        ((media > 0 && s.mapBaseMediaId === media) || leadsTo(picture, s.pictureId)),
    );
    const ghost = normaliseViewKey(picture.ghostView);
    const claim =
      strong.length > 0 ? strong : sides.filter((s) => s.pictureId > 0 && s.view === ghost);
    if (claim.length !== 1) continue;
    const view = claim[0].view;
    const list = out.get(view) ?? [];
    list.push({ placement, picture });
    out.set(view, list);
  }
  return out;
}

/* ─────────────────────────── wire ↔ quad ─────────────────────────── */

export const num = (d?: { value?: string } | null): number => {
  const v = parseFloat(d?.value ?? '');
  return Number.isFinite(v) ? v : 0;
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * The quad of a stored mark. Four points = as stored; two (an older DIM box) or any other count =
 * the axis-aligned box around them. Nothing readable = null (the mark is not drawn).
 */
export function quadOfPlacement(p: common_DesignAssetPlacement): Quad | null {
  const pts = (p.annotation?.points ?? []).map((q) => ({ x: num(q.x), y: num(q.y) }));
  if (pts.length === 4) return pts as Quad;
  if (pts.length < 2) return null;
  const xs = pts.map((q) => q.x);
  const ys = pts.map((q) => q.y);
  return boxQuad(
    { x: Math.min(...xs), y: Math.min(...ys) },
    { x: Math.max(...xs), y: Math.max(...ys) },
  );
}

/** Six decimals is the server's ceiling; four resolve a tenth of a millimetre on a flat. */
export const dec = (v: number) => ({ value: String(Number(clamp01(v).toFixed(4))) });

/** The annotation the server stores: POLYGON (3..40 points) of the four corners, in frame. */
export function annotationOfQuad(q: Quad): common_TechCardAnnotation {
  return {
    kind: 'TECH_CARD_ANNOTATION_KIND_POLYGON',
    points: q.map((p) => ({ x: dec(p.x), y: dec(p.y) })),
  } as common_TechCardAnnotation;
}

/* ─────────────────────────── geometry ─────────────────────────── */

/** An axis-aligned box from two opposite corners, as TL, TR, BR, BL. */
export function boxQuad(a: Pt, b: Pt): Quad {
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

export const scaleQuad = (q: Quad, sx: number, sy: number): Quad =>
  q.map((p) => ({ x: p.x * sx, y: p.y * sy })) as Quad;

export const centreOf = (q: Quad): Pt => ({
  x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4,
  y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4,
});

/** Moves the quad by (dx, dy), held inside a w × h frame. */
export function moveQuad(q: Quad, dx: number, dy: number, w: number, h: number): Quad {
  const xs = q.map((p) => p.x);
  const ys = q.map((p) => p.y);
  const cdx = Math.min(w - Math.max(...xs), Math.max(-Math.min(...xs), dx));
  const cdy = Math.min(h - Math.max(...ys), Math.max(-Math.min(...ys), dy));
  return q.map((p) => ({ x: p.x + cdx, y: p.y + cdy })) as Quad;
}

/** Turns all four corners around the centre by `rad`. */
export function rotateQuad(q: Quad, rad: number): Quad {
  const c = centreOf(q);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return q.map((p) => ({
    x: c.x + (p.x - c.x) * cos - (p.y - c.y) * sin,
    y: c.y + (p.x - c.x) * sin + (p.y - c.y) * cos,
  })) as Quad;
}

/** Uniform scale around the centre by `k` — the shape (and its perspective) is kept. */
export function growQuad(q: Quad, k: number): Quad {
  const c = centreOf(q);
  return q.map((p) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k })) as Quad;
}

/** One corner moved alone — free perspective. */
export function withCorner(q: Quad, i: number, p: Pt): Quad {
  const out = q.slice() as Quad;
  out[i] = p;
  return out;
}

/** Every corner held inside a w × h frame. */
export const clampQuad = (q: Quad, w: number, h: number): Quad =>
  q.map((p) => ({ x: Math.min(w, Math.max(0, p.x)), y: Math.min(h, Math.max(0, p.y)) })) as Quad;

/** Point in a (possibly non-convex) quad — even-odd. */
export function insideQuad(p: Pt, q: Quad): boolean {
  let hit = false;
  for (let i = 0, j = 3; i < 4; j = i, i += 1) {
    const a = q[i];
    const b = q[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      hit = !hit;
  }
  return hit;
}

/**
 * The rotation handle: `off` px outward from the middle of the top edge (TL→TR). Given the frame
 * (`w` × `h`), a handle that would leave it (a box at the top of the flat) moves below the box,
 * outward from the bottom edge (BR→BL) — the pointer is held inside the frame, so it must be too.
 */
export function rotationHandle(q: Quad, off: number, w?: number, h?: number): { from: Pt; at: Pt } {
  const top = handleOff(q, q[0], q[1], off);
  if (w === undefined || h === undefined) return top;
  const inFrame = (p: Pt) => p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h;
  if (inFrame(top.at)) return top;
  const bottom = handleOff(q, q[2], q[3], off);
  return inFrame(bottom.at) ? bottom : top;
}

function handleOff(q: Quad, a: Pt, b: Pt, off: number): { from: Pt; at: Pt } {
  const from = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const ex = b.x - a.x;
  const ey = b.y - a.y;
  const len = Math.hypot(ex, ey) || 1;
  let nx = ey / len;
  let ny = -ex / len;
  const c = centreOf(q);
  // Outward = away from the centre.
  if ((from.x - c.x) * nx + (from.y - c.y) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { from, at: { x: from.x + nx * off, y: from.y + ny * off } };
}

/** The approximate turn of the quad, degrees (the top edge against the horizontal). */
export const quadAngleDeg = (q: Quad): number =>
  (Math.atan2(q[1].y - q[0].y, q[1].x - q[0].x) * 180) / Math.PI;

/* ─────────────────────────── what the model gets ─────────────────────────── */

/**
 * One line per placed artwork of this colourway on the bench flats — the same list the server
 * freezes at launch (`chest embroidery on front`).
 */
export function artworkModelLines(band: GetDesignBandResponse, arts: CanvasArtwork[]): string[] {
  if (arts.length === 0) return [];
  const byAsset = new Map(arts.map((a) => [a.assetId, a]));
  const lines: string[] = [];
  for (const [view, pictureId] of flatPictureIds(band)) {
    for (const p of placementsOnPicture(band, pictureId, [...byAsset.keys()])) {
      const a = byAsset.get(p.assetId ?? 0);
      if (a && quadOfPlacement(p)) lines.push(`${a.name} on ${viewLabel(view)}`);
    }
  }
  return lines;
}
