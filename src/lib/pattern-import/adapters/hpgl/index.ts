// F12 · PLT / HP-GL / HP-GL/2 adapter → canonical IR (one page, mm, y-up).
//
// Plotter frame is already y-up, so no flip. Units: 40 plotter units per mm by default (1016/in),
// overridable through `makeExtractHpgl({ unitsPerMm })` for the rare plotter that differs; IP/SC
// user scaling is honoured on top. Pen → style class: every pen gets its own `Style.layer`
// ("pen N") so a Gerber "SP1 = cut, SP2 = internal" convention survives as a class even when two
// pens share a colour. Line types → `Style.dash` in mm (HP-GL/2 default pattern table; relative
// pattern lengths resolved against the IP diagonal, else the drawing's own diagonal — warned).
// One pen-down run = one `PathSource.op`; labels are IRText (anchor = baseline-left,
// fontSizeMm = nominal em size = SI cap height / 0.7, per types.ts).

import type { ExtractFn, ExtractOpts, PtMm, SourceDoc } from '../../types';
import { PATIMPORT } from '../../types';
import { budgetOf } from '../budget';
import { bboxOf, fileInfo, PageBuilder, type StyleSpec } from '../vector/builder';
import { latin1 } from '../sniff/sniff';
import { UnsupportedFormat } from '../sniff/errors';
import { tokenize, KNOWN } from './tokenize';
import { interpret, lineTypePercents, type LineTypeState, type RawRun } from './interpret';

export type HpglOptions = {
  /** Plotter units per millimetre. Default 40 (HP-GL standard 0.025 mm). */
  unitsPerMm?: number;
};

/** HP-GL/2 default 8-pen palette (0 = white … 7 = cyan), 0..255. Pens ≥ 8 have no default colour. */
const DEFAULT_PALETTE: Record<number, [number, number, number]> = {
  0: [255, 255, 255],
  1: [0, 0, 0],
  2: [255, 0, 0],
  3: [0, 255, 0],
  4: [255, 255, 0],
  5: [0, 0, 255],
  6: [255, 0, 255],
  7: [0, 255, 255],
};

const DEFAULT_PEN_WIDTH_MM = 0.35; // HP-GL/2 default PW

export function makeExtractHpgl(options: HpglOptions = {}): ExtractFn {
  const unitsPerMm = options.unitsPerMm ?? 40;
  return async (file, opts, progress) => {
    const sag = opts?.sagittaMm ?? PATIMPORT.sagittaMm;
    const u = new Uint8Array(file.bytes);
    if (u.length === 0) throw new UnsupportedFormat('empty');
    const text = latin1(u);
    progress?.(0, 2, 'tokenize');
    const tok = tokenize(text);

    // Binary refusal: NULs or a high share of bytes that are neither commands nor escapes.
    let nul = 0;
    for (let i = 0; i < Math.min(u.length, 65536); i++) if (u[i] === 0) nul++;
    const payload = Math.max(1, tok.total - tok.escaped);
    const known = tok.cmds.filter((c) => KNOWN.has(c.op)).length;
    if (
      nul > 16 ||
      tok.garbage / payload > 0.05 ||
      known === 0 ||
      known / Math.max(1, tok.cmds.length) < 0.6
    ) {
      throw new UnsupportedFormat(
        'not-hpgl',
        `${tok.cmds.length} commands, ${known} known, ${tok.garbage} stray bytes of ${payload}`,
      );
    }

    progress?.(1, 2, 'interpret');
    const res = interpret(tok.cmds, unitsPerMm, sag, budgetOf(opts));
    if (res.peError && res.runs.length === 0)
      throw new UnsupportedFormat('hpgl-pe-malformed', res.peError);
    if (res.drawn === 0) throw new UnsupportedFormat('hpgl-no-geometry');

    const warnings = [...res.warnings];
    if (res.peError) warnings.push(`PE decode stopped early: ${res.peError}`);
    const unknown = [...new Set(tok.cmds.filter((c) => !KNOWN.has(c.op)).map((c) => c.op))];
    if (unknown.length)
      warnings.push(`unknown mnemonics skipped: ${unknown.slice(0, 12).join(' ')}`);
    if (tok.garbage) warnings.push(`${tok.garbage} stray bytes skipped`);

    const doc = await build(file, opts, res, unitsPerMm, warnings);
    progress?.(2, 2);
    return doc;
  };
}

export const extractHpgl: ExtractFn = makeExtractHpgl();

async function build(
  file: { id: string; name: string; bytes: ArrayBuffer },
  opts: ExtractOpts,
  res: ReturnType<typeof interpret>,
  unitsPerMm: number,
  warnings: string[],
): Promise<SourceDoc> {
  const mm = (p: { x: number; y: number }): PtMm => ({ x: p.x / unitsPerMm, y: p.y / unitsPerMm });

  // Page frame: plotter origin. Negative coordinates (rare: centred origins) shift the page so
  // everything sits in [0,w]×[0,h]; the shift is reported.
  const all: PtMm[] = [];
  for (const r of res.runs) for (const p of r.pts) all.push(mm(p));
  for (const l of res.labels) all.push(mm(l.anchor));
  const bb = all.length ? bboxOf(all) : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const shift = { x: bb.minX < 0 ? -bb.minX : 0, y: bb.minY < 0 ? -bb.minY : 0 };
  if (shift.x || shift.y)
    warnings.push(
      `negative plotter coordinates: page shifted by (${shift.x.toFixed(3)}, ${shift.y.toFixed(3)}) mm`,
    );
  const P = (p: { x: number; y: number }): PtMm => ({
    x: p.x / unitsPerMm + shift.x,
    y: p.y / unitsPerMm + shift.y,
  });

  // Relative LT lengths: % of the P1–P2 diagonal; without IP use the drawing's diagonal.
  const diagMm =
    res.ipDiagPu != null
      ? res.ipDiagPu / unitsPerMm
      : Math.hypot(bb.maxX - bb.minX, bb.maxY - bb.minY);
  let relWarned = false;
  const dashOf = (lt: LineTypeState): number[] | null => {
    if (lt.type === null) return null;
    const pct = lineTypePercents(lt.type);
    if (!pct) return null;
    let patternMm: number;
    if (lt.mode === 1) patternMm = lt.len;
    else {
      if (res.ipDiagPu == null && !relWarned) {
        warnings.push(
          'LT pattern length is relative and no IP was given: dash lengths scaled to the drawing diagonal (approximate)',
        );
        relWarned = true;
      }
      patternMm = (lt.len / 100) * diagMm;
    }
    return pct.map((p) => (p / 100) * patternMm);
  };

  const b = new PageBuilder(file.id, 0);
  const styleFor = (r: RawRun): StyleSpec => ({
    strokeRgb: res.penRgb.get(r.pen) ?? DEFAULT_PALETTE[r.pen] ?? null,
    widthMm: r.fill
      ? 0
      : res.penWidthMm.get(r.pen) ?? res.penWidthMm.get(-1) ?? DEFAULT_PEN_WIDTH_MM,
    dash: r.fill ? null : dashOf(r.lt),
    layer: `pen ${r.pen}`,
    fill: r.fill,
    clip: null,
  });

  for (const r of res.runs) {
    if (r.fill && opts?.keepFills === false) continue;
    const sid = b.style(styleFor(r));
    b.path(r.pts.map(P), r.closed, sid, { file: file.id, page: 0, op: r.op, sub: 0, block: null });
  }
  for (const l of res.labels) {
    const a = P(l.anchor);
    const capMm = l.capHeightPu / unitsPerMm;
    const wMm = l.widthPu / unitsPerMm;
    const u = l.dir;
    const v = { x: -u.y, y: u.x };
    const corners = [
      [0, -0.25 * capMm],
      [wMm, -0.25 * capMm],
      [wMm, capMm],
      [0, capMm],
    ].map(([s, t]) => ({ x: a.x + s * u.x + t * v.x, y: a.y + s * u.y + t * v.y }));
    b.text({
      text: l.text,
      anchor: a,
      bbox: bboxOf(corners),
      fontSizeMm: capMm / 0.7,
      rotationDeg: (Math.atan2(u.y, u.x) * 180) / Math.PI,
      layer: null,
      src: { file: file.id, page: 0, op: l.op, sub: l.line, block: null },
    });
  }
  if (b.dropped) warnings.push(`${b.dropped} single-point pen-down runs dropped`);

  const page = b.build(Math.max(0, bb.maxX + shift.x), Math.max(0, bb.maxY + shift.y));
  return { file: await fileInfo(file, 'hpgl'), pages: [page], warnings };
}
