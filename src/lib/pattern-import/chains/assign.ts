// chains/ — LINEFIX: the operator's per-line answer "these lines are size N" (or common, or no size
// line), where a row answer (legend.ts) is too coarse: kombinezon draws every strip outline of all
// eight sizes on OCG layer "6" (each in its own size's dash), so the legend puts the 8's outline in
// row 6 and no row edit can take one line out.
//
// THE LINE KEY (stable across re-chaining and re-runs; never a chain number):
//
//   L1|<pen>|<o|c>|<len>|<ax>,<ay>|<bx>,<by>
//
//   pen   8 hex digits, FNV-1a of the backbone style's pen — stroke rgb, width (0.01 mm), declared
//         dash (0.01 mm), layer, fill. Not the StyleId: one pen gets one style per tile clip.
//   o|c   open / closed chain.
//   len   chain length, whole mm.
//   a, b  open: both end points, the smaller (x, then y) first — the key does not depend on the
//         direction the linker walked; closed: the bounding box min and max corner (a closed chain
//         starts wherever the linker began it). Points in the TILE SHEET's own frame (D6: the
//         drawing's frame minus the sheet's shift `SheetPart.dx/dy`), quantised to 0.5 mm.
//
// A key finds its line exactly, else the one line of that sheet, pen and kind whose length is within
// max(1 mm, 0.5 %) and whose ends / box corners are within 1 mm (a re-run that moved a point across a
// quantisation step). Nothing found, or several lines near and none exact = the key is STALE: it is
// reported, never applied to another line. The same line drawn twice in one pen (one key, two
// chains) takes the answer on both.
//
// The answer: the line leaves every row it was in and joins the target row. Two size answers for one
// line keep it in both (a line two sizes run on) — taken, flagged 'two-sizes'. A line drawn with
// another size row's pen than the target's is taken, flagged 'pen' (D3: the operator is the
// authority, the manifest shows it). 'common' / 'ignore' go to a row of the operator's own (sig
// `operator/common` · `operator/ignore`, confidence 1): never the face pass's unsure stray row, which
// the size checks read back (gradeView). `ChainSet.assigned` names the lines: the pen checks (G22,
// the R3 continuity guard) take such a line as its row's own, and only that line.
import type {
  Chain,
  ChainAssign,
  ChainId,
  ChainSet,
  ClassId,
  LineAssignReport,
  LineClass,
  SheetPart,
  Style,
} from 'lib/pattern-import/types';

import { chainLook } from '../pieces/identity';
import { lineNests, penVerdict, rowPen } from './nests';

export const LINE_KEY_V = 'L1';
const Q = 0.5;
const NEAR_MM = 1;

const fnv = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
};

/** The pen part of a line key (stroke, width, dash, layer, fill — not the tile clip). */
export function penKey(st: Style | undefined): string {
  if (!st) return '00000000';
  return fnv(
    [
      st.strokeRgb ? st.strokeRgb.join(',') : '-',
      st.widthMm.toFixed(2),
      st.dash ? st.dash.map((v) => v.toFixed(2)).join(',') : '-',
      st.layer ?? '-',
      st.fill ? 'f' : '-',
    ].join('|'),
  );
}

const qf = (v: number) => (Math.round(v / Q) * Q).toFixed(1);

type Frame = { sheet: number; dx: number; dy: number };

/** The tile sheet a chain lies on (D6: the part its first point is on) and that sheet's shift. */
function frameOf(c: Chain, parts: readonly SheetPart[] | undefined, sheetId: number): Frame {
  if (!parts?.length || !c.pts.length) return { sheet: parts?.[0]?.sheet ?? sheetId, dx: 0, dy: 0 };
  let best = parts[0];
  let bd = Infinity;
  const p = c.pts[0];
  for (const q of parts) {
    const d =
      Math.max(q.box.minX - p.x, 0, p.x - q.box.maxX) +
      Math.max(q.box.minY - p.y, 0, p.y - q.box.maxY);
    if (d < bd) {
      bd = d;
      best = q;
    }
  }
  return { sheet: best.sheet, dx: best.dx, dy: best.dy };
}

type Parsed = {
  pen: string;
  closed: boolean;
  len: number;
  a: [number, number];
  b: [number, number];
};

function geomOf(c: Chain, f: Frame): Omit<Parsed, 'pen'> {
  const pts = c.pts.map((p) => [p.x - f.dx, p.y - f.dy] as [number, number]);
  if (c.closed) {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return {
      closed: true,
      len: c.lengthMm,
      a: [Math.min(...xs), Math.min(...ys)],
      b: [Math.max(...xs), Math.max(...ys)],
    };
  }
  const p = pts[0];
  const q = pts[pts.length - 1];
  const first = p[0] < q[0] || (p[0] === q[0] && p[1] <= q[1]);
  return { closed: false, len: c.lengthMm, a: first ? p : q, b: first ? q : p };
}

const keyOf = (pen: string, g: Omit<Parsed, 'pen'>) =>
  `${LINE_KEY_V}|${pen}|${g.closed ? 'c' : 'o'}|${Math.round(g.len)}|${qf(g.a[0])},${qf(g.a[1])}|${qf(g.b[0])},${qf(g.b[1])}`;

export function parseLineKey(key: string): Parsed | null {
  const m = /^L1\|([0-9a-f]{8})\|([oc])\|(\d+)\|(-?[\d.]+),(-?[\d.]+)\|(-?[\d.]+),(-?[\d.]+)$/.exec(
    key,
  );
  if (!m) return null;
  return {
    pen: m[1],
    closed: m[2] === 'c',
    len: Number(m[3]),
    a: [Number(m[4]), Number(m[5])],
    b: [Number(m[6]), Number(m[7])],
  };
}

export type LineInfo = { key: string; sheet: number; style: number };
type Lines = { info: LineInfo[]; geom: (Parsed | null)[] };
const memo = new WeakMap<readonly Chain[], Lines>();

function linesOf(
  set: ChainSet,
  styles: readonly Style[],
  parts: readonly SheetPart[] | undefined,
  sheetId: number,
): Lines {
  const m = memo.get(set.chains);
  if (m) return m;
  const byId = new Map(styles.map((s) => [s.id, s]));
  const pens = new Map<number, string>();
  const info: LineInfo[] = [];
  const geom: (Parsed | null)[] = [];
  for (const c of set.chains) {
    if (c.pts.length < 2) {
      info.push({ key: '', sheet: -1, style: c.style });
      geom.push(null);
      continue;
    }
    let pen = pens.get(c.style);
    if (pen == null) pens.set(c.style, (pen = penKey(byId.get(c.style))));
    const f = frameOf(c, parts, sheetId);
    const g = geomOf(c, f);
    info.push({ key: keyOf(pen, g), sheet: f.sheet, style: c.style });
    geom.push({ pen, ...g });
  }
  const out = { info, geom };
  memo.set(set.chains, out);
  return out;
}

/**
 * Per chain (index = ChainId): its line key, tile sheet and backbone StyleId — the chains stage's
 * `chainLines`. A chain without two points has key ''.
 */
export function lineKeys(
  set: ChainSet,
  styles: readonly Style[],
  parts: readonly SheetPart[] | undefined,
  sheetId: number,
): LineInfo[] {
  return linesOf(set, styles, parts, sheetId).info;
}

const near = (p: [number, number], q: [number, number]) =>
  Math.abs(p[0] - q[0]) <= NEAR_MM && Math.abs(p[1] - q[1]) <= NEAR_MM;

/** The key of a row as legend answers name it (use-import-session `legendKey`). */
const rowKey = (c: LineClass) => c.sig ?? `#${c.id}`;

function rankOf(c: LineClass): number | null {
  if (c.role !== 'size') return null;
  for (const e of c.evidence) if (e.kind === 'nesting-order') return e.rank;
  return null;
}

/**
 * Applies the operator's per-line answers to a chain set (after the legend). Pure: a new set, the
 * input untouched; `report` says what landed, what is stale and what is flagged.
 */
export function assignChains(
  set: ChainSet,
  styles: readonly Style[],
  parts: readonly SheetPart[] | undefined,
  sheetId: number,
  entries: readonly ChainAssign[],
): { set: ChainSet; report: LineAssignReport } {
  const report: LineAssignReport = { applied: [], stale: [], flags: [], notes: [] };
  if (!entries.length) return { set, report };
  const { info, geom } = linesOf(set, styles, parts, sheetId);
  const byKey = new Map<string, ChainId[]>();
  info.forEach((x, id) => {
    if (!x.key) return;
    const k = `${x.sheet}|${x.key}`;
    const a = byKey.get(k);
    if (a) a.push(id);
    else byKey.set(k, [id]);
  });
  let nextId = Math.max(-1, ...set.classes.map((c) => c.id)) + 1;
  const opRows = new Map<'common' | 'ignore', LineClass>();
  const opRow = (cls: 'common' | 'ignore') => {
    let r = opRows.get(cls) ?? set.classes.find((c) => c.sig === `operator/${cls}`);
    if (!r) {
      r = {
        id: nextId++,
        role: cls,
        sizeLabel: null,
        chains: [],
        totalLengthMm: 0,
        evidence: [],
        confidence: 1,
        sig: `operator/${cls}`,
      };
    }
    opRows.set(cls, r);
    return r;
  };
  /** Per chain: its target rows in answer order — a role row resets, size rows add up. */
  const targets = new Map<ChainId, { rows: LineClass[]; key: string }>();
  entries.forEach((e, entry) => {
    let row: LineClass | undefined;
    let what: string;
    if ('rank' in e.to) {
      const r = e.to.rank;
      const rows = set.classes.filter((c) => rankOf(c) === r);
      row = rows.length === 1 ? rows[0] : undefined;
      what = rows.length > 1 ? `${rows.length} size rows of rank ${r}` : `no size row of rank ${r}`;
    } else if ('row' in e.to) {
      const k = e.to.row;
      row = set.classes.find((c) => rowKey(c) === k);
      what = `no legend row ${k}`;
    } else {
      row = opRow(e.to.cls);
      what = '';
    }
    for (const key of e.keys) {
      if (!row) {
        report.stale.push({ entry, key, why: 'no-target', detail: what });
        continue;
      }
      const p = parseLineKey(key);
      if (!p) {
        report.stale.push({ entry, key, why: 'bad-key', detail: 'not a line key (L1|…)' });
        continue;
      }
      let ids = byKey.get(`${e.sheet}|${key}`) ?? [];
      let via: 'exact' | 'near' | 'dup' = ids.length > 1 ? 'dup' : 'exact';
      if (!ids.length) {
        const tol = Math.max(1, 0.005 * p.len);
        const hits: ChainId[] = [];
        info.forEach((x, id) => {
          const g = geom[id];
          if (!g || x.sheet !== e.sheet || g.pen !== p.pen || g.closed !== p.closed) return;
          if (Math.abs(g.len - p.len) > tol) return;
          if (near(g.a, p.a) && near(g.b, p.b)) hits.push(id);
        });
        if (hits.length !== 1) {
          report.stale.push({
            entry,
            key,
            why: hits.length ? 'ambiguous' : 'gone',
            detail: hits.length
              ? `${hits.length} lines of that pen within ${NEAR_MM} mm, none exactly`
              : `no line of that key on tile sheet ${e.sheet} now`,
          });
          continue;
        }
        ids = hits;
        via = 'near';
      }
      report.applied.push({ entry, key, chains: ids, to: row.id, via });
      for (const id of ids) {
        const t = targets.get(id);
        if (row.role === 'size' && t && t.rows.every((x) => x.role === 'size')) {
          if (!t.rows.includes(row)) t.rows.push(row);
        } else targets.set(id, { rows: [row], key: info[id].key });
      }
    }
  });
  if (!targets.size) return { set, report };

  // D3 flags — the pens read on the set as the legend left it
  const styleMap = new Map(styles.map((s) => [s.id, s]));
  const sizeRows = set.classes.filter((c) => c.role === 'size');
  const pens = new Map(sizeRows.map((c) => [c.id, rowPen(set, c, styleMap)]));
  const byId = new Map(set.classes.map((c) => [c.id, c]));
  let nests: ReturnType<typeof lineNests> | undefined;
  const label = (c: LineClass) =>
    c.role === 'size' ? `size ${c.sizeLabel ?? `#${c.id}`}` : c.role;
  for (const [id, t] of targets) {
    const sizes = t.rows.filter((r) => r.role === 'size');
    if (sizes.length > 1)
      report.flags.push({
        chain: id,
        key: t.key,
        kind: 'two-sizes',
        detail: `in ${sizes.map(label).join(' and ')}`,
      });
    if (!set.chains[id] || !chainLook(set.chains[id], styleMap)) continue;
    for (const r of sizes) {
      // LINEASSIGN-2: the graded nest weighs the pen (chains/nests.ts) — a pen used twice in one
      // nest, at its own size's place and at the place the answer names, is the drawing's slip:
      // two evidences against the pen (D3), noted, not flagged
      const v = penVerdict(set, nests ?? (nests = lineNests(set)), id, r.id, pens, styleMap);
      if (v.pen === 'against')
        report.flags.push({
          chain: id,
          key: t.key,
          kind: 'pen',
          detail: `drawn with the pen of ${label(byId.get(v.says)!)}, put in ${label(r)}`,
        });
      else if (v.pen === 'slip')
        report.notes!.push({
          chain: id,
          key: t.key,
          kind: 'pen-slip',
          detail: `drawn with the pen of ${label(byId.get(v.says)!)}, put in ${label(r)}: its nest's place says ${label(r)}, and the pen's own ${label(byId.get(v.says)!)} outline in that nest (#${v.own.join(', #')}) is drawn with it too — the drawing's pen slip`,
        });
    }
  }

  // the rows: every answered line leaves its rows, joins its targets
  const moved = new Set(targets.keys());
  const into = new Map<ClassId, ChainId[]>();
  for (const [id, t] of targets)
    for (const r of t.rows) into.set(r.id, [...(into.get(r.id) ?? []), id]);
  const len = (ids: ChainId[]) => ids.reduce((a, i) => a + (set.chains[i]?.lengthMm ?? 0), 0);
  // an operator row of its own only when a line landed in it
  const fresh = [...opRows.values()].filter((r) => !set.classes.includes(r) && into.has(r.id));
  const rows = [...set.classes, ...fresh];
  const classes: LineClass[] = rows.map((c) => {
    // a row the reader handed over with a line twice leaves here with it once
    const keep = [...new Set(c.chains.filter((id) => !moved.has(id)))];
    const add = into.get(c.id) ?? [];
    if (keep.length === c.chains.length && !add.length) return c;
    const chains = [...keep, ...add.filter((id) => !keep.includes(id))];
    return { ...c, chains, totalLengthMm: len(chains) };
  });
  const ambiguities = set.ambiguities
    ?.map((a) =>
      a.chains.some((id) => moved.has(id))
        ? { ...a, chains: a.chains.filter((id) => !moved.has(id)) }
        : a,
    )
    .filter((a, k) => a.chains.length || !set.ambiguities![k].chains.length);
  const n = moved.size;
  return {
    set: {
      ...set,
      classes,
      // an answered line is no orphan and in no bundle (a bundle holds one line per rank)
      orphans: set.orphans.filter((id) => !moved.has(id)),
      bundles: set.bundles.filter((b) => !b.chains.some((id) => moved.has(id))),
      ...(ambiguities ? { ambiguities } : {}),
      warnings: [
        ...set.warnings,
        `${n} ${n === 1 ? 'line' : 'lines'} put in a row by the operator`,
      ],
      assigned: [...targets].map(([chain, t]) => ({ chain, classes: t.rows.map((r) => r.id) })),
    },
    report,
  };
}

/** LINEFIX provenance: "operator put 2 lines in size 8, 1 in common" (empty = nothing landed). */
export function assignSummary(set: ChainSet): string {
  const by = new Map<string, number>();
  const rowOf = new Map(set.classes.map((c) => [c.id, c]));
  for (const a of set.assigned ?? [])
    for (const id of a.classes) {
      const c = rowOf.get(id);
      const k = c ? (c.role === 'size' ? `size ${c.sizeLabel ?? `#${c.id}`}` : c.role) : `#${id}`;
      by.set(k, (by.get(k) ?? 0) + 1);
    }
  return [...by].map(([k, n]) => `${n} ${n === 1 ? 'line' : 'lines'} in ${k}`).join(', ');
}
