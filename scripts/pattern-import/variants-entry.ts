// PATTERN-IMPORT · VARIANTS probe (variants.mjs): the wizard's session on kombinezon (Style A / B),
// the pieces run WITHOUT a chosen model (the model question) and the chosen run, checked:
//   1. variantMarks is a non-empty array (the client auto-picks the garment on `[]`);
//   2. every model has certain cut/edge marks, and the union of a model's cutLines is exactly its
//      knives (variantKnifeItems) — the polylines the fill cuts with;
//   3. the uncut run carries each touched piece's outline per model; the chosen run carries none;
//   4. Pieces 6, 7, 8 are claimed by Style A (kind 'piece'), nothing by Style B.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { variantKnifeItems } from 'lib/pattern-import/pieces';
import type { ChainSet, PtMm, Sheet, StageIO } from 'lib/pattern-import/types';
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
    const got: { sheet?: Sheet; set?: ChainSet } = {};
    let model: string | null = null;
    await runCase(c, {
      onAutoPieces: (s, o) => {
        const S = s as unknown as { sheet: Sheet; chains: ChainSet; wallSet: ChainSet | null };
        chosen = o;
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
      const lines = new Set(own.flatMap((m) => m.cutLines.map(key)));
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
      for (const l of m.cutLines) strokes.push({ pts: l, color: col, width: 4 });
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
