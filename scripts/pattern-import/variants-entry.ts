// PATTERN-IMPORT · VARIANTS probe (variants.mjs): the wizard's session on kombinezon (Style A / B),
// the pieces run WITHOUT a chosen model (the model question) and the chosen run, checked:
//   1. variantMarks is a non-empty array (the client auto-picks the garment on `[]`);
//   2. every model has certain cut/edge marks, and the union of a model's cutLines is exactly its
//      knives (variantKnifeItems) — the polylines the fill cuts with;
//   3. the uncut run carries each touched piece's outline per model; the chosen run carries none;
//   4. Pieces 6, 7, 8 are claimed by Style A (kind 'piece'), nothing by Style B;
//   5. VARIANTS-2: every cut/edge line carries its size (the size row its chain is in), one line per
//      size per mark, and `offMm` (its ends from that size's outline): ≤ 1.5 everywhere except the
//      source's own slip — Style A's Piece 4 line, sizes 8–20 drawn off their outlines (size 10:
//      5.3 mm short). Renders that piece's line end per size (`<id>-piece4-sizes.png`).
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { variantKnifeItems } from 'lib/pattern-import/pieces';
import type { ChainSet, PtMm, Sheet, SizeRun, StageIO } from 'lib/pattern-import/types';
import { Session } from 'lib/pattern-import/worker/session';

import { CASES, runCase } from './e2e-entry';
import { renderPng, type Label, type Stroke } from './sizes-render';

type Out = StageIO['pieces']['out'];
const COL: Record<string, string> = { 'Style A': '#d62728', 'Style B': '#1f5fbf' };
const key = (l: readonly PtMm[]) => l.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(' ');

export async function main(args: string[]): Promise<boolean> {
  const out = process.env.VARIANTS_OUT ?? process.env.PATIMPORT_E2E_OUT!;
  mkdirSync(out, { recursive: true });
  const fails: string[] = [];
  const check = (ok: boolean, what: string) => {
    console.log(`${ok ? '✓' : '✗'} ${what}`);
    if (!ok) fails.push(what);
  };
  // the uncut run: the session's first pieces call (no model chosen yet)
  let uncut: Out | null = null;
  const orig = Session.prototype.runStage;
  (Session.prototype as unknown as { runStage: unknown }).runStage = async function (
    this: Session,
    st: Parameters<Session['runStage']>[0],
    input: Parameters<Session['runStage']>[1],
    cx: Parameters<Session['runStage']>[2],
  ) {
    const o = await orig.call(this, st, input, cx);
    const opts = (input as { opts?: { variant?: string | null } }).opts;
    if (st === 'pieces' && opts?.variant === null && !uncut) uncut = o as Out;
    return o;
  };
  for (const id of args.length ? args : ['kombinezon-A', 'kombinezon-B']) {
    const c = CASES.find((x) => x.id === id);
    if (!c) throw new Error(`no case ${id}`);
    uncut = null;
    let chosen: Out | null = null;
    const got: { sheet?: Sheet; set?: ChainSet; run?: SizeRun | null } = {};
    let model: string | null = null;
    await runCase(c, {
      onAutoPieces: (s, o) => {
        const S = s as unknown as {
          sheet: Sheet;
          chains: ChainSet;
          wallSet: ChainSet | null;
          pieceSession: { run: SizeRun | null } | null;
        };
        chosen = o;
        got.run = S.pieceSession?.run ?? null;
        got.sheet = S.sheet;
        got.set = S.wallSet ?? S.chains;
        model = (o.variants ?? []).find((v) => c.variant?.test(v)) ?? null;
      },
    });
    const u = uncut as Out | null;
    const ch = chosen as Out | null;
    const { sheet, set } = got;
    if (!u || !ch || !sheet || !set || !model) {
      check(false, `${id}: the run reached the pieces step with a model`);
      continue;
    }
    const marks = u.variantMarks;
    check(Array.isArray(marks) && marks.length > 0, `${id}: variantMarks present and not []`);
    if (!marks?.length) continue;
    writeFileSync(resolve(out, `${id}-marks-uncut.json`), JSON.stringify(marks, null, 1));
    for (const v of u.variants ?? []) {
      const own = marks.filter((m) => m.label === v && !m.uncertain && m.kind !== 'piece');
      check(own.length > 0, `${id}: ${v} has certain cut/edge marks (${own.length})`);
      const lines = new Set(own.flatMap((m) => m.cutLines.map((l) => key(l.poly))));
      const knives = new Set(variantKnifeItems(sheet, set, v).map((k) => key(k.pts)));
      const same = lines.size === knives.size && [...lines].every((l) => knives.has(l));
      check(same, `${id}: ${v} cutLines = its knives (${lines.size} / ${knives.size} polylines)`);
      check(
        own.every((m) => m.pieces.length > 0 && (m.outlines?.length ?? 0) === m.pieces.length),
        `${id}: ${v} uncut run: every mark names its pieces and their cut outline`,
      );
    }
    check(
      (ch.variantMarks ?? []).every((m) => m.outlines === undefined),
      `${id}: the chosen run (${model}) carries no outlines`,
    );
    const label = (seed: number) => u.seeds.find((s) => s.id === seed)?.text?.text ?? '';
    const claimed = (v: string) =>
      marks
        .filter((m) => m.kind === 'piece' && m.label === v && !m.uncertain)
        .flatMap((m) => m.pieces.map(label))
        .sort();
    check(
      JSON.stringify(claimed('Style A')) === JSON.stringify(['Piece 6', 'Piece 7', 'Piece 8']),
      `${id}: Style A alone claims ${claimed('Style A').join(', ')}`,
    );
    check(claimed('Style B').length === 0, `${id}: Style B claims no piece of its own`);
    // the claim sets the seed's model: the chosen run fills only its own model's claimed pieces
    const chosenLabels = ch.families.map(
      (f) => ch.seeds.find((s) => s.id === f.seed)?.text?.text ?? '',
    );
    const aOnly = ['Piece 6', 'Piece 7', 'Piece 8'];
    const has = aOnly.filter((l) => chosenLabels.includes(l));
    check(
      model === 'Style A' ? has.length === 3 : has.length === 0,
      `${id}: the ${model} run fills ${has.length ? has.join(', ') : 'none'} of the Style A pieces`,
    );
    check(
      (ch.variantMarks ?? []).some((m) => m.kind === 'piece' && !m.uncertain),
      `${id}: the ${model} run still reports the Style A piece marks`,
    );
    check(
      aOnly.every((l) => {
        const sd = ch.seeds.find((s) => s.text?.text === l);
        return sd?.variant === 'Style A' && sd.variantFrom === 'claim';
      }),
      `${id}: Pieces 6, 7, 8 carry variant 'Style A' (from the claim) in pieces.out.seeds`,
    );
    // 5. per-size cut lines: each line in its size row; the source's slip on Piece 4 flagged
    const runSizes = (got.run?.sizes ?? []).map((z) => z.label);
    const p4 = u.seeds.find((s) => s.text?.text === 'Piece 4')?.id;
    for (const m of marks) {
      if (m.uncertain || m.kind === 'piece') continue;
      const where = `${m.label} ${m.kind} → ${m.pieces.map(label).join(', ')}`;
      const sizes = m.cutLines.map((l) => l.size);
      check(
        sizes.every((z) => z != null && runSizes.includes(z)) &&
          new Set(sizes).size === sizes.length,
        `${id}: ${where}: one line per size, each with its size (${sizes.join(' ')})`,
      );
      const slip = m.label === 'Style A' && m.kind === 'cut' && p4 != null && m.pieces.includes(p4);
      const off = m.cutLines.map((l) => `${l.size}:${l.offMm}`).join(' ');
      if (!slip) {
        check(
          m.cutLines.every((l) => l.offMm != null && l.offMm <= 1.5),
          `${id}: ${where}: every line on its own size's outline (${off})`,
        );
        continue;
      }
      const of = (z: string) => m.cutLines.find((l) => l.size === z)?.offMm ?? null;
      const s10 = of('10');
      check(
        (of('6') ?? 99) <= 1.5 &&
          m.cutLines.filter((l) => l.size !== '6').every((l) => (l.offMm ?? 0) > 1.5) &&
          s10 != null &&
          s10 > 4.5 &&
          s10 < 6.5,
        `${id}: ${where}: the source's slip — size 6 on its outline, 8–20 off, size 10 ${s10} mm (${off})`,
      );
      // the picture: Piece 4's right end, each size's outline, the line of each size labelled
      const fam = u.families.find((f) => f.seed === p4);
      if (fam && id === 'kombinezon-A') {
        const ends = m.cutLines.map((l) => l.poly[l.poly.length - 1]);
        const xs = ends.map((q) => q.x);
        const y0 = ends[0].y;
        const box = {
          minX: Math.min(...xs) - 25,
          maxX: Math.max(...xs) + 25,
          minY: y0 - 30,
          maxY: y0 + 30,
        };
        const st: Stroke[] = set.chains.map((x) => ({ pts: x.pts, color: '#e4e4e4', width: 0.6 }));
        const lb: Label[] = [];
        // the renderer keeps a stroke only by a vertex in the box: densify the long side seams
        const dense = (q: readonly PtMm[]) =>
          q.flatMap((a, k) => {
            const b = q[(k + 1) % q.length];
            const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4));
            return Array.from({ length: n }, (_, t) => ({
              x: a.x + ((b.x - a.x) * t) / n,
              y: a.y + ((b.y - a.y) * t) / n,
            }));
          });
        for (const cnd of fam.candidates) {
          const z = got.run?.sizes.find((x) => x.rank === cnd.rank)?.label ?? '';
          const ten = z === '10';
          st.push({
            pts: dense(cnd.outer),
            color: ten ? '#000' : '#9a9a9a',
            width: ten ? 2.5 : 1,
            closed: true,
          });
          // the size's name where its side seam crosses below the line
          const yl = y0 - 22;
          const xs2 = cnd.outer.flatMap((a, k) => {
            const b = cnd.outer[(k + 1) % cnd.outer.length];
            return (a.y - yl) * (b.y - yl) <= 0 && a.y !== b.y
              ? [a.x + ((yl - a.y) / (b.y - a.y)) * (b.x - a.x)]
              : [];
          });
          if (xs2.length)
            lb.push({
              at: { x: Math.max(...xs2) + 0.6, y: yl },
              text: z,
              color: ten ? '#000' : '#777',
              size: 12,
            });
        }
        m.cutLines.forEach((l, i) => {
          const ten = l.size === '10';
          const col = (l.offMm ?? 0) <= 1.5 ? '#2a9d3a' : '#d62728';
          const dy = (i - (m.cutLines.length - 1) / 2) * 3.2;
          // each size's copy drawn 3.2 mm apart (they lie on one carrier) so the ends read apart
          st.push({
            pts: l.poly.map((q) => ({ x: q.x, y: q.y + dy })),
            color: col,
            width: ten ? 4 : 2,
          });
          const e = l.poly[l.poly.length - 1];
          lb.push({
            at: { x: e.x + 1, y: e.y + dy },
            text: `${l.size} ${l.offMm} mm`,
            color: col,
            size: ten ? 13 : 10,
          });
        });
        renderPng(resolve(out, `${id}-piece4-sizes.png`), box, st, lb, 12, [
          { color: '#000', text: 'Piece 4, size 10 outline (uncut fill)' },
          { color: '#9a9a9a', text: 'Piece 4, other sizes (label = size)' },
          { color: '#2a9d3a', text: 'Style A cutting line of that size, ends on its outline' },
          {
            color: '#d62728',
            text: 'Style A cutting line of that size (OCG layer), off its outline: offMm',
          },
          {
            color: '#555',
            text: 'lines on one carrier y=976.1, drawn spread 3.2 mm apart to read',
          },
        ]);
      }
    }
    check(
      (ch.variantMarks ?? []).every(
        (m) => m.kind === 'piece' || m.uncertain || m.cutLines.every((l) => l.size != null),
      ),
      `${id}: the chosen run's lines carry their sizes too`,
    );
    // the picture: uncut middle-size outlines grey, each model's cut lines thick, its outlines
    const strokes: Stroke[] = set.chains.map((x) => ({ pts: x.pts, color: '#d8d8d8', width: 0.7 }));
    const labels: Label[] = [];
    for (const f of u.families) {
      const cs = f.candidates.filter((x) => x.outcome === 'closed');
      const rep = cs[Math.floor(cs.length / 2)];
      if (rep) strokes.push({ pts: rep.outer, color: '#999', width: 1, closed: true });
    }
    for (const m of marks) {
      const col = COL[m.label] ?? '#2a2';
      const dash = m.label === 'Style B' ? '10 5' : undefined;
      for (const o of m.outlines ?? [])
        strokes.push({ pts: o.poly, color: col, width: 2, closed: true, dash });
      for (const l of m.cutLines) strokes.push({ pts: l.poly, color: col, width: 4 });
      const to = m.pieces.map(label).join(', ');
      labels.push({
        at: m.at,
        text: `${m.label} ${m.kind}${m.uncertain ? ' ?' : ''} → ${to}`,
        color: col,
        size: 18,
      });
    }
    for (const s of u.seeds)
      labels.push({ at: s.at, text: s.text?.text ?? `seed ${s.id}`, color: '#000', size: 16 });
    renderPng(resolve(out, `${id}-variant-marks.png`), sheet.bbox, strokes, labels, 0.6, [
      { color: COL['Style A'], text: 'Style A: cut lines (thick), its pieces (solid)' },
      { color: COL['Style B'], text: 'Style B: cut lines (thick), its pieces (dashed)' },
      { color: '#999', text: 'uncut fill, middle size' },
    ]);
  }
  console.log(fails.length ? `${fails.length} check(s) failed` : 'all variant checks pass');
  return fails.length > 0;
}
