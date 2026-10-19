// assemble · D6 composite — ONE PDF is ONE garment: every tile sheet of the files is imported.
//
// Each sheet is assembled exactly as before, on its own (`assembleSheetDetailed`: its own grid, its
// tiles numbered from 1, its own file-per-size alignment) — this module never touches per-sheet
// registration. The registered sheets are then laid next to each other, left to right in sheet
// order, `SHEET_GAP_MM` apart: they never overlap (no fill region can run from one into the next)
// and sheet 0 keeps exactly the frame it has alone (a one-sheet file, or an older record of sheet
// 0, moves by nothing). Pen styles are merged by look (the same pen on two sheets is ONE style, so
// one legend class and one size); path and text ids are renumbered; `parts` maps the composite.
//
// Whether two sheets are the same pattern drawn twice (A4 + Letter tiles, a copyshop page + tiles)
// is decided on the PIECES, after the fill (pieces/sheets.ts) — never by dropping a sheet here.

import type {
  BoxMm,
  Chain,
  ChainAmbiguity,
  ChainSet,
  ClassEvidence,
  LineClass,
  GridOverride,
  IRPath,
  IRText,
  PageClassification,
  Progress,
  Sheet,
  SheetPart,
  SourceDoc,
  Style,
} from 'lib/pattern-import/types';

import { assembleSheetDetailed, pitchRank, type SheetReport } from './sheet';

/**
 * D6: the gap between two tile sheets laid side by side in one import, mm — far beyond any snap,
 * raster cell or bridge length, so no region of one sheet can run into the next.
 */
export const SHEET_GAP_MM = 300;

/** The tile sheets the page classes carry (tile pages only), ascending. */
export const tileSheetIds = (classes: readonly Pick<PageClassification, 'cls' | 'sheet'>[]) =>
  [...new Set(classes.filter((c) => c.cls === 'tile').map((c) => c.sheet ?? 0))].sort(
    (a, b) => a - b,
  );

/** A style's clip box moved by dx (F1 keeps `<kind><op>:x0,y0,x1,y1`; anything else stays). */
function shiftClip(clip: string | null, dx: number, dy: number): string | null {
  if (!clip || (!dx && !dy)) return clip;
  const k = clip.indexOf(':');
  const nums = clip
    .slice(k + 1)
    .split(',')
    .map(Number);
  if (k < 0 || nums.length !== 4 || nums.some((v) => !Number.isFinite(v))) return clip;
  return `${clip.slice(0, k + 1)}${[nums[0] + dx, nums[1] + dy, nums[2] + dx, nums[3] + dy].join(',')}`;
}

const shiftBox = (b: BoxMm, dx: number, dy: number): BoxMm => ({
  minX: b.minX + dx,
  minY: b.minY + dy,
  maxX: b.maxX + dx,
  maxY: b.maxY + dy,
});

/**
 * The raster grids downstream (fill 0.5 mm, face roles 1.5 mm, the face pass) start at the drawing's
 * box corner. A sheet's lines must fall on the SAME grid phase in the composite as alone, so its
 * pieces come out as they did before D6: the LARGEST sheet (by drawing area) is the anchor — placed
 * first, unshifted, so the composite's corner is its own and every grid it had alone is the grid
 * it has now (the face pass caps its cell by the largest sheet too: `faceCapBox`); every other
 * sheet goes to its right with its box bottom on the anchor's (dy) and dx rounded up so that
 * (dx − (minX_anchor − minXₖ)) is a multiple of `GRID_PHASE_MM` (0.5, 1, 1.5, 2.5, 3, 5, 10 and 15
 * divide it).
 */
const GRID_PHASE_MM = 30;
const finite = (v: number) => (Number.isFinite(v) ? v : 0);

/**
 * Every tile sheet of `classes` in one drawing. The hand grid applies to the sheet its first page
 * is on (`override.originPage`); the other sheets register on their own. One sheet = exactly
 * `assembleSheetDetailed` of it (plus `parts`).
 */
export function assembleAllSheets(
  docs: SourceDoc[],
  classes: PageClassification[],
  override?: GridOverride,
  progress?: Progress,
  only?: readonly number[],
): { sheet: Sheet; reports: SheetReport[] } {
  const ids = tileSheetIds(classes).filter((k) => !only?.length || only.includes(k));
  const ownerOf = (o: GridOverride) =>
    classes.find(
      (c) => c.cls === 'tile' && c.file === o.originPage.file && c.page === o.originPage.page,
    )?.sheet ?? 0;
  const gridSheet = override ? ownerOf(override) : null;
  const regs = ids.map((k, i) => {
    const sub: Progress | undefined = progress
      ? (d, t, n) => progress(i + d / Math.max(1, t), ids.length, n)
      : undefined;
    return assembleSheetDetailed(docs, classes, k, gridSheet === k ? override : undefined, sub);
  });
  const parts: SheetPart[] = [];
  const styles: Style[] = [];
  const styleIds = new Map<string, number>();
  const paths: IRPath[] = [];
  const texts: IRText[] = [];
  const out: Sheet = {
    id: ids[0] ?? 0,
    poses: [],
    pairs: [],
    bbox: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    missing: [],
    paths,
    texts,
    rasters: [],
    styles,
    warnings: [],
    parts,
  };
  const multi = regs.length > 1;
  const areaOf = (b: BoxMm) =>
    Number.isFinite(b.minX) ? (b.maxX - b.minX) * (b.maxY - b.minY) : 0;
  let anchor = 0;
  regs.forEach((r, i) => {
    if (areaOf(r.sheet.bbox) > areaOf(regs[anchor].sheet.bbox)) anchor = i;
  });
  const order = [anchor, ...regs.map((_, i) => i).filter((i) => i !== anchor)];
  const b0 = regs[anchor]?.sheet.bbox;
  let x = 0;
  const placedParts = new Map<number, SheetPart>();
  order.forEach((i, n) => {
    const { sheet: s, report } = regs[i];
    const k = ids[i];
    const want = n ? finite(b0.minX) - finite(s.bbox.minX) : 0;
    const dx = n ? x + ((((want - x) % GRID_PHASE_MM) + GRID_PHASE_MM) % GRID_PHASE_MM) : 0;
    const dy = n ? finite(b0.minY) - finite(s.bbox.minY) : 0;
    const remap = s.styles.map((st) => {
      const t: Style = { ...st, clip: shiftClip(st.clip, dx, dy) };
      const key = JSON.stringify([t.strokeRgb, t.widthMm, t.dash, t.layer, t.fill, t.clip]);
      let id = styleIds.get(key);
      if (id === undefined) {
        id = styles.length;
        styles.push({ ...t, id });
        styleIds.set(key, id);
      }
      return id;
    });
    for (const p of s.paths)
      paths.push({
        ...p,
        id: paths.length,
        pts: dx || dy ? p.pts.map((v) => ({ x: v.x + dx, y: v.y + dy })) : p.pts,
        style: remap[p.style] ?? p.style,
      });
    for (const t of s.texts)
      texts.push({
        ...t,
        id: texts.length,
        anchor: { x: t.anchor.x + dx, y: t.anchor.y + dy },
        bbox: shiftBox(t.bbox, dx, dy),
      });
    for (const r of s.rasters) out.rasters.push({ ...r, bbox: shiftBox(r.bbox, dx, dy) });
    for (const p of s.poses)
      out.poses.push(
        dx || dy
          ? { ...p, toSheet: { ...p.toSheet, e: p.toSheet.e + dx, f: p.toSheet.f + dy } }
          : p,
      );
    out.pairs.push(...s.pairs);
    // UXHOOKS: a missing cell's paper moves with its sheet
    const mv = (b: BoxMm) => (dx || dy ? shiftBox(b, dx, dy) : b);
    out.missing.push(
      ...s.missing.map((m) => ({
        ...m,
        sheet: k,
        ...(m.box ? { box: mv(m.box) } : {}),
        ...(m.open ? { open: mv(m.open) } : {}),
      })),
    );
    // REG (D3): a refused placement of any one sheet refuses the drawing
    if (s.refused?.length)
      (out.refused ??= []).push(...s.refused.map((r) => (multi ? `sheet ${k + 1}: ${r}` : r)));
    out.warnings.push(...s.warnings.map((w) => (multi ? `sheet ${k + 1}: ${w}` : w)));
    if (!multi) out.overview = s.overview;
    // TILESTEP: the drawing reports its least-founded pitch (sheet.ts PITCH_RANK)
    if (s.pitchFrom && (!out.pitchFrom || pitchRank(s.pitchFrom) < pitchRank(out.pitchFrom)))
      out.pitchFrom = s.pitchFrom;
    const [tw, th] = report.tileExtent;
    const w = Math.max(
      Number.isFinite(tw) ? tw : 0,
      Number.isFinite(s.bbox.maxX) ? s.bbox.maxX : 0,
    );
    const h = Math.max(Number.isFinite(th) ? th : 0, 0);
    placedParts.set(k, {
      sheet: k,
      pages: s.poses.map((p) => ({ file: p.file, page: p.page })),
      dx,
      dy,
      box: {
        minX: dx + Math.min(0, finite(s.bbox.minX)),
        minY: dy + Math.min(0, finite(s.bbox.minY)),
        maxX: dx + w,
        maxY: dy + Math.max(h, finite(s.bbox.maxY)),
      },
      draw: Number.isFinite(s.bbox.minX) ? shiftBox(s.bbox, dx, dy) : undefined,
      anchor: n === 0,
      maxResidualMm: Math.max(0, ...s.poses.map((p) => p.residualMm)),
      missing: s.missing.length,
      ...(s.pitchFrom ? { pitchFrom: s.pitchFrom } : {}),
    });
    x = dx + w + SHEET_GAP_MM;
  });
  // the parts in sheet order (the layout order is the anchor first)
  for (const k of ids) parts.push(placedParts.get(k)!);
  for (const p of paths)
    for (const v of p.pts) {
      if (v.x < out.bbox.minX) out.bbox.minX = v.x;
      if (v.y < out.bbox.minY) out.bbox.minY = v.y;
      if (v.x > out.bbox.maxX) out.bbox.maxX = v.x;
      if (v.y > out.bbox.maxY) out.bbox.maxY = v.y;
    }
  if (!paths.length) out.bbox = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  if (multi)
    out.warnings.unshift(
      `${regs.length} tile sheets — all imported side by side (one file is one garment)`,
    );
  return { sheet: out, reports: regs.map((r) => r.report) };
}

/**
 * The box the face pass caps its raster cell by (pieces/faces `faceCell`): a drawing of several
 * sheets takes the largest sheet's own drawing — the cell each sheet had alone at most, so the
 * composite is never read coarser than its largest sheet alone.
 */
export function faceCapBox(sheet: Pick<Sheet, 'bbox' | 'parts'>): BoxMm {
  const a = sheet.parts?.find((p) => p.anchor)?.draw;
  return (sheet.parts?.length ?? 0) > 1 && a ? a : sheet.bbox;
}

/** The part (tile sheet) of the drawing a point lies on: inside its box, else the nearest. */
export function partAt(parts: readonly SheetPart[] | undefined, p: { x: number; y: number }) {
  if (!parts?.length) return null;
  let best = parts[0];
  let bd = Infinity;
  for (const q of parts) {
    const d = Math.max(q.box.minX - p.x, 0, p.x - q.box.maxX);
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  return best;
}

/** A point is on this part (its box, half the gap around it). */
const onPart = (part: SheetPart, p: { x: number }) =>
  p.x >= part.box.minX - SHEET_GAP_MM / 2 && p.x <= part.box.maxX + SHEET_GAP_MM / 2;

/**
 * D6: one tile sheet of a composite drawing as a drawing of its own — its paths, texts, rasters,
 * tiles and box (the box it had alone: the same raster grids), no parts. For the passes that must
 * read one sheet at a time (pieces/fill: the grade model, the wall model, frames).
 */
export function sheetView(sheet: Sheet, part: SheetPart): Sheet {
  const pages = new Set(part.pages.map((p) => `${p.file}:${p.page}`));
  return {
    ...sheet,
    id: part.sheet,
    bbox: part.draw ?? part.box,
    poses: sheet.poses.filter((p) => pages.has(`${p.file}:${p.page}`)),
    pairs: sheet.pairs.filter(
      (p) => pages.has(`${p.from.file}:${p.from.page}`) && pages.has(`${p.to.file}:${p.to.page}`),
    ),
    missing: sheet.missing.filter((m) => m.sheet == null || m.sheet === part.sheet),
    overview: undefined,
    paths: sheet.paths.filter((p) => p.pts.length > 0 && onPart(part, p.pts[0])),
    texts: sheet.texts.filter((t) => onPart(part, t.anchor)),
    rasters: sheet.rasters.filter((r) => onPart(part, { x: r.bbox.minX })),
    parts: undefined,
  };
}

/**
 * D6: the chain set as one tile sheet sees it — the chains of the other sheets keep their ids (the
 * families and walls refer to chains by id) but carry no points, and leave every class, bundle and
 * list. Masked chains are skipped by every pass that needs two points.
 */
export function chainView(set: ChainSet, parts: readonly SheetPart[], sheet: number): ChainSet {
  const part = parts.find((p) => p.sheet === sheet);
  if (!part) return set;
  const keep = new Set<number>();
  const chains: Chain[] = set.chains.map((c) => {
    if (c.pts.length && partAt(parts, c.pts[0])?.sheet === sheet) {
      keep.add(c.id);
      return c;
    }
    return { ...c, pts: [], closed: false, ranges: [], lengthMm: 0 };
  });
  return {
    ...set,
    chains,
    classes: set.classes.map((k) => {
      const ids = k.chains.filter((id) => keep.has(id));
      return {
        ...k,
        chains: ids,
        totalLengthMm: ids.reduce((s, id) => s + (set.chains[id]?.lengthMm ?? 0), 0),
      };
    }),
    bundles: set.bundles.filter((b) => b.chains.every((id) => keep.has(id))),
    orphans: set.orphans.filter((id) => keep.has(id)),
    ...(set.ambiguities
      ? { ambiguities: set.ambiguities.filter((a) => a.chains.every((id) => keep.has(id))) }
      : {}),
  };
}

/**
 * D6: the chain sets of the tile sheets, each read on its own sheet (`sheetView`: its pens, its
 * legend, its texts — as the sheet imported alone), joined into one set for the composite. Chain,
 * bundle and class ids are renumbered. Size rows are one row across the sheets when they carry the
 * same size label, or — no label read (a declared-dash run) — the same pen (colour, width, dash,
 * layer) at the same nesting rank: one size drawn on two sheets. Every other row stays the sheet's
 * own; size rows that do not pair up are caught by the per-sheet legend check (pieces/sheets
 * `sheetLegend`), never merged here on a guess.
 */
export function joinSheetChains(
  sets: readonly { sheet: number; set: ChainSet }[],
  styles: readonly Style[],
): ChainSet {
  if (sets.length === 1) return sets[0].set;
  const chains: Chain[] = [];
  const classes: LineClass[] = [];
  const bundles: ChainSet['bundles'] = [];
  const orphans: number[] = [];
  const ambiguities: ChainAmbiguity[] = [];
  const warnings: string[] = [];
  const sizeRow = new Map<string, number>();
  for (const { sheet, set } of sets) {
    const off = chains.length;
    const ch = (id: number) => id + off;
    for (const c of set.chains) chains.push({ ...c, id: ch(c.id) });
    const clsMap = new Map<number, number>();
    for (const k of set.classes) {
      const ids = k.chains.map(ch);
      const evidence: ClassEvidence[] = k.evidence.map((e) =>
        e.kind === 'face-stray' && e.byWhy
          ? { ...e, byWhy: e.byWhy.map((b) => ({ ...b, chains: b.chains.map(ch) })) }
          : e,
      );
      const label = k.role === 'size' ? sizeRowKey(k, set, styles) : '';
      const at = label ? sizeRow.get(label) : undefined;
      if (at != null) {
        const h = classes[at];
        classes[at] = {
          ...h,
          chains: [...h.chains, ...ids],
          totalLengthMm: h.totalLengthMm + k.totalLengthMm,
          evidence: [...h.evidence, ...evidence.filter((e) => e.kind !== 'nesting-order')],
          confidence: Math.min(h.confidence, k.confidence),
        };
        clsMap.set(k.id, at);
        continue;
      }
      const id = classes.length;
      classes.push({ ...k, id, chains: ids, evidence });
      clsMap.set(k.id, id);
      if (label) sizeRow.set(label, id);
    }
    for (const b of set.bundles)
      bundles.push({
        ...b,
        id: bundles.length,
        chains: b.chains.map(ch),
        endsOn: [
          b.endsOn[0] == null ? null : ch(b.endsOn[0]),
          b.endsOn[1] == null ? null : ch(b.endsOn[1]),
        ],
      });
    orphans.push(...set.orphans.map(ch));
    for (const a of set.ambiguities ?? [])
      ambiguities.push({
        ...a,
        message: `sheet ${sheet + 1}: ${a.message}`,
        classes: [...new Set(a.classes.map((c) => clsMap.get(c) ?? c))],
        chains: a.chains.map(ch),
      });
    warnings.push(...set.warnings.map((w) => `sheet ${sheet + 1}: ${w}`));
  }
  return { chains, classes, bundles, orphans, ambiguities, warnings };
}

/** A size row's identity across tile sheets: its label, else its pen and nesting rank. */
function sizeRowKey(k: LineClass, set: ChainSet, styles: readonly Style[]): string {
  const label = k.sizeLabel?.trim().toLowerCase();
  if (label) return `label:${label}`;
  const len = new Map<number, number>();
  for (const id of k.chains) {
    const ch = set.chains[id];
    if (ch) len.set(ch.style, (len.get(ch.style) ?? 0) + ch.lengthMm);
  }
  const top = [...len].sort((a, b) => b[1] - a[1])[0]?.[0];
  const st = top != null ? styles.find((x) => x.id === top) : undefined;
  if (!st) return '';
  let rank: number | null = null;
  for (const e of k.evidence) if (e.kind === 'nesting-order') rank = e.rank;
  // no label and no rank: nothing proves the two rows are one size — kept apart (the per-sheet
  // legend check then asks)
  if (rank == null) return '';
  const pen = `${st.strokeRgb ? st.strokeRgb.join(',') : '-'}|${st.widthMm.toFixed(2)}|${st.dash ? st.dash.map((v) => v.toFixed(2)).join(',') : '-'}|${st.layer ?? '-'}`;
  return `pen:${pen}|rank:${rank}`;
}
