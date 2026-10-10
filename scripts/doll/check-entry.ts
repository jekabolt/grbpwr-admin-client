// yarn doll:check — node half. For each file: product DXF parser → seam graph (pipeline.readSeamGraph,
// the graph the screen uses) → lib/doll solveDoll → scene JSON for the WebGL page + a report in
// words. Truth (assembly-from-pattern/probe/truth) marks which graph seams are real; prod cards'
// technologist ops say which joins must exist (which the graph lacks, which the doll proposes).

import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { proposeSkeleton, readSeamGraph } from '../../src/lib/assembly-skeleton/pipeline';
import type { SkeletonCategory } from '../../src/lib/assembly-skeleton/types';
import { joinsFromOps, solveDoll, type DeclaredOp } from '../../src/lib/doll';
import type { DollReport } from '../../src/lib/doll/types';
import { labelMapper, loadFacts } from '../assembly-skeleton/seams-entry';
import { anchorOfRunId, grainDegOf, seamFromCandidate, type StoredSeam } from '../../src/lib/seams';
import { neckFixtures } from './neck-fixture';

type FileSpec = {
  id: string;
  label: string;
  dxf: string;
  category: SkeletonCategory;
  truth?: string;
  card?: string;
  gender?: 'MALE' | 'FEMALE';
  drop?: string[];
  shuffleOps?: boolean;
  /** Synthetic ×2 test: `drop` is removed from the pattern and `keep` is cut ×2 mirrored instead. */
  x2?: { keep: string; drop: string };
  noOps?: boolean;
  /** Size label of the DXF blocks (default M; some exports use lower case). */
  size?: string;
  /** Synthetic graft: `drop` pieces leave this pattern, `keep` pieces (+ their own seams) of the
   *  donor DXF come in — a clean body with another garment's collar. */
  graft?: { dxf: string; keep: string[]; drop: string[] };
  /** L4: stored seam rows (scripts/doll/gold/<file>.seams.json) handed to the doll. */
  gold?: string;
  /** L4 NEGATIVE CONTROL: one gold row deliberately wrong — `row` (edge hints a ↔ b) re-pointed
   *  from its b to `to` (an edge id of today's segmentation). */
  wrong?: { a: string; b: string; to: string };
  /** A beta card (tmp/plans/assembly-3d-doll/beta-data/<card>.json): pieces, order by piece NAME. */
  betaCard?: string;
  /** Also hand the doll the rows that card had stored on beta (edge pairs in its JSON, written
   *  here the way the review writes them: seamFromCandidate on today's graph). */
  betaRows?: boolean;
};

const [specPath, outDir] = process.argv.slice(2);
if (process.env.DOLL_PLACED_ONLY)
  (globalThis as { __DOLL_PLACED_ONLY?: boolean }).__DOLL_PLACED_ONLY = true;
if (process.env.DOLL_NOPROXY) (globalThis as { __DOLL_NOPROXY?: boolean }).__DOLL_NOPROXY = true;
const spec = JSON.parse(await readFile(specPath, 'utf8')) as {
  noOps?: boolean;
  files: FileSpec[];
  plans: string;
  maxPasses?: number;
};
const probeDir = resolve(spec.plans, 'assembly-from-pattern/probe');
const prodDir = resolve(spec.plans, 'assembly-3d-doll/prod-data');
const cards = JSON.parse(await readFile(resolve(prodDir, 'cards.json'), 'utf8')) as Record<
  string,
  {
    pieces: [string, string, number, string, number, string][];
    ops: [string, string, string, string, string][];
    name: string;
    sn: string;
  }
>;
const fitModels = JSON.parse(await readFile(resolve(prodDir, 'fit-models.json'), 'utf8')) as {
  id: number;
  gender: string;
  m: Record<string, number>;
}[];

const quiet = async <T>(f: () => Promise<T> | T): Promise<T> => {
  const l = console.log;
  const w = console.warn;
  console.log = () => {};
  console.warn = () => {};
  try {
    return await f();
  } finally {
    console.log = l;
    console.warn = w;
  }
};
const pk = (id: string) => id.slice(0, id.lastIndexOf('#'));
const fmt = (x: number, d = 1) => x.toFixed(d);

async function probeGeometry(truth: string, dxf: string) {
  const json = JSON.parse(await readFile(resolve(probeDir, 'out', `${truth}.json`), 'utf8'));
  if (json.edgeIdx && json.pieces?.[0]?.rs) return json;
  const prefix = resolve(tmpdir(), `doll-probe-${process.pid}-${truth}`);
  execFileSync(process.execPath, [resolve(probeDir, 'seamgraph.mjs'), dxf, 'M', prefix], {
    stdio: 'ignore',
  });
  return JSON.parse(await readFile(`${prefix}.json`, 'utf8'));
}

const summary: Record<string, unknown>[] = [];
for (const f of spec.files) {
  const buf = await readFile(f.dxf);
  const bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const tParse = performance.now();
  const { facts, origin } = await quiet(() => loadFacts(bytes, f.size ?? 'M', f.category));
  const tGraph = performance.now();
  let graph = await quiet(() => readSeamGraph(facts));
  if (f.x2) {
    const { keep, drop } = f.x2;
    const pk0 = (id: string) => id.slice(0, id.lastIndexOf('#'));
    const touches = (sc: { a: string; b: string }) => pk0(sc.a) === drop || pk0(sc.b) === drop;
    graph = {
      ...graph,
      pieces: graph.pieces.filter((p) => p.pieceKey !== drop),
      chosen: graph.chosen.filter((sc) => !touches(sc)),
      rejected: graph.rejected.filter((sc) => !touches(sc)),
      components: graph.components.map((c) => c.filter((k) => k !== drop)),
    };
    facts.pieces = facts.pieces
      .filter((p) => p.pieceKey !== drop)
      .map((p) =>
        p.pieceKey === keep ? { ...p, piecesPerGarment: 2, cutSymmetry: 'MIRRORED' } : p,
      );
  }
  if (f.graft) {
    const { keep, drop } = f.graft;
    const dbuf = await readFile(f.graft.dxf);
    const donor = await quiet(() =>
      loadFacts(
        dbuf.buffer.slice(dbuf.byteOffset, dbuf.byteOffset + dbuf.byteLength),
        'M',
        f.category,
      ),
    );
    const dgraph = await quiet(() => readSeamGraph(donor.facts));
    const pk0 = (id: string) => id.slice(0, id.lastIndexOf('#'));
    const out = (sc: { a: string; b: string }) =>
      drop.includes(pk0(sc.a)) || drop.includes(pk0(sc.b));
    const inn = (sc: { a: string; b: string }) =>
      keep.includes(pk0(sc.a)) && keep.includes(pk0(sc.b));
    graph = {
      ...graph,
      pieces: [
        ...graph.pieces.filter((p) => !drop.includes(p.pieceKey)),
        ...dgraph.pieces.filter((p) => keep.includes(p.pieceKey)),
      ],
      chosen: [...graph.chosen.filter((sc) => !out(sc)), ...dgraph.chosen.filter(inn)],
      rejected: [...graph.rejected.filter((sc) => !out(sc)), ...dgraph.rejected.filter(inn)],
      components: [...graph.components.map((c) => c.filter((k) => !drop.includes(k))), keep],
    };
    facts.pieces = [
      ...facts.pieces.filter((p) => !drop.includes(p.pieceKey)),
      ...donor.facts.pieces.filter((p) => keep.includes(p.pieceKey)),
    ];
  }
  const msGraph = performance.now() - tGraph;
  const msParse = tGraph - tParse;
  // Declared joins: the card's technologist order (piece lineKeys → DXF names), else the
  // skeleton's own steps. NEGATIVE CONTROL: shuffled inputs (each piece key replaced by another).
  const card = f.card ? cards[f.card] : undefined;
  const inDxf = new Set(graph.pieces.map((p) => p.pieceKey));
  let ops: DeclaredOp[] = [];
  let pieceOf: (k: string) => string | null = () => null;
  let opsSource = '';
  const beta = f.betaCard
    ? (JSON.parse(await readFile(f.betaCard, 'utf8')) as {
        ops: [number, string, string, string, string, string][];
        ['stored_seams_on_beta_2026-10-10_18:02']?: string[];
      })
    : undefined;
  if (beta && !f.noOps) {
    pieceOf = (k) => (inDxf.has(k) ? k : null);
    ops = beta.ops.map(([, type, , inputs, output]) => ({
      inputs: inputs.split('+'),
      output,
      type,
    }));
    opsSource = `beta card order (${f.betaCard?.split('/').pop()})`;
  } else if (card && !f.noOps) {
    const nameOf = new Map(card.pieces.map((p) => [p[0], p[1]]));
    const keys = card.pieces.map((p) => p[0]);
    const shuffled = new Map(keys.map((k, i) => [k, keys[(i * 7 + 3) % keys.length]]));
    pieceOf = (k) => {
      const kk = f.shuffleOps ? shuffled.get(k) ?? k : k;
      const n = nameOf.get(kk);
      return n && inDxf.has(n) ? n : null;
    };
    ops = card.ops.map(([inputs, output, , type]) => ({ inputs: inputs.split('+'), output, type }));
    opsSource = f.shuffleOps
      ? `card ${f.card} order with SHUFFLED inputs`
      : `card ${f.card} technologist's order`;
  } else if (!f.noOps) {
    const prop = proposeSkeleton(facts, {
      zoneOf: () => '',
      suggestUnitCode: (_z, taken) => `U${taken.size + 1}`,
      checkAssembly: () => ({ violations: [], release: [] }),
    });
    const keyName = new Map(facts.pieces.map((p) => [p.pieceKey, p.name]));
    pieceOf = (k) => {
      const n = keyName.get(k);
      return n && inDxf.has(n) ? n : inDxf.has(k) ? k : null;
    };
    ops = prop.steps.map((st) => ({
      inputs: st.inputs,
      output: st.outputUnitKey,
      type: st.operationType,
    }));
    opsSource = "the skeleton's own units (no card order)";
  }
  const joins = joinsFromOps(ops, pieceOf);
  let rows: StoredSeam[] | undefined;
  let wrongWords = '';
  if (beta && f.betaRows) {
    const grain = grainDegOf(facts);
    rows = (beta['stored_seams_on_beta_2026-10-10_18:02'] ?? []).flatMap((line, i) => {
      const m = /(\S+#[\d+]+)\s*<->\s*(\S+#[\d+]+)/.exec(line);
      if (!m) return [];
      const r = seamFromCandidate(
        { a: m[1], b: m[2], kind: 'edge', score: 1, evidence: {} as never },
        graph.pieces,
        {
          seamKey: `BETA${String(i).padStart(22, '0')}`,
          status: 'confirmed',
          source: /manual/.test(line) ? 'manual' : 'graph',
          anchoredSize: f.size ?? 'M',
          grainDeg: grain,
        },
      );
      return r ? [r] : [];
    });
  }
  if (f.gold) {
    const gj = JSON.parse(await readFile(f.gold, 'utf8')) as { rows: { row: StoredSeam }[] };
    rows = gj.rows.map((r) => r.row);
    if (f.wrong) {
      const W = f.wrong;
      const i = rows.findIndex(
        (r) =>
          r.sideA.length === 1 &&
          r.sideB.length === 1 &&
          ((r.sideA[0].edgeHint === W.a && r.sideB[0].edgeHint === W.b) ||
            (r.sideA[0].edgeHint === W.b && r.sideB[0].edgeHint === W.a)),
      );
      const an = anchorOfRunId(graph.pieces, W.to, grainDegOf(facts));
      if (i < 0 || !an) throw new Error(`${f.id}: wrong-row target not found`);
      const r = rows[i];
      const bSide = r.sideB[0].edgeHint === W.b ? 'sideB' : 'sideA';
      rows[i] = {
        ...r,
        [bSide]: [an],
        note: `DELIBERATELY WRONG (negative control): ${W.a} ↔ ${W.to} instead of ${W.b}`,
      };
      wrongWords = `${W.a} ↔ ${W.to} (was ${W.b})`;
    }
  }
  const report: DollReport = solveDoll({
    graph,
    facts,
    options: {
      debug: true,
      dropSeams: f.drop,
      // DOLL_NOOPS: the joins are still read (for the table) but not given to the doll — the «before».
      joins: spec.noOps ? undefined : joins,
      ...(spec.maxPasses !== undefined ? { maxPasses: spec.maxPasses } : {}),
      ...(rows ? { seams: { rows, size: f.size ?? 'M' }, gender: f.gender ?? null } : {}),
    },
  });

  // ── truth ──
  const truthOf = new Map<string, 'truth' | 'acceptable' | 'wrong'>();
  if (f.truth) {
    const truth = JSON.parse(
      await readFile(resolve(probeDir, 'truth', `${f.truth}.json`), 'utf8'),
    ) as { pairs: [string, string][]; acceptable?: [string, string][] };
    const probe = await probeGeometry(f.truth, f.dxf);
    const { map } = labelMapper(probe, graph.pieces, origin);
    const covers = (t: [string, string], a: string[], b: string[]) => {
      const A = map(t[0]);
      const B = map(t[1]);
      return (
        (A.some((e) => a.includes(e)) && B.some((e) => b.includes(e))) ||
        (A.some((e) => b.includes(e)) && B.some((e) => a.includes(e)))
      );
    };
    for (const s of report.seams) {
      if (s.origin !== 'graph') continue;
      if (truth.pairs.some((t) => covers(t, s.a, s.b))) truthOf.set(s.id, 'truth');
      else if ((truth.acceptable ?? []).some((t) => covers(t, s.a, s.b)))
        truthOf.set(s.id, 'acceptable');
      else truthOf.set(s.id, 'wrong');
    }
  }

  // ── declared joins vs graph vs doll ──
  // Per operation part: «graph» = the graph already sews it to another part of the same operation;
  // otherwise it is LACKING, and «doll» = the doll links it (proposed from the order, or a free-loop
  // proposal such as cap ↔ armhole), «none» = still not joined.
  const opsLines: string[] = [];
  let lacks = 0;
  let proposedN = 0;
  let declaredParts = 0;
  let joinedParts = 0;
  const graphLinks = new Set<string>();
  for (const sc of graph.chosen)
    for (const a of (sc.aParts ?? [sc.a]).map(pk))
      for (const b of (sc.bParts ?? [sc.b]).map(pk)) graphLinks.add(`${a}|${b}`).add(`${b}|${a}`);
  const dollLinks = new Set<string>();
  for (const sm of report.seams)
    if (sm.origin === 'doll-proposed' && sm.kind !== 'facing-free' && sm.state !== 'open')
      for (const a of sm.a.map(pk))
        for (const b of sm.b.map(pk)) dollLinks.add(`${a}|${b}`).add(`${b}|${a}`);
  const touches = (L: Set<string>, X: string[], Y: string[]) =>
    X.some((a) => Y.some((b) => L.has(`${a}|${b}`)));
  // Only pieces the doll draws count (lining is off at level 0, pockets are not placed).
  const drawn = new Set(report.panels.flatMap((p) => [p.pieceKey, ...p.layers]));
  for (const J0 of joins) {
    const J = {
      ...J0,
      parts: J0.parts.map((X) => X.filter((k) => drawn.has(k))).filter((X) => X.length),
    };
    if (J.parts.length < 2) continue;
    const rows: string[] = [];
    const isSurface = (X: string[]) =>
      report.orderSurface.some((o) => o.join === J.label && X.every((k) => o.part.includes(k)));
    J.parts.forEach((X, i) => {
      const others = J.parts.filter((_, k) => k !== i);
      if (isSurface(X) || others.every(isSurface)) {
        rows.push(
          `${X.join('+')}: sewn onto a panel's face (flap / welt / patch) — no edge seam, not counted`,
        );
        return;
      }
      const g = others.some((Y) => touches(graphLinks, X, Y));
      declaredParts++;
      if (g) {
        joinedParts++;
        rows.push(`${X.join('+')}: graph ✓`);
        return;
      }
      lacks++;
      const d = others.some((Y) => touches(dollLinks, X, Y));
      if (d) proposedN++;
      if (d) joinedParts++;
      const how = report.orderJoins.filter(
        (o) => o.join === J.label && X.some((k) => o.seam.includes(`${k}#`)),
      );
      rows.push(
        `${X.join('+')}: graph ✗ · ${d ? `doll PROPOSES${how.length ? ` — ${how.map((o) => o.note).join('; ')}` : ' (free-loop proposal)'}` : 'doll ✗'}`,
      );
    });
    opsLines.push(
      `  «${J.label}» (${J.parts.map((x) => x.join('+')).join(' | ')})\n      ${rows.join('\n      ')}`,
    );
  }
  if (joins.length)
    opsLines.unshift(
      `source: ${opsSource} · ${joins.length} joins · parts the graph lacks: ${lacks} · of those the doll proposes: ${proposedN} (${lacks ? Math.round((100 * proposedN) / lacks) : 100} %)`,
    );

  // ── words ──
  const S = report.stats;
  const lines: string[] = [];
  lines.push(`# ${f.label} — size M`);
  lines.push(report.honesty);
  lines.push(
    `pieces ${graph.pieces.length} (drawn ${report.panels.length}) · graph seams ${graph.chosen.length} · vertices ${S.vertices} · triangles ${S.triangles}`,
  );
  lines.push(
    `time: parse ${fmt(msParse, 0)} ms · graph ${fmt(msGraph, 0)} ms · doll ${fmt(S.ms, 0)} ms (mesh ${fmt(S.msMesh, 0)}, solve ${fmt(S.msSolve, 0)}) · passes ${S.passes} · converged ${S.converged} · NaN ${S.nan}`,
  );
  lines.push(`paper strain: p99 ${fmt(S.stretchP99Pct)} % · max ${fmt(S.stretchMaxPct)} %`);
  const bucket = (pred: (s: DollReport['seams'][number]) => boolean) => report.seams.filter(pred);
  const g = bucket((s) => s.origin === 'graph');
  const count = (st: string) => g.filter((s) => s.state === st).length;
  lines.push(
    `graph seams: ${count('closed')} closed · ${count('eased')} eased · ${count('stretched')} stretched · ${count('open')} open · ${count('twisted')} twisted · ${bucket((s) => s.origin === 'layer').length} layer`,
  );
  if (f.truth) {
    const T = g.filter((s) => truthOf.get(s.id) === 'truth');
    const worstR = Math.max(0, ...T.map((s) => s.residualMaxMm));
    const worstS = Math.max(0, ...T.map((s) => s.stretchPct));
    lines.push(
      `TRUTH seams (${T.length}): residual max ${fmt(worstR)} mm · mean ${fmt(T.reduce((x, s) => x + s.residualMeanMm, 0) / Math.max(1, T.length))} mm · local strain max ${fmt(worstS)} %`,
    );
    // The body tube gate. A truth seam that would cross the doll as drawn (a shoulder read in the
    // wrong direction) counts as PROPOSED — its mirror reading is what is sewn — never as closed.
    // Eased seams (pleats, ease) are held to strain ≤ ease + 2 %, since paper cannot gather.
    const crossing = T.filter((s) => /wrong reading \(direction\)/.test(s.note));
    const mirrors = report.seams.filter(
      (s) =>
        s.origin === 'doll-proposed' &&
        crossing.some((c) => s.note.startsWith(`mirror reading of ${c.id.replace('~', ' ↔ ')}`)),
    );
    const mirrorOk = mirrors.filter((s) => s.residualP95Mm <= 3 && s.state !== 'open').length;
    const eased = T.filter((s) => s.state === 'eased');
    const tube = T.filter((s) => !crossing.includes(s));
    const notClosed = tube.filter((s) => s.state !== 'closed' && s.state !== 'eased').length;
    const tubeR = Math.max(0, ...tube.map((s) => s.residualP95Mm));
    const tubeMax = Math.max(0, ...tube.map((s) => s.residualMaxMm));
    const tubeS = Math.max(0, ...tube.filter((s) => !eased.includes(s)).map((s) => s.stretchPct));
    const easedBad = eased.filter((s) => {
      const m = /eased (\d+) %/.exec(s.note);
      return !m || s.stretchPct > Number(m[1]) + 2;
    }).length;
    lines.push(
      `TRUTH tube (${T.length}): closed ${tube.length - notClosed} · proposed ${crossing.length} (wrong reading (direction) — mirror reading closed ${mirrorOk} of ${crossing.length}) · not closed ${notClosed}; eased ${eased.length} by design, ${easedBad} beyond ease + 2 %: residual p95 ${fmt(tubeR)} mm (worst single point ${fmt(tubeMax)} mm) · local strain max ${fmt(tubeS)} %`,
    );
  }
  lines.push('');
  lines.push('## seams');
  for (const s of report.seams.filter((x) => x.origin !== 'layer')) {
    const t = truthOf.get(s.id);
    lines.push(
      `- [${s.state}${t ? ` · ${t}` : ''}${s.origin === 'doll-proposed' ? ' · doll' : ''}${s.decidedBy === 'person' ? ' · confirmed by a person' : s.decidedBy === 'engine' ? ' · engine, not decided' : ''}] ${s.id.length > 60 ? s.id.slice(0, 60) + '…' : s.id} — gap p95 ${fmt(s.residualP95Mm)} / max ${fmt(s.residualMaxMm)} mm (mean ${fmt(s.residualMeanMm)}), strain ${fmt(s.stretchPct)} % · ${s.note}`,
    );
  }
  if (report.rows) {
    lines.push(
      '',
      '## stored rows (L4)',
      `- ${rows?.length ?? 0} rows: ${report.rows.confirmed} confirmed seams applied (forced), ${report.rows.closures} closures, ${report.rows.rejected} rejected pairs excluded${wrongWords ? ` · NEGATIVE CONTROL: ${wrongWords}` : ''}`,
      ...report.rows.words.map((w) => `- not applied: ${w}`),
      '',
      `## contradictions (${report.contradictions?.length ?? 0})`,
      ...(report.contradictions ?? []).map((w) => `- ${w}`),
      '',
      '## front closures',
      ...(report.closures ?? []).map(
        (c) =>
          `- ${c.ok ? 'OK' : 'NOT OK'} ${c.id}: ${c.top} over ${c.under} · ${c.how} · CF lines meet p95 ${fmt(c.cfGapP95Mm)} mm · edges cross ${fmt(c.overlapMm, 0)} mm (expected ${fmt(c.offTopMm + c.offUnderMm, 0)}) · overlap outside ${fmt(c.outsidePct, 0)} %`,
      ),
    );
  }
  if (report.floating.length)
    lines.push('', '## floating', ...report.floating.map((x) => `- ${x.pieceKey}: ${x.reason}`));
  if (report.skipped.length)
    lines.push('', '## not drawn', ...report.skipped.map((x) => `- ${x.pieceKey}: ${x.reason}`));
  if (report.warnings.length)
    lines.push('', '## warnings', ...report.warnings.map((x) => `- ${x}`));
  lines.push(
    '',
    '## free loops of the body',
    ...report.loops.map(
      (l) => `- ${l.label}: ${fmt(l.lenMm, 0)} mm${l.closed ? '' : ' (open run)'}`,
    ),
  );
  if (opsLines.length) lines.push('', `## declared joins vs graph vs doll`, ...opsLines);
  // Sanity vs a fit model (never used as the proxy).
  const torso = report.proxies.find((p) => p.kind === 'torso');
  const fm = fitModels.find(
    (m) => m.gender === (f.gender ?? 'MALE') && m.m.CHEST && m.m.CHEST > 500,
  );
  if (torso && fm) {
    const k = Math.PI * (3 * (1 + 1 / 1.3) - Math.sqrt((3 + 1 / 1.3) * (1 + 3 / 1.3)));
    const chest = Math.max(...torso.profile.map((p) => p[1])) * k;
    lines.push(
      '',
      `sanity: the garment's own max girth (proxy) ${fmt(chest, 0)} mm vs fit model #${fm.id} (${fm.gender}) chest ${fm.m.CHEST} mm — ease ${fmt(chest - fm.m.CHEST, 0)} mm (the proxy is the pattern, not this body)`,
    );
  }
  // ── collar (04-COLLAR.md) ──
  const groupOf = new Map(report.panels.map((p) => [p.pieceKey, p.group]));
  for (const p of report.panels) for (const l of p.layers) groupOf.set(l, p.group);
  const neckish = (id: string) => ['STAND', 'COLLAR'].includes(groupOf.get(pk(id)) ?? '');
  const collarSeams = report.seams.filter(
    (s) => s.origin !== 'layer' && [...s.a, ...s.b].some(neckish),
  );
  const openCollar = collarSeams.filter((s) => s.state === 'open' || s.state === 'twisted');
  const C = report.collar;
  const unitRows = (C?.units ?? []).map((u) => {
    const sm = u.seam ? report.seams.find((s) => s.id === u.seam) : undefined;
    // A unit sewn by the graph to another collar unit (stacked, K4): its gap is that seam's.
    const via =
      sm || u.attached === 'not sewn'
        ? undefined
        : collarSeams.find(
            (s) => s.state !== 'open' && [...s.a, ...s.b].some((id) => u.keys.includes(pk(id))),
          );
    const g = sm ?? via;
    return {
      role: u.role,
      keys: u.keys.join('+'),
      base: u.base,
      ease: u.ease,
      sewnMm: u.sewnMm,
      baseMm: u.baseMm,
      extMm: u.extMm,
      gapP95: g ? g.residualP95Mm : NaN,
      gapMax: g ? g.residualMaxMm : NaN,
      state: g ? g.state : u.attached,
      attached: u.attached,
      via: !sm && via ? via.id : null,
      outerY: u.outerYMm,
      baseY: u.baseYMm,
      outsidePct: u.outsidePct,
      anchors: u.anchors,
      layer: u.layer,
      ...(u.folds ? { folds: u.folds } : {}),
    };
  });
  if (C) {
    lines.push('', '## collar');
    if (C.neck)
      lines.push(
        `- neck path: ${fmt(C.neck.lenMm, 0)} mm ${C.neck.closed ? 'CLOSED' : 'OPEN'} · ${fmt(100 * C.neck.ratio, 0)} % of the girth ${fmt(C.neck.chestMm, 0)} mm · ${C.neck.ok ? 'K1' : 'FALLBACK'} · ${C.neck.how}`,
      );
    else lines.push('- neck path: none');
    for (const u of unitRows)
      lines.push(
        `- ${u.role} ${u.keys} on the ${u.base}: sewn ${fmt(u.sewnMm, 0)} mm / base ${fmt(u.baseMm, 0)} mm = ease ${fmt(u.ease, 3)} · extensions ${fmt(u.extMm, 0)} mm · gap p95 ${fmt(u.gapP95)} / max ${fmt(u.gapMax)} mm (${u.state}${u.via ? ` via ${u.via}` : ''}) · layer ${u.layer}${u.folds?.length ? ` · folded ${u.folds.join(' + ')} mm` : ''}${u.outerY !== undefined ? ` · outer edge y ${fmt(u.outerY!, 0)} vs ${u.role === 'fall' ? 'stand top' : 'roll line'} y ${fmt(u.baseY!, 0)} (${u.outerY! < u.baseY! ? 'turned DOWN' : 'NOT turned down'}) · ${fmt(u.outsidePct!, 1)} % of its free vertices outside the ${u.role === 'fall' ? 'stand' : 'standing part'}` : ''} · ${u.anchors}`,
      );
    lines.push(
      `- open collar seams: ${openCollar.length}${openCollar.length ? ` (${openCollar.map((s) => s.id).join(', ')})` : ''}`,
    );
    for (const n of C.notes) lines.push(`- note: ${n}`);
  }
  const text = lines.join('\n');
  await writeFile(resolve(outDir, `${f.id}.txt`), text + '\n');

  // ── scene for the page ──
  const P = report.positions;
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const sewn = new Set<number>();
  for (const s of report.seams)
    if (s.state !== 'open' && s.state !== 'twisted' && s.origin !== 'layer')
      for (const v of [...s.pathA, ...s.pathB]) sewn.add(v);
  const scene = {
    id: f.id,
    title: `${f.label} · M`,
    honesty: report.honesty,
    lines: [
      `${report.panels.length} panels · ${S.vertices} vertices · ${fmt(S.ms, 0)} ms · ${S.converged ? 'settled' : 'NOT settled'}`,
      `graph seams ${count('closed') + count('eased')} closed · ${count('open')} open · ${count('stretched')} stretched · ${bucket((s) => s.state === 'proposed').length} proposed`,
      `paper strain p99 ${fmt(S.stretchP99Pct)} %`,
    ],
    panels: report.panels.map((p) => ({
      key: p.pieceKey,
      group: p.group,
      pos: Array.from(P.subarray(3 * p.offset, 3 * (p.offset + p.count)), r1),
      tris: Array.from(p.tris),
      boundary: Array.from(p.boundary),
    })),
    seams: report.seams
      .filter((s) => s.origin !== 'layer' && s.pathA.length)
      .map((s) => {
        // An open seam's side that another seam sews anyway (a crossed shoulder whose mirror
        // reading is sewn, a wrong pairing onto an underarm the doll closed) is not drawn red.
        const open = s.state === 'open' || s.state === 'twisted';
        const side = (path: Uint32Array) => {
          if (open && [...path].filter((v) => sewn.has(v)).length >= 0.8 * path.length) return [];
          return Array.from(path).flatMap((v) => [
            r1(P[3 * v]),
            r1(P[3 * v + 1]),
            r1(P[3 * v + 2]),
          ]);
        };
        return { state: s.state, kind: s.kind, a: side(s.pathA), b: side(s.pathB) };
      })
      .filter((s) => s.a.length || s.b.length),
  };
  await writeFile(resolve(outDir, `${f.id}.scene.json`), JSON.stringify(scene));
  console.log(text.split('\n').slice(0, 7).join('\n'));
  console.log('');
  summary.push({
    id: f.id,
    ms: S.ms,
    msGraph,
    nan: S.nan,
    converged: S.converged,
    p99: S.stretchP99Pct,
    lacks,
    proposed: proposedN,
    declaredParts,
    joinedParts,
    fromOrder: report.seams.filter((x) => x.kind === 'from-order').length,
    fromOrderClosed: report.seams.filter((x) => x.kind === 'from-order' && x.state !== 'open')
      .length,
    travelP99: Number(/travel p99 ([\d.]+)/.exec(report.warnings.join('\n'))?.[1] ?? NaN),
    closedGraph: count('closed') + count('eased'),
    ...(report.rows
      ? (() => {
          const grp = new Map(report.panels.map((p) => [p.pieceKey, p.group]));
          for (const p of report.panels) for (const l of p.layers) grp.set(l, p.group);
          const gOf = (ids: string[]) => new Set<string>(ids.map((id) => grp.get(pk(id)) ?? ''));
          const live = report.seams.filter((x) => x.origin !== 'layer');
          const isOpen = (x: (typeof live)[number]) => x.state === 'open' || x.state === 'twisted';
          // Attached = the cap seam is sewn shut (p95 gap ≤ 3 mm, not open / twisted); the strain
          // it takes (paper cannot ease a cap) is reported next to it, not hidden.
          const sleeveOn = (side: 'SLEEVE_L' | 'SLEEVE_R') => {
            const caps = live.filter((x) => {
              const A = gOf(x.a);
              const B = gOf(x.b);
              return (A.has(side) && B.has('BODY')) || (B.has(side) && A.has('BODY'));
            });
            const on = caps.some((x) => !isOpen(x) && x.residualP95Mm <= 3);
            const words = caps
              .map(
                (x) =>
                  `${x.state}, gap p95 ${x.residualP95Mm.toFixed(1)} mm, strain ${x.stretchPct.toFixed(1)} %`,
              )
              .join('; ');
            return { on, words: words || 'no cap seam' };
          };
          const between = (g1: string, g2: string) =>
            live.filter((x) => {
              const A = gOf(x.a);
              const B = gOf(x.b);
              return (A.has(g1) && B.has(g2)) || (A.has(g2) && B.has(g1));
            });
          const legsJoined = between('LEG_L', 'LEG_R');
          const band = live.filter((x) => gOf(x.a).has('WAISTBAND') || gOf(x.b).has('WAISTBAND'));
          return {
            gold: {
              rows: rows?.length ?? 0,
              open: live.filter(isOpen).map((x) => `${x.id} (${x.state}, ${x.decidedBy ?? '-'})`),
              stretched: live.filter((x) => x.state === 'stretched').map((x) => x.id),
              confirmedOpen: live.filter((x) => x.decidedBy === 'person' && isOpen(x)).length,
              contradictions: report.contradictions ?? [],
              closures: report.closures ?? [],
              sleeves: { L: sleeveOn('SLEEVE_L'), R: sleeveOn('SLEEVE_R') },
              rise: legsJoined.map((x) => `${x.id}: ${x.state}`),
              riseOk: legsJoined.length > 0 && legsJoined.every((x) => !isOpen(x)),
              band: band.map((x) => `${x.id}: ${x.state}`),
              bandOk:
                report.panels.some((p) => p.group === 'WAISTBAND') &&
                band.some((x) => x.decidedBy === 'person') &&
                band.every((x) => !isOpen(x)),
              wrong: wrongWords,
            },
          };
        })()
      : {}),
    collar: C
      ? {
          neckMm: C.neck?.lenMm ?? null,
          neckClosed: C.neck?.closed ?? null,
          neckOk: C.neck?.ok ?? null,
          chestMm: C.neck?.chestMm ?? null,
          ratio: C.neck?.ratio ?? null,
          units: unitRows,
          openCollar: openCollar.map((s) => s.id),
        }
      : null,
  });
}
await writeFile(resolve(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
// K1 negative control on synthetic boundaries (no pattern): pullover closed, open front open.
const fx = neckFixtures();
await writeFile(resolve(outDir, 'neck-fixture.json'), JSON.stringify(fx, null, 2));
console.log(`neck fixtures: ${JSON.stringify(fx)}`);
