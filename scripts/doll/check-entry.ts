// yarn doll:check — node half. For each file: product DXF parser → seam graph (pipeline.readSeamGraph,
// the graph the screen uses) → lib/doll solveDoll → scene JSON for the WebGL page + a report in
// words. Truth (assembly-from-pattern/probe/truth) marks which graph seams are real; prod cards'
// technologist ops say which joins must exist (which the graph lacks, which the doll proposes).

import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { readSeamGraph } from '../../src/lib/assembly-skeleton/pipeline';
import type { SkeletonCategory } from '../../src/lib/assembly-skeleton/types';
import { solveDoll } from '../../src/lib/doll';
import type { DollReport } from '../../src/lib/doll/types';
import { labelMapper, loadFacts } from '../assembly-skeleton/seams-entry';

type FileSpec = {
  id: string;
  label: string;
  dxf: string;
  category: SkeletonCategory;
  truth?: string;
  card?: string;
  gender?: 'MALE' | 'FEMALE';
  drop?: string[];
};

const [specPath, outDir] = process.argv.slice(2);
if (process.env.DOLL_NOPROXY) (globalThis as { __DOLL_NOPROXY?: boolean }).__DOLL_NOPROXY = true;
const spec = JSON.parse(await readFile(specPath, 'utf8')) as {
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
  const { facts, origin } = await quiet(() => loadFacts(bytes, 'M', f.category));
  const tGraph = performance.now();
  const graph = await quiet(() => readSeamGraph(facts));
  const msGraph = performance.now() - tGraph;
  const msParse = tGraph - tParse;
  const report: DollReport = solveDoll({
    graph,
    facts,
    options: {
      debug: true,
      dropSeams: f.drop,
      ...(spec.maxPasses !== undefined ? { maxPasses: spec.maxPasses } : {}),
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

  // ── technologist's ops (prod cards) ──
  const opsLines: string[] = [];
  if (f.card && cards[f.card]) {
    const card = cards[f.card];
    const nameOf = new Map(card.pieces.map((p) => [p[0], p[1]]));
    const units = new Map<string, string[]>();
    const inDxf = new Set(graph.pieces.map((p) => p.pieceKey));
    const leaves = (key: string): string[] => {
      if (nameOf.has(key)) return [nameOf.get(key)!];
      return units.get(key) ?? [];
    };
    for (const [inputs, out, , type] of card.ops) {
      if (type !== 'MACHINE' || !out) continue;
      const parts = inputs.split('+').map((k) => leaves(k).filter((n) => inDxf.has(n)));
      units.set(out, [...new Set([...(units.get(out) ?? []), ...parts.flat()])]);
      const present = parts.filter((p) => p.length);
      if (present.length < 2) continue;
      const linked = (
        x: string[],
        y: string[],
        kinds: (s: DollReport['seams'][number]) => boolean,
      ) =>
        report.seams.some(
          (s) =>
            kinds(s) &&
            ((s.a.some((e) => x.includes(pk(e))) && s.b.some((e) => y.includes(pk(e)))) ||
              (s.a.some((e) => y.includes(pk(e))) && s.b.some((e) => x.includes(pk(e))))),
        );
      const pairs: string[] = [];
      for (let i = 0; i < present.length; i++)
        for (let j = i + 1; j < present.length; j++) {
          const x = present[i];
          const y = present[j];
          const inGraph = graph.chosen.some((s) => {
            const a = (s.aParts ?? [s.a]).map(pk);
            const b = (s.bParts ?? [s.b]).map(pk);
            return (
              (a.some((k) => x.includes(k)) && b.some((k) => y.includes(k))) ||
              (a.some((k) => y.includes(k)) && b.some((k) => x.includes(k)))
            );
          });
          const doll = linked(
            x,
            y,
            (s) => s.origin === 'doll-proposed' && s.kind !== 'facing-free',
          );
          const closedDoll = linked(x, y, (s) => s.origin === 'graph' && s.state !== 'open');
          const tag = inGraph
            ? closedDoll
              ? 'graph ✓ closed'
              : 'graph, doll left it open'
            : doll
              ? 'graph ✗ · doll PROPOSES it'
              : 'graph ✗ · doll ✗';
          pairs.push(`${x.join('+')} ⟷ ${y.join('+')}: ${tag}`);
        }
      opsLines.push(
        `  «${out}» (${inputs
          .split('+')
          .map((k) => nameOf.get(k) ?? k)
          .join(' + ')})\n      ${pairs.join('\n      ')}`,
      );
    }
  }

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
    // The body tube gate: truth seams the doll can sew as drawn. Seams that cross the doll (a
    // shoulder drawn to the other side) are reported apart — their mirror reading is proposed —
    // and eased seams (pleats, ease) are held to strain ≤ ease + 2 %, since paper cannot gather.
    const crossing = T.filter((s) => /crosses the doll/.test(s.note));
    const eased = T.filter((s) => s.state === 'eased');
    const tube = T.filter((s) => !crossing.includes(s));
    const tubeR = Math.max(0, ...tube.map((s) => s.residualP95Mm));
    const tubeMax = Math.max(0, ...tube.map((s) => s.residualMaxMm));
    const tubeS = Math.max(0, ...tube.filter((s) => !eased.includes(s)).map((s) => s.stretchPct));
    const easedBad = eased.filter((s) => {
      const m = /eased (\d+) %/.exec(s.note);
      return !m || s.stretchPct > Number(m[1]) + 2;
    }).length;
    lines.push(
      `TRUTH tube (${tube.length}; ${crossing.length} crossing the doll reported apart; ${eased.length} eased by design, ${easedBad} beyond ease + 2 %): residual p95 ${fmt(tubeR)} mm (worst single point ${fmt(tubeMax)} mm) · local strain max ${fmt(tubeS)} %`,
    );
  }
  lines.push('');
  lines.push('## seams');
  for (const s of report.seams.filter((x) => x.origin !== 'layer')) {
    const t = truthOf.get(s.id);
    lines.push(
      `- [${s.state}${t ? ` · ${t}` : ''}${s.origin === 'doll-proposed' ? ' · doll' : ''}] ${s.id.length > 60 ? s.id.slice(0, 60) + '…' : s.id} — gap p95 ${fmt(s.residualP95Mm)} / max ${fmt(s.residualMaxMm)} mm (mean ${fmt(s.residualMeanMm)}), strain ${fmt(s.stretchPct)} % · ${s.note}`,
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
  if (opsLines.length)
    lines.push('', `## technologist's joins (card ${f.card}) vs graph vs doll`, ...opsLines);
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
  });
}
await writeFile(resolve(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
