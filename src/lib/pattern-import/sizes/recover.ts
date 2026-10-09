// sizes/ — size-class recovery for every encoding, one output shape (F3; detection shared with F5).
//
//   encoding        identity of a size line           order (rank 0 = smallest)
//   file-per-size   source file                       label order (file name) else nesting
//   ocg             optional-content group name       label order
//   declared-dash   declared dash pattern (3 % tol.)  nesting order in bundles + inside vote
//   text-label      nearest size token ("44") text     label order
//   subpath-dash /  look (rhythm, decorations,        nesting order in bundles + inside vote
//   separate-dash   stroke) aligned across bundles
//
// Every encoding ends the same way: chains → rank, the SHARED parts of size lines (a stretch drawn
// once in the style of one size where the other sizes have landed on it) split off as common,
// bundles cut to ≤ n and written rank-ordered, evidence + confidence per class, ambiguities for the
// operator. Labels come from the encoding itself (OCG, file, text near lines) or from a size run
// found in the text with the same count.
import type {
  Bundle,
  Chain,
  ChainAmbiguity,
  ClassEvidence,
  IRText,
  PtMm,
  Sheet,
  SizeEncoding,
  Style,
} from 'lib/pattern-import/types';

import { BUNDLE, crossSections, splitSection, type CrossSection } from '../chains/bundles';
import { clusterLooks, dashCluster } from '../chains/classify';
import { dist, endTangent, PtGrid, resample, SegGrid, segNearest } from '../chains/geom';
import { cosine, describeSig, type Signature } from '../chains/motif';
import { type Group } from './align';
import { ranksFromCoords, seriate } from './seriate';
import { bridgeSameRank, landEnds, type Landing } from './land';
import { parseSizeToken, runsInText, runsInTokens, type TextRun } from './tokens';

export type RecoverInput = {
  sheet: Sheet;
  chains: Chain[];
  sigs: Signature[];
  furniture: (string | null)[];
  /** Op-linked chains (≥ 2 subpaths of one operation): tells subpath-dash from separate-dash. */
  opLinked: boolean[];
  /** Known size count (operator / previous stage). */
  sizeCount?: number;
  /** Texts outside the sheet (instruction pages) — size runs live there. */
  extraTexts?: string[];
  /** File names by FileId (file-per-size labels). */
  fileNames?: Map<string, string>;
};

export type SizeClassOut = {
  rank: number;
  label: string | null;
  chains: number[];
  evidence: ClassEvidence[];
  confidence: number;
  looks: string[];
};

export type RecoverOut = {
  encoding: SizeEncoding;
  n: number;
  sizes: SizeClassOut[];
  /** Chain id → rank for size chains. */
  rankOf: Map<number, number>;
  common: number[];
  /** Common pieces split off size chains: new chain id → rank whose style drew it. */
  sharedFrom: Map<number, number>;
  internal: number[];
  ignore: { id: number; why: string }[];
  orphans: number[];
  bundles: Bundle[];
  ambiguities: ChainAmbiguity[];
  /** Chains, possibly extended by splits (ids = indices). */
  chains: Chain[];
  runEvidence: string[];
  diag: Record<string, unknown>;
};


function lenOf(chains: Chain[], ids: Iterable<number>) {
  let L = 0;
  for (const i of ids) L += chains[i].lengthMm;
  return L;
}

/** Signed total turning (rad) of a polyline — > 0 turns left (counter-clockwise). */
function turning(pts: PtMm[]): number {
  let t = 0;
  for (let i = 1; i + 1 < pts.length; i++) {
    const ax = pts[i].x - pts[i - 1].x;
    const ay = pts[i].y - pts[i - 1].y;
    const bx = pts[i + 1].x - pts[i].x;
    const by = pts[i + 1].y - pts[i].y;
    t += Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
  }
  return t;
}

/** Texts that are size tokens, with the nearest chain within `maxMm`. */
function tokenHits(texts: IRText[], chains: Chain[], ok: boolean[], maxMm: number) {
  const grid = new SegGrid(8);
  chains.forEach((c, i) => {
    if (ok[i]) grid.addPolyline(i, c.pts);
  });
  const out: { text: IRText; label: string; value: number; chain: number; d: number }[] = [];
  for (const t of texts) {
    const tok = parseSizeToken(t.text, true);
    if (!tok) continue;
    const c = { x: (t.bbox.minX + t.bbox.maxX) / 2, y: (t.bbox.minY + t.bbox.maxY) / 2 };
    let best = maxMm;
    let bi = -1;
    grid.near(c, maxMm, (ci, si) => {
      const r = segNearest(c, chains[ci].pts[si], chains[ci].pts[si + 1]);
      if (r.d < best) {
        best = r.d;
        bi = ci;
      }
    });
    if (bi >= 0) out.push({ text: t, label: tok.label, value: tok.value, chain: bi, d: best });
  }
  return out;
}

export function recoverSizes(inp: RecoverInput): RecoverOut {
  const { sheet, sigs, furniture } = inp;
  const chains = inp.chains.slice();
  const styles = new Map<number, Style>(sheet.styles.map((s) => [s.id, s]));
  const ambiguities: ChainAmbiguity[] = [];
  const diag: Record<string, unknown> = {};
  const N0 = chains.length;
  const cand = chains.map((c, i) => !furniture[i] && c.lengthMm >= 8);
  const blockers = chains.map((_, i) => !furniture[i]);
  const totalCand = lenOf(chains, chains.map((_, i) => i).filter((i) => cand[i]));

  // ── looks and a first bundle pass over every line ───────────────────────────────────────────
  const looks = clusterLooks(chains, sigs, cand);
  const nLooks = looks.centroids.length;
  const xsA = crossSections(chains, cand, cand);
  const wideShare = chains.map((_, i) => (xsA.samples[i] ? xsA.wide[i] / xsA.samples[i] : 0));
  const lookLen = new Array(nLooks).fill(0);
  const lookBundled = new Array(nLooks).fill(0);
  chains.forEach((c, i) => {
    const l = looks.look[i];
    if (l < 0) return;
    lookLen[l] += c.lengthMm;
    lookBundled[l] += c.lengthMm * wideShare[i];
  });
  const inBigLen = (i: number) => chains[i].lengthMm * wideShare[i];
  const lookDesc = (l: number) => {
    let best = -1;
    let bl = 0;
    chains.forEach((c, i) => {
      if (looks.look[i] === l && c.lengthMm > bl) {
        bl = c.lengthMm;
        best = i;
      }
    });
    return best >= 0 ? describeSig(sigs[best]) : '?';
  };

  // ── encoding ────────────────────────────────────────────────────────────────────────────────
  const fileLen = new Map<string, number>();
  const layerLen = new Map<string, number>();
  const pathFile = new Map(sheet.paths.map((p) => [p.id, p.src.file]));
  chains.forEach((c, i) => {
    if (!cand[i]) return;
    const f = pathFile.get(c.ranges[0]?.path ?? -1) ?? '';
    fileLen.set(f, (fileLen.get(f) ?? 0) + c.lengthMm);
    const layer = styles.get(c.style)?.layer;
    if (layer) layerLen.set(layer, (layerLen.get(layer) ?? 0) + c.lengthMm);
  });
  const sizeLayers = [...layerLen.entries()].filter(([name, L]) => parseSizeToken(name, true) && L >= 0.02 * totalCand);
  const bigFiles = [...fileLen.entries()].filter(([, L]) => L >= 0.05 * totalCand);
  // declared dashes among candidates
  const dashed = chains
    .map((c, i) => ({ i, st: styles.get(c.style) }))
    .filter(({ i, st }) => cand[i] && st?.dash && st.dash.some((v) => v > 0.01));
  const dclAll = dashCluster(dashed.map(({ i, st }) => ({ dash: st!.dash!, len: chains[i].lengthMm })));
  diag.dashClusters = dclAll.map((c) => `${c.rep.map((v) => v.toFixed(2)).join('/')}:${(c.len / 1000).toFixed(2)}m`);
  const dclusters = dclAll.filter((c) => c.len >= Math.max(600, 0.015 * totalCand));
  const allTexts = sheet.texts;
  const hits0 = tokenHits(allTexts, chains, cand, 6);
  // labels ALONG long lines (r4454) vs labels next to short sample strokes (a legend: viola p29)
  const onLine = hits0.filter((h) => chains[h.chain].lengthMm >= 150);
  const legendHits0 = legendEndHits(allTexts, chains, cand);
  const hitRun = labelRun(onLine, 2);
  let hits = onLine.filter((h) => hitRun.has(h.label));
  {
    // labels along lines are spread over the sheet; a cluster in one corner is a table or legend
    const cells = new Set(hits.map((h) => `${Math.floor(h.text.anchor.x / 150)},${Math.floor(h.text.anchor.y / 150)}`));
    if (cells.size < 3) hits = [];
  }
  const legendRun = labelRun(legendHits0, 1);
  const legendHits = legendHits0.filter((h) => legendRun.has(h.label));
  const hitLabels = new Map<string, number>();
  for (const h of hits) hitLabels.set(h.label, (hitLabels.get(h.label) ?? 0) + 1);

  let encoding: SizeEncoding;
  // unit per chain: the identity hint the alignment works with
  const unit = new Array(chains.length).fill(-1);
  let unitNames: string[] = [];
  let unitEvidence: ClassEvidence[][] = [];
  let labelOrderKnown = false;
  if (bigFiles.length >= 2) {
    encoding = 'file-per-size';
    unitNames = bigFiles.map(([f]) => f);
    unitEvidence = bigFiles.map(([f]) => [{ kind: 'file', file: f, label: inp.fileNames?.get(f) ?? f }]);
    chains.forEach((c, i) => {
      if (!cand[i]) return;
      unit[i] = unitNames.indexOf(pathFile.get(c.ranges[0]?.path ?? -1) ?? '');
    });
    labelOrderKnown = bigFiles.every(([f]) => !!fileSizeLabel(inp.fileNames?.get(f) ?? ''));
  } else if (sizeLayers.length >= 3) {
    encoding = 'ocg';
    unitNames = sizeLayers.map(([n]) => n);
    unitEvidence = unitNames.map((name) => [{ kind: 'ocg', name }]);
    chains.forEach((c, i) => {
      if (!cand[i]) return;
      unit[i] = unitNames.indexOf(styles.get(c.style)?.layer ?? '');
    });
    labelOrderKnown = true;
  } else if (dclusters.length >= 2) {
    encoding = 'declared-dash';
    unitNames = dclusters.map((c) => `dash ${c.rep.map((v) => v.toFixed(2)).join('/')}`);
    unitEvidence = dclusters.map((c) => [{ kind: 'declared-dash', dash: c.rep }]);
    dclusters.forEach((c, u) => {
      for (const m of c.members) unit[dashed[m].i] = u;
    });
  } else if (hitLabels.size >= 3 && hits.length >= 3 * hitLabels.size) {
    encoding = 'text-label';
  } else {
    // rhythm: which looks are size lines = the ones that live in bundles
    let opL = 0;
    let allL = 0;
    chains.forEach((_, i) => {
      if (!cand[i]) return;
      allL += inBigLen(i);
      if (inp.opLinked[i]) opL += inBigLen(i);
    });
    const opShare = opL / Math.max(1, allL);
    encoding = opShare >= 0.5 ? 'subpath-dash' : 'separate-dash';
  }
  diag.encoding = encoding;

  // size-coded looks (for rhythm / text-label, and to admit an undeclared solid size in declared)
  const sizeLook = new Array(nLooks).fill(false);
  for (let l = 0; l < nLooks; l++) sizeLook[l] = lookLen[l] >= 300 && lookBundled[l] / lookLen[l] >= 0.35;
  if (encoding === 'subpath-dash' || encoding === 'separate-dash' || encoding === 'text-label') {
    unitNames = [];
    unitEvidence = [];
    const map = new Map<number, number>();
    for (let l = 0; l < nLooks; l++)
      if (sizeLook[l]) {
        map.set(l, unitNames.length);
        unitNames.push(lookDesc(l));
        let motif: number[] | null = null;
        chains.forEach((c, i) => {
          if (!motif && looks.look[i] === l && c.motif) motif = c.motif;
        });
        unitEvidence.push(motif ? [{ kind: 'recovered-motif', motif }] : []);
      }
    chains.forEach((_, i) => {
      const l = looks.look[i];
      if (cand[i] && l >= 0 && map.has(l)) unit[i] = map.get(l)!;
    });
  } else if (encoding === 'declared-dash') {
    // a solid look bundled alongside declared classes is one more size (robe: 5 dashes + 1 solid)
    const declaredSet = new Set(chains.map((_, i) => i).filter((i) => unit[i] >= 0));
    for (let l = 0; l < nLooks; l++) {
      if (!sizeLook[l]) continue;
      const members = chains.map((_, i) => i).filter((i) => looks.look[i] === l && unit[i] < 0);
      if (!members.length || members.some((i) => declaredSet.has(i))) continue;
      const memberSet = new Set(members);
      let declaredNeighbours = 0;
      for (const x of xsA.sections) {
        if (!memberSet.has(x.from)) continue;
        const k = x.lanes.findIndex((l) => l.includes(x.from));
        const nb = [x.lanes[k - 1], x.lanes[k + 1]].filter(Boolean).flat();
        if (nb.some((c) => declaredSet.has(c))) declaredNeighbours++;
      }
      if (declaredNeighbours < 3) continue;
      const u = unitNames.length;
      unitNames.push(lookDesc(l));
      unitEvidence.push([]);
      for (const i of members) unit[i] = u;
    }
  }
  const nUnits = unitNames.length;

  // ── cross-sections over size candidates; every other line blocks ────────────────────────────
  const sizeCand = chains.map((_, i) => cand[i] && unit[i] >= 0);
  if (encoding === 'text-label') for (let i = 0; i < chains.length; i++) if (cand[i] && looks.look[i] >= 0 && sizeLook[looks.look[i]]) sizeCand[i] = true;
  const xsB = crossSections(chains, sizeCand, blockers).sections;
  const laneUnit = (lane: number[]) => majorityUnit(lane, unit, chains);
  const laneHist = new Map<number, number>();
  for (const x of xsB) laneHist.set(x.lanes.length, (laneHist.get(x.lanes.length) ?? 0) + 1);
  diag.sectionLanes = Object.fromEntries([...laneHist].sort((a, b) => a[0] - b[0]));

  // ── size count n ────────────────────────────────────────────────────────────────────────────
  const texts = [...allTexts.map((t) => t.text), ...(inp.extraTexts ?? [])];
  const runs: TextRun[] = [...runsInText(texts), ...runsInTokens(allTexts.map((t) => t.text))];
  const coverage = (nn: number) => {
    let cov = 0;
    for (const x of xsB) {
      if (x.lanes.length < nn) continue;
      for (const g of x.lanes.length > nn ? splitSection(x, nn, laneUnit) : [x.lanes.map((_, k) => k)]) {
        if (g.length !== nn) continue;
        const us = g.map((k) => laneUnit(x.lanes[k])).filter((u) => u >= 0);
        if (new Set(us).size === us.length) cov += nn;
      }
    }
    return cov;
  };
  let n: number;
  let nWhy: string;
  if (inp.sizeCount) {
    n = inp.sizeCount;
    nWhy = 'given';
  } else if (encoding === 'ocg' || encoding === 'file-per-size' || encoding === 'declared-dash') {
    n = nUnits;
    nWhy = `${nUnits} ${encoding} classes`;
  } else if (encoding === 'text-label') {
    n = hitLabels.size;
    nWhy = `${hitLabels.size} size labels near lines`;
  } else {
    // widest window of lanes without a repeated look, per section: sizes side by side
    const distinctHist = new Map<number, number>();
    for (const x of xsB) {
      const us = x.lanes.map(laneUnit);
      let best = 0;
      for (let a = 0; a < us.length; a++) {
        const seen = new Set<number>();
        let b = a;
        for (; b < us.length; b++) {
          if (us[b] >= 0 && seen.has(us[b])) break;
          if (us[b] >= 0) seen.add(us[b]);
        }
        best = Math.max(best, b - a);
      }
      distinctHist.set(best, (distinctHist.get(best) ?? 0) + 1);
    }
    const modeFreq = Math.max(...[...distinctHist].filter(([k]) => k >= 3).map(([, v]) => v), 0);
    const widths = [...distinctHist].filter(([k, v]) => k >= 3 && v >= 0.15 * modeFreq).map(([k]) => k);
    const scores: [number, number][] = [];
    for (let nn = 3; nn <= 12; nn++) scores.push([nn, coverage(nn)]);
    scores.sort((a, b) => b[1] - a[1]);
    n = widths.length ? Math.max(...widths) : scores[0][1] > 0 ? scores[0][0] : Math.max(2, nUnits);
    nWhy = `widest look-distinct lane run (${[...distinctHist].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(' ')})`;
    diag.coverage = scores.slice(0, 4).map(([k, v]) => `${k}:${v}`).join(' ');
    const runN = new Set(runs.filter((r) => r.labels.length >= 3 && (r.keyword || r.kind === 'legend')).map((r) => r.labels.length));
    if (legendRun.size >= 3) runN.add(legendRun.size);
    if (runN.size && !runN.has(n)) {
      // a printed legend / "sizes 72, 76, 80, 84, 88" outranks geometry when geometry supports it at all
      const alt = scores.filter(([k]) => runN.has(k)).sort((a, b) => b[1] - a[1])[0];
      const legendBacked = alt && alt[0] === legendRun.size;
      if (alt && (alt[1] >= 0.15 * scores[0][1] || (legendBacked && alt[1] > 0))) {
        nWhy += ` → ${alt[0]} (text run of ${alt[0]})`;
        n = alt[0];
      } else
        ambiguities.push({
          kind: 'size-count',
          message: `geometry says ${n} sizes, text runs say ${[...runN].join('/')}`,
          classes: [],
          chains: [],
          at: null,
        });
    }
  }
  diag.n = { n, why: nWhy };

  // ── groups of ≤ n lanes ─────────────────────────────────────────────────────────────────────
  type G = { x: CrossSection; lanes: number[]; group: Group };
  const groups: G[] = [];
  let superSplit = 0;
  for (const x of xsB) {
    const parts = x.lanes.length > n ? splitSection(x, n, laneUnit) : [x.lanes.map((_, k) => k)];
    if (parts.length > 1) superSplit++;
    for (const p of parts) {
      if (p.length < 2) continue;
      // only the group holding the section's own chain: other groups are seen from their own chains
      if (!p.some((k) => x.lanes[k].includes(x.from))) continue;
      groups.push({ x, lanes: p, group: { units: p.map((k) => laneUnit(x.lanes[k])), weights: p.map(() => 1), flip: false } });
    }
  }
  diag.groups = { total: groups.length, full: groups.filter((g) => g.lanes.length === n).length, superSplit };

  // ── positions ───────────────────────────────────────────────────────────────────────────────
  const rankOf = new Map<number, number>();
  const unitRank = new Array(nUnits).fill(-1);
  const unitPurity = new Array(nUnits).fill(0);
  const hitByChain = new Map<number, string[]>();
  for (const h of hits) {
    const a = hitByChain.get(h.chain);
    if (a) a.push(h.label);
    else hitByChain.set(h.chain, [h.label]);
  }
  let labels: (string | null)[] = new Array(n).fill(null);
  const labelEvidence: ClassEvidence[][] = Array.from({ length: n }, () => []);
  // votes[chain] = weight per rank
  const votes = new Map<number, number[]>();
  const vote = (c: number, r: number, w: number) => {
    if (r < 0 || r >= n) return;
    let v = votes.get(c);
    if (!v) {
      v = new Array(n).fill(0);
      votes.set(c, v);
    }
    v[r] += w;
  };
  const settle = (minShare: number) => {
    for (const [c, v] of votes) {
      const tot = v.reduce((a, b) => a + b, 0);
      let best = -1;
      let bw = 0;
      v.forEach((w, r) => {
        if (w > bw) {
          bw = w;
          best = r;
        }
      });
      if (best >= 0 && bw / tot >= minShare && !rankOf.has(c)) rankOf.set(c, best);
    }
  };

  if (encoding === 'ocg' || (encoding === 'file-per-size' && labelOrderKnown)) {
    const tok = unitNames.map((u, k) => ({
      k,
      t: parseSizeToken(encoding === 'ocg' ? u : fileSizeLabel(inp.fileNames?.get(u) ?? '') ?? '', true),
    }));
    tok.sort((a, b) => (a.t?.value ?? 0) - (b.t?.value ?? 0));
    tok.forEach(({ k, t }, r) => {
      unitRank[k] = r;
      unitPurity[k] = 1;
      labels[r] = t?.label ?? unitNames[k];
    });
    chains.forEach((_, i) => {
      if (unit[i] >= 0 && unitRank[unit[i]] >= 0) rankOf.set(i, unitRank[unit[i]]);
    });
    // cross-check: does the nesting order agree with the label order? (inside vote, informational)
    let agree = 0;
    let against = 0;
    for (const g of groups) {
      const A = closureArea(chains[g.x.from].pts);
      if (Math.abs(A) < 100) continue;
      const rs = g.lanes.map((k) => (unit[g.x.lanes[k][0]] >= 0 ? unitRank[unit[g.x.lanes[k][0]]] : -1));
      for (let k = 1; k < rs.length; k++) {
        if (rs[k] < 0 || rs[k - 1] < 0 || rs[k] === rs[k - 1]) continue;
        // lanes run toward +normal (left); A > 0 = interior on the left = ranks should fall there
        const inc = rs[k] > rs[k - 1];
        if (inc === A < 0) agree++;
        else against++;
      }
    }
    diag.nestingCheck = { agree, against };
  } else if (encoding === 'text-label') {
    const order = [...hitLabels.keys()].map((l) => parseSizeToken(l, true)!).sort((a, b) => a.value - b.value);
    labels = order.map((t) => t.label);
    const rankOfLabel = new Map(order.map((t, r) => [t.label, r]));
    const laneLabel = (lane: number[]) => {
      const m = new Map<number, number>();
      for (const c of lane) for (const l of hitByChain.get(c) ?? []) m.set(rankOfLabel.get(l)!, (m.get(rankOfLabel.get(l)!) ?? 0) + 1);
      let best = -1;
      let bn = 0;
      for (const [r, k] of m)
        if (k > bn) {
          bn = k;
          best = r;
        }
      return best;
    };
    for (const g of groups) {
      const lr = g.lanes.map((k) => laneLabel(g.x.lanes[k]));
      const known = lr.filter((r) => r >= 0).length;
      if (!known) continue;
      let bestFit: { base: number; dir: 1 | -1; ok: number } | null = null;
      for (const dir of [1, -1] as const)
        for (let base = -n; base < 2 * n; base++) {
          let ok = 0;
          let bad = 0;
          lr.forEach((v, k) => {
            const r = base + dir * k;
            if (r < 0 || r >= n) bad++;
            else if (v >= 0 && v === r) ok++;
          });
          if (bad) continue;
          if (ok && (!bestFit || ok > bestFit.ok)) bestFit = { base, dir, ok };
        }
      g.lanes.forEach((k, idx) => {
        const own = lr[idx];
        const fit = bestFit && (known >= 2 || g.lanes.length === n) ? bestFit.base + bestFit.dir * idx : -1;
        for (const c of g.x.lanes[k]) {
          if (fit >= 0) vote(c, fit, 1);
          else if (own >= 0) vote(c, own, 0.5);
        }
      });
    }
    for (const [c, ls] of hitByChain) for (const l of ls) vote(c, rankOfLabel.get(l)!, 3);
    settle(0.5);
    labels.forEach((l, r) => l && labelEvidence[r].push({ kind: 'text-label', text: l, distanceMm: medianDist(hits, l) }));
  } else {
    // nesting order (declared-dash, file without labels, rhythm): seriate the units over every
    // group, orient the axis by the inside vote, cut it into n ranks
    const ser = seriate(
      groups.map((g) => ({ units: g.group.units, turn: g.x.turn })),
      nUnits,
      n,
    );
    // inside vote: the chain a section was cast from, closed by its chord, encloses the piece on
    // its left when its signed area is positive. Big closures (most of a piece outline) dominate;
    // local curvature is not used — princess seams (viola) curve both ways.
    const areaOf = new Map<number, number>();
    const signedArea = (c: number) => {
      let a = areaOf.get(c);
      if (a === undefined) {
        const pts = chains[c].pts;
        a = 0;
        for (let k = 0; k < pts.length; k++) {
          const p0 = pts[k];
          const p1 = pts[(k + 1) % pts.length];
          a += p0.x * p1.y - p1.x * p0.y;
        }
        a /= 2;
        areaOf.set(c, a);
      }
      return a;
    };
    let iv = 0;
    let ivAbs = 0;
    for (const g of groups) {
      const A = signedArea(g.x.from);
      if (Math.abs(A) < 100) continue;
      const known = g.group.units.map((u, k) => ({ k, p: u >= 0 ? ser.p[u] : NaN })).filter((e) => Number.isFinite(e.p));
      if (known.length < 2) continue;
      const mk = known.reduce((a, e) => a + e.k, 0) / known.length;
      const mp = known.reduce((a, e) => a + e.p, 0) / known.length;
      const cov = known.reduce((a, e) => a + (e.k - mk) * (e.p - mp), 0);
      if (Math.abs(cov) < 1e-9) continue;
      // lanes run −normal → +normal (+normal = left of the chain); A > 0 puts the interior there
      const pGrowsInward = cov > 0 === A > 0;
      const w = Math.sqrt(Math.abs(A)) / 100;
      iv += pGrowsInward ? -w : w; // + = p grows outward (p already reads small → large)
      ivAbs += w;
    }
    const reverse = iv < 0;
    diag.insideVote = { vote: +iv.toFixed(2), of: +ivAbs.toFixed(2), reverse };
    if (reverse) {
      let mx = 0;
      for (const x of ser.p) if (Number.isFinite(x)) mx = Math.max(mx, x);
      ser.p = ser.p.map((x) => (Number.isFinite(x) ? mx - x : x));
    }
    if (ivAbs === 0 || Math.abs(iv) / ivAbs < 0.2)
      ambiguities.push({
        kind: 'rank-direction',
        message: `inside/outside vote is weak (${iv.toFixed(1)} of ${ivAbs.toFixed(1)}): smallest and largest size may be swapped`,
        classes: [],
        chains: [],
        at: null,
      });
    const identityUnits = encoding === 'declared-dash' || encoding === 'file-per-size';
    let ur: number[];
    if (identityUnits && nUnits === n) {
      // each unit IS a size: its rank is its place on the axis (coordinates compress, order holds)
      const order = ser.p.map((x, u) => ({ u, x: Number.isFinite(x) ? x : Infinity })).sort((a, b) => a.x - b.x);
      ur = new Array(nUnits).fill(-1);
      order.forEach((e, r) => {
        if (Number.isFinite(e.x)) ur[e.u] = r;
      });
    } else ur = ranksFromCoords(ser.p, n, ser.support);
    for (let u = 0; u < nUnits; u++) {
      unitRank[u] = ur[u];
      unitPurity[u] = ser.support[u] ? 1 - ser.selfRepeat[u] / ser.support[u] : 0;
    }
    diag.seriation = { stress: +ser.stress.toFixed(2), p: ser.p.map((x) => (Number.isFinite(x) ? +x.toFixed(1) : null)) };
    const pure = (u: number) => u >= 0 && unitRank[u] >= 0 && unitPurity[u] >= 0.8;
    for (const g of groups) {
      const r = g.group.units.map((u) => (pure(u) ? unitRank[u] : -1));
      // direction of rank along the lanes, from the known lanes
      let dir = 0;
      for (let a = 0; a < r.length; a++) for (let b = a + 1; b < r.length; b++) if (r[a] >= 0 && r[b] >= 0) dir += Math.sign(r[b] - r[a]);
      g.lanes.forEach((k, idx) => {
        let rk = r[idx];
        let w = 1;
        if (rk < 0 && dir !== 0) {
          // an unknown or ambiguous lane between / next to known ones
          const step = dir > 0 ? 1 : -1;
          const prev = idx > 0 ? r[idx - 1] : -1;
          const next = idx + 1 < r.length ? r[idx + 1] : -1;
          if (prev >= 0 && next >= 0 && Math.abs(next - prev) === 2) rk = (prev + next) / 2;
          else if (prev >= 0) rk = prev + step;
          else if (next >= 0) rk = next - step;
          w = 0.7;
        }
        if (rk >= 0 && rk < n) for (const c of g.x.lanes[k]) vote(c, rk, w);
      });
    }
    chains.forEach((_, i) => {
      const u = unit[i];
      if (identityUnits && u >= 0 && unitRank[u] >= 0) rankOf.set(i, unitRank[u]); // identity wins
      else if (pure(u) && sizeCand[i]) vote(i, unitRank[u], 4);
    });
    settle(0.45);
    for (let u = 0; u < nUnits; u++)
      if (!identityUnits && ser.support[u] >= 10 && unitPurity[u] < 0.8)
        ambiguities.push({
          kind: 'class-merge',
          message: `look "${unitNames[u]}" appears twice side by side in ${(100 * (1 - unitPurity[u])).toFixed(0)} % of its sections: two sizes may be drawn alike; its chains are ranked by their neighbours`,
          classes: [],
          chains: chains.map((_, i) => i).filter((i) => unit[i] === u).slice(0, 50),
          at: null,
        });
    if (encoding === 'file-per-size') labels = labels.map(() => null);
  }

  // ── legend: sample strokes with a size token beside them name the units directly ────────────
  diag.legendHits = legendHits.map((h) => `${h.label}:c${h.chain}`);
  if (legendHits.length >= 3 && encoding !== 'ocg' && encoding !== 'text-label' && !(encoding === 'file-per-size' && labelOrderKnown)) {
    // a legend sample is short: give it the unit whose chains look most like it
    const cent: (Float64Array | null)[] = Array.from({ length: nUnits }, () => null);
    const cw = new Array(nUnits).fill(0);
    chains.forEach((c, i) => {
      const u = unit[i];
      if (u < 0 || i >= sigs.length) return;
      const v = sigs[i].vec;
      const acc = cent[u] ?? new Float64Array(v.length);
      for (let k = 0; k < v.length; k++) acc[k] += v[k] * c.lengthMm;
      cent[u] = acc;
      cw[u] += c.lengthMm;
    });
    const legendUnit = (c: number) => {
      if (unit[c] >= 0) return unit[c];
      if (c >= sigs.length) return -1;
      let bu = -1;
      let bc = 0.7;
      cent.forEach((v, u) => {
        if (!v) return;
        const cs = cosine(sigs[c].vec, v);
        if (cs > bc) {
          bc = cs;
          bu = u;
        }
      });
      return bu;
    };
    const byRank = new Map<number, Map<string, number>>();
    for (const h of legendHits) {
      const u = legendUnit(h.chain);
      if (u < 0 || unitRank[u] < 0) continue;
      const m = byRank.get(unitRank[u]) ?? new Map<string, number>();
      m.set(h.label, (m.get(h.label) ?? 0) + 1);
      byRank.set(unitRank[u], m);
    }
    const pairs = [...byRank.entries()].map(([r, m]) => {
      const [label] = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
      return { r, label, value: parseSizeToken(label, true)!.value };
    });
    if (pairs.length >= Math.max(2, Math.ceil(n / 2))) {
      // order agreement between rank and label value (Kendall sign)
      let agree = 0;
      let against = 0;
      for (let a = 0; a < pairs.length; a++)
        for (let b = a + 1; b < pairs.length; b++) {
          const s1 = Math.sign(pairs[a].r - pairs[b].r) * Math.sign(pairs[a].value - pairs[b].value);
          if (s1 > 0) agree++;
          else if (s1 < 0) against++;
        }
      diag.legend = { pairs: pairs.map((p) => `r${p.r}=${p.label}`), agree, against };
      // the legend's labels form a run: label index = rank. Map the seriated ranks onto it with a
      // flip and/or a shift (a size that never shows as its own lane leaves a hole at one end).
      const legendLabels = [...legendRun].map((l) => parseSizeToken(l, true)!).sort((x, y) => x.value - y.value);
      const idxOf = new Map(legendLabels.map((t, k) => [t.label, k]));
      if (legendLabels.length === n) {
        let bestMap: { sgn: 1 | -1; t: number; hit: number } | null = null;
        for (const sgn of [1, -1] as const)
          for (let t = -n; t <= 2 * n; t++) {
            let hit = 0;
            for (const p of pairs) if (sgn * p.r + t === idxOf.get(p.label)) hit++;
            if (!bestMap || hit > bestMap.hit) bestMap = { sgn, t, hit };
          }
        if (bestMap && bestMap.hit < pairs.length)
          ambiguities.push({
            kind: 'class-merge',
            message: `legend: ${bestMap.hit} of ${pairs.length} sample strokes match the nesting order (${pairs.map((p) => `${p.label}→r${p.r}`).join(' ')})`,
            classes: [],
            chains: [],
            at: legendHits[0].text.anchor,
          });
        if (bestMap && bestMap.hit >= Math.max(2, Math.ceil(pairs.length / 2)) && (bestMap.sgn !== 1 || bestMap.t !== 0)) {
          const f = (r: number) => bestMap!.sgn * r + bestMap!.t;
          for (const [c, r] of [...rankOf]) {
            const nr = f(r);
            if (nr >= 0 && nr < n) rankOf.set(c, nr);
            else rankOf.delete(c);
          }
          for (let u = 0; u < nUnits; u++) if (unitRank[u] >= 0) unitRank[u] = f(unitRank[u]);
          for (const p of pairs) p.r = f(p.r);
          diag.legendRemap = { sgn: bestMap.sgn, shift: bestMap.t, hit: bestMap.hit, of: pairs.length };
          agree = pairs.length;
          against = 0;
          for (let a2 = 0; a2 < pairs.length; a2++)
            for (let b2 = a2 + 1; b2 < pairs.length; b2++) if (Math.sign(pairs[a2].r - pairs[b2].r) !== Math.sign(pairs[a2].value - pairs[b2].value)) against++;
          if (against) agree = 0;
          // every legend label sits on its index now
          legendLabels.forEach((t, k) => {
            labels[k] = t.label;
            labelEvidence[k].push({ kind: 'text-label', text: `legend ${t.label}`, distanceMm: medianDist(legendHits, t.label) });
          });
        }
      } else if (against > agree) {
        for (const [c, r] of rankOf) rankOf.set(c, n - 1 - r);
        for (let u = 0; u < nUnits; u++) if (unitRank[u] >= 0) unitRank[u] = n - 1 - unitRank[u];
        for (const p of pairs) p.r = n - 1 - p.r;
        diag.legendReversed = true;
        [agree, against] = [against, agree];
      }
      const consistent = Math.min(agree, against) === 0;
      if (consistent) {
        for (const p of pairs) {
          if (labels[p.r] === p.label) continue;
          labels[p.r] = p.label;
          labelEvidence[p.r].push({ kind: 'text-label', text: `legend ${p.label}`, distanceMm: medianDist(legendHits, p.label) });
        }
      } else
        ambiguities.push({
          kind: 'class-merge',
          message: `the legend's line samples do not follow the nesting order (${agree} pairs agree, ${against} disagree): check the legend`,
          classes: [],
          chains: [],
          at: legendHits[0].text.anchor,
        });
    }
  }

  // ── labels from a text size run with the same count ─────────────────────────────────────────
  const runEvidence = runs.map((r) => `${r.source} → ${r.labels.join(',')}`);
  if (labels.some((l) => !l)) {
    const exact = runs.filter((r) => r.labels.length === n);
    // a legend ("размер 72", "SIZE XS") first, then a run said with the word "size", then the rest
    let pick =
      exact.find((r) => r.kind === 'legend') ??
      exact.find((r) => r.keyword && r.kind !== 'table') ??
      exact.find((r) => r.keyword) ??
      exact.find((r) => r.kind !== 'table') ??
      exact[0];
    if (pick && !pick.keyword && pick.kind !== 'legend')
      ambiguities.push({
        kind: 'labels-missing',
        message: `size names "${pick.labels.join(', ')}" taken from "${pick.source}" without the word "size" next to it — confirm`,
        classes: [],
        chains: [],
        at: null,
      });
    const known = labels.map((l, r) => [l, r] as const).filter(([l]) => !!l);
    const fits = (run: TextRun) => known.every(([l, r]) => run.labels[r] === l);
    if (pick && !fits(pick)) {
      const alt = exact.find(fits);
      if (alt) pick = alt;
    }
    if (pick && fits(pick)) {
      labels = pick.labels.slice();
      labels.forEach((l, r) => l && labelEvidence[r].push({ kind: 'text-label', text: pick.source, distanceMm: Infinity }));
    } else
      ambiguities.push({
        kind: 'labels-missing',
        message: `no size run of ${n} found in the text (${runs.map((r) => r.labels.length).join(',') || 'none'}): sizes are ranks only, name them in the legend`,
        classes: [],
        chains: [],
        at: null,
      });
  }

  // OCG: a line repeated in every size layer is common (Pattern Union prints shared lines per layer)
  const ocgCommon: number[] = [];
  const ocgDropped: { id: number; why: string }[] = [];
  if (encoding === 'ocg') {
    const dup = duplicatesAcrossRanks(chains, rankOf, n);
    for (const [keep, drop] of dup) {
      rankOf.delete(keep);
      ocgCommon.push(keep);
      for (const d of drop) {
        rankOf.delete(d);
        ocgDropped.push({ id: d, why: `duplicate of common line ${keep} in another size layer` });
      }
    }
    diag.ocgDuplicates = dup.length;
  }

  // ── shared stretches of size lines → common ─────────────────────────────────────────────────
  const sharedFrom = new Map<number, number>();
  const joined = bridgeSameRank(chains, rankOf);
  const landings = landEnds(
    chains,
    rankOf,
    chains.map((_, i) => i < N0 && !furniture[i] && !joined.has(i) && chains[i].lengthMm >= 3),
  );
  splitShared(chains, rankOf, sharedFrom, landings);
  diag.bridges = joined.size;
  diag.landings = landings.length;

  // ── classify the rest ───────────────────────────────────────────────────────────────────────
  const common: number[] = [...ocgCommon];
  const internal: number[] = [];
  const ignore: { id: number; why: string }[] = [...ocgDropped, ...[...joined].map(([id, host]) => ({ id, why: `joined into chain ${host}` }))];
  const orphans: number[] = [];
  const decided = new Set([...ocgCommon, ...ocgDropped.map((d) => d.id), ...joined.keys()]);
  const contourWidth = medianWidth(chains, rankOf, styles);
  const sectioned = new Set<number>();
  for (const x of xsB) if (x.lanes.length >= 2) for (const l of x.lanes) for (const c of l) sectioned.add(c);
  const touchGrid = new SegGrid(6);
  chains.forEach((c, i) => {
    if (!(i < N0 && furniture[i])) touchGrid.addPolyline(i, c.pts);
  });
  const touchesOthers = (i: number) => {
    const pts = chains[i].pts;
    let n = 0;
    for (const p of [pts[0], pts[pts.length - 1]]) {
      let hit = false;
      touchGrid.near(p, 2, (j, si) => {
        if (hit || j === i) return;
        if (segNearest(p, chains[j].pts[si], chains[j].pts[si + 1]).d <= 2) hit = true;
      });
      if (hit) n++;
    }
    return n >= 1;
  };
  chains.forEach((c, i) => {
    if (rankOf.has(i) || decided.has(i)) return;
    if (sharedFrom.has(i)) {
      common.push(i);
      return;
    }
    const why = i < N0 ? furniture[i] : null;
    if (why) {
      ignore.push({ id: i, why });
      return;
    }
    if (i < N0 && sizeCand[i]) {
      // never beside another size line: not a graded line at all — an outline drawn once in a
      // size's style when it meets other lines, else a free internal line (grain drawn in w0.35)
      if (!sectioned.has(i)) {
        if (touchesOthers(i)) common.push(i);
        else internal.push(i);
      } else orphans.push(i);
      return;
    }
    const st = styles.get(c.style);
    if (c.lengthMm < 8) {
      ignore.push({ id: i, why: 'fragment < 8 mm' });
      return;
    }
    // same weight as size lines = outline (common); thinner = internal (grain, darts, placement)
    if (st && contourWidth > 0 && st.widthMm >= contourWidth * 0.85 && !(st.fill && st.widthMm === 0)) common.push(i);
    else internal.push(i);
  });

  // ── classes ─────────────────────────────────────────────────────────────────────────────────
  const sizes: SizeClassOut[] = [];
  for (let r = 0; r < n; r++) {
    const ids = [...rankOf.entries()].filter(([, rr]) => rr === r).map(([c]) => c);
    const us = new Map<number, number>();
    for (const c of ids) if (unit[c] >= 0) us.set(unit[c], (us.get(unit[c]) ?? 0) + chains[c].lengthMm);
    const ev: ClassEvidence[] = [];
    const lk: string[] = [];
    [...us.entries()]
      .sort((a, b) => b[1] - a[1])
      .forEach(([u, L], k) => {
        if (k < 3 && L > 0.05 * lenOf(chains, ids)) {
          ev.push(...unitEvidence[u]);
          lk.push(unitNames[u]);
        }
      });
    ev.push(...labelEvidence[r]);
    ev.push({ kind: 'nesting-order', rank: r });
    let conf: number;
    if (encoding === 'ocg' || encoding === 'file-per-size') conf = 0.95;
    else if (encoding === 'text-label') conf = 0.8;
    else {
      const purities = [...us.keys()].map((u) => unitPurity[u]);
      const p = purities.length ? Math.max(...purities) : 0.4;
      conf = (encoding === 'declared-dash' ? 0.6 : 0.45) + 0.35 * p;
    }
    if (!labels[r]) conf *= 0.85;
    sizes.push({ rank: r, label: labels[r] ?? null, chains: ids, evidence: ev, confidence: +conf.toFixed(2), looks: lk });
    if (!ids.length)
      ambiguities.push({ kind: 'size-empty', message: `no line found for rank ${r}${labels[r] ? ` (${labels[r]})` : ''}`, classes: [], chains: [], at: null });
  }
  // a unit split over several ranks / several units in one rank are informational
  for (const s of sizes)
    if (s.looks.length > 1)
      ambiguities.push({
        kind: 'class-split',
        message: `size rank ${s.rank} is drawn in ${s.looks.length} looks (${s.looks.join(' | ')}): check the legend`,
        classes: [],
        chains: [],
        at: null,
      });
  if (orphans.length) {
    const L = lenOf(chains, orphans);
    const sizeL = lenOf(chains, rankOf.keys()) + L;
    ambiguities.push({
      kind: 'unassigned',
      message: `${orphans.length} size-line chains (${(L / 1000).toFixed(1)} m, ${((100 * L) / Math.max(1, sizeL)).toFixed(1)} %) have no rank`,
      classes: [],
      chains: orphans.slice(0, 200),
      at: chains[orphans.reduce((a, b) => (chains[a].lengthMm >= chains[b].lengthMm ? a : b))].pts[0],
    });
  }

  // ── bundles: full groups whose lanes map to n distinct ranks, keyed by their chain tuple ──────
  const tuples = new Map<string, { chains: number[]; support: number; spacing: number }>();
  for (const g of groups) {
    if (g.lanes.length !== n) continue;
    const byRank = new Array<number>(n).fill(-1);
    let ok = true;
    for (const k of g.lanes) {
      const ids = g.x.lanes[k].filter((c) => rankOf.has(c));
      if (!ids.length) {
        ok = false;
        break;
      }
      const best = ids.reduce((a, b) => (chains[a].lengthMm >= chains[b].lengthMm ? a : b));
      const r = rankOf.get(best)!;
      if (byRank[r] >= 0) {
        ok = false;
        break;
      }
      byRank[r] = best;
    }
    if (!ok || byRank.some((c) => c < 0)) continue;
    const offs = g.lanes.map((k) => g.x.offsets[k]);
    const sp = Math.abs(offs[offs.length - 1] - offs[0]) / Math.max(1, offs.length - 1);
    const key = byRank.join(',');
    const t = tuples.get(key);
    if (t) {
      t.support++;
      t.spacing += sp;
    } else tuples.set(key, { chains: byRank, support: 1, spacing: sp });
  }
  const bundles: Bundle[] = [];
  for (const t of [...tuples.values()].sort((a, b) => b.support - a.support)) {
    if (t.support < 3) continue;
    bundles.push({
      id: bundles.length,
      chains: t.chains,
      spacingMm: +(t.spacing / t.support).toFixed(2),
      endsOn: [endsOn(chains, t.chains[0], 0, common), endsOn(chains, t.chains[0], 1, common)],
    });
  }
  diag.bundleSupport = bundles.map((b) => tuples.get(b.chains.join(','))!.support);
  if (encoding !== 'ocg' && encoding !== 'file-per-size' && encoding !== 'text-label' && nUnits && n && nUnits !== n)
    diag.unitsVsSizes = `${nUnits} looks/classes for ${n} sizes`;
  diag.looks = unitNames;
  diag.unitRank = unitRank;
  diag.unitPurity = unitPurity.map((p) => +p.toFixed(2));
  return {
    encoding,
    n,
    sizes,
    rankOf,
    common,
    sharedFrom,
    internal,
    ignore,
    orphans,
    bundles,
    ambiguities,
    chains,
    runEvidence,
    diag,
  };
}

/**
 * Legend entries: a size token with a short sample stroke ENDING next to it (≤ 8 mm from the text
 * box, the stroke pointing at it). Table rules and frames run past the text, they do not end there.
 */
function legendEndHits(texts: IRText[], chains: Chain[], ok: boolean[]) {
  const ends = new PtGrid(8);
  const list: { c: number; p: PtMm; t: PtMm }[] = [];
  chains.forEach((c, i) => {
    if (!ok[i] || c.lengthMm >= 150 || c.closed) return;
    for (const end of [0, 1] as const) {
      const t = endTangent(c.pts, end, 4);
      if (!t) continue;
      const p = end ? c.pts[c.pts.length - 1] : c.pts[0];
      ends.add(list.length, p);
      list.push({ c: i, p, t });
    }
  });
  const out: { text: IRText; label: string; value: number; chain: number; d: number }[] = [];
  for (const tx of texts) {
    const tok = parseSizeToken(tx.text, true);
    if (!tok) continue;
    const b = tx.bbox;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    let best = Infinity;
    let bd = 0;
    let bi = -1;
    const h = Math.max(1, b.maxY - b.minY, b.maxX - b.minX);
    ends.near({ x: cx, y: cy }, 10, (k) => {
      const e = list[k];
      const dx = Math.max(b.minX - e.p.x, 0, e.p.x - b.maxX);
      const dy = Math.max(b.minY - e.p.y, 0, e.p.y - b.maxY);
      const d = Math.hypot(dx, dy);
      if (d > 8) return;
      const vx = cx - e.p.x;
      const vy = cy - e.p.y;
      const along = vx * e.t.x + vy * e.t.y;
      const lat = Math.abs(vx * e.t.y - vy * e.t.x);
      if (along <= 0 || lat > h) return; // the stroke must point at the label, not pass beside it
      const score = d + 3 * lat;
      if (score < best) {
        best = score;
        bd = d;
        bi = e.c;
      }
    });
    if (bi >= 0) out.push({ text: tx, label: tok.label, value: tok.value, chain: bi, d: bd });
  }
  return out;
}

/**
 * The size labels placed along lines (r4454 «44»…«54»): among size tokens near lines, the longest
 * consecutive run (numbers with step 2/4/6, or letters) whose labels each occur ≥ 2× and roughly
 * equally often. Ruler digits (step 1), tile marks and piece numbers do not form such a run.
 */
function labelRun(hits: { label: string; value: number }[], minCount: number): Set<string> {
  const cnt = new Map<string, { value: number; n: number; letter: boolean }>();
  for (const h of hits) {
    const e = cnt.get(h.label) ?? { value: h.value, n: 0, letter: !/^\d+$/.test(h.label) };
    e.n++;
    cnt.set(h.label, e);
  }
  const ok = [...cnt.entries()].filter(([, e]) => e.n >= minCount);
  let best: string[] = [];
  for (const letter of [false, true]) {
    const vals = ok.filter(([, e]) => e.letter === letter).sort((a, b) => a[1].value - b[1].value);
    const steps = letter ? [1] : [2, 4, 6];
    for (const step of steps)
      for (let i = 0; i < vals.length; i++) {
        const run = [vals[i]];
        for (let j = i + 1; j < vals.length; j++) if (vals[j][1].value === run[run.length - 1][1].value + step) run.push(vals[j]);
        const ns = run.map(([, e]) => e.n);
        if (run.length >= 3 && Math.min(...ns) >= 0.25 * Math.max(...ns) && run.length > best.length) best = run.map(([l]) => l);
      }
  }
  return new Set(best);
}

function closureArea(pts: PtMm[]): number {
  let a = 0;
  for (let k = 0; k < pts.length; k++) {
    const p0 = pts[k];
    const p1 = pts[(k + 1) % pts.length];
    a += p0.x * p1.y - p1.x * p0.y;
  }
  return a / 2;
}

function majorityUnit(ids: number[], unit: number[], chains: Chain[]): number {
  const m = new Map<number, number>();
  for (const c of ids) if (unit[c] >= 0) m.set(unit[c], (m.get(unit[c]) ?? 0) + chains[c].lengthMm);
  let best = -1;
  let bl = 0;
  for (const [u, L] of m)
    if (L > bl) {
      bl = L;
      best = u;
    }
  return best;
}

function medianDist(hits: { label: string; d: number }[], label: string): number {
  const ds = hits.filter((h) => h.label === label).map((h) => h.d).sort((a, b) => a - b);
  return ds.length ? +ds[ds.length >> 1].toFixed(2) : Infinity;
}

function medianWidth(chains: Chain[], rankOf: Map<number, number>, styles: Map<number, Style>): number {
  const ws: number[] = [];
  for (const c of rankOf.keys()) {
    const st = styles.get(chains[c].style);
    if (st && st.widthMm > 0) ws.push(st.widthMm);
  }
  ws.sort((a, b) => a - b);
  return ws.length ? ws[0] : 0;
}

/** Size label in a file name: "44.pdf", "wm_kka_15_01_xl_wykroj.pdf", "Толстовка 48". */
export function fileSizeLabel(name: string): string | null {
  const base = name.replace(/\.[a-z0-9]+$/i, '');
  const parts = base.split(/[\s_\-.]+/).filter(Boolean);
  for (let k = parts.length - 1; k >= 0; k--) {
    const t = parseSizeToken(parts[k], true);
    if (t && (t.kind === 'letter' || (t.value >= 20 && t.value <= 70) || parts.length === 1)) return t.label;
  }
  return null;
}

function endsOn(chains: Chain[], c: number, end: 0 | 1, common: number[]): number | null {
  const p = end ? chains[c].pts[chains[c].pts.length - 1] : chains[c].pts[0];
  let best = 1.5;
  let bi: number | null = null;
  for (const k of common) {
    const pts = chains[k].pts;
    for (let i = 0; i + 1 < pts.length; i++) {
      const r = segNearest(p, pts[i], pts[i + 1]);
      if (r.d < best) {
        best = r.d;
        bi = k;
      }
    }
  }
  return bi;
}

/**
 * Split the shared stretches off size chains. A stretch of a size chain with no other size line
 * running beside it (within maxSep, either side) is shared when other sizes' lines END on it at
 * the stretch's border (a landing). It becomes a new common chain; the size chain keeps the rest.
 */
function splitShared(chains: Chain[], rankOf: Map<number, number>, sharedFrom: Map<number, number>, landings: Landing[]): void {
  const ids = [...rankOf.keys()];
  const rank0 = new Map(rankOf);
  const poly = new Map(ids.map((i) => [i, chains[i].pts]));
  const grid = new SegGrid(8);
  for (const i of ids) grid.addPolyline(i, chains[i].pts);
  const landOn = new Map<number, PtMm[]>();
  const addLand = (on: number, at: PtMm) => {
    const a = landOn.get(on);
    if (a) a.push(at);
    else landOn.set(on, [at]);
  };
  for (const l of landings) {
    if (!rank0.has(l.on) || rank0.get(l.on) === rank0.get(l.chain)) continue;
    addLand(l.on, l.at);
  }
  // ends that stop within 2 mm of another size's line count too (several lines converge there)
  for (const i of ids) {
    const pts = chains[i].pts;
    for (const p of [pts[0], pts[pts.length - 1]]) {
      const seen = new Set<number>();
      grid.near(p, 2, (j, si) => {
        if (j === i || seen.has(j) || rank0.get(j) === rank0.get(i)) return;
        const pj = poly.get(j)!;
        if (segNearest(p, pj[si], pj[si + 1]).d <= 2) {
          seen.add(j);
          addLand(j, p);
        }
      });
    }
  }
  const step = 2;
  const minRun = 15;
  for (const i of ids) {
    const c = chains[i];
    const r = rank0.get(i)!;
    const smp = resample(c.pts, step);
    if (smp.length < 4) continue;
    const accompanied = smp.map((s) => {
      let hit = false;
      grid.near(s.p, BUNDLE.maxSepMm, (j, si) => {
        if (hit || j === i || rank0.get(j) === r) return;
        const pj = poly.get(j)!;
        const q = segNearest(s.p, pj[si], pj[si + 1]);
        if (q.d <= BUNDLE.maxSepMm) {
          const a = pj[si];
          const b = pj[si + 1];
          const L = dist(a, b) || 1;
          const dot = Math.abs((s.t.x * (b.x - a.x) + s.t.y * (b.y - a.y)) / L);
          if (dot > 0.8) hit = true;
        }
      });
      return hit;
    });
    // landing positions (arc length) on this chain
    const land: number[] = [];
    for (const at of landOn.get(i) ?? []) {
      let best = Infinity;
      let bs = 0;
      for (const sp of smp) {
        const d = dist(sp.p, at);
        if (d < best) {
          best = d;
          bs = sp.s;
        }
      }
      if (best <= step + 0.5) land.push(bs);
    }
    // runs of unaccompanied samples
    const runs: [number, number][] = [];
    let k = 0;
    while (k < smp.length) {
      if (accompanied[k]) {
        k++;
        continue;
      }
      let e = k;
      while (e + 1 < smp.length && !accompanied[e + 1]) e++;
      runs.push([smp[k].s, smp[e].s]);
      k = e + 1;
    }
    const total = c.lengthMm;
    const accFrac = accompanied.filter(Boolean).length / accompanied.length;
    if (accFrac < 0.05 && total >= 30) {
      // never beside another size anywhere: one line drawn for every size (palto: the hem and the
      // right edge of piece 23 are drawn in the largest size's style)
      rankOf.delete(i);
      sharedFrom.set(i, r);
      continue;
    }
    const shared = runs.filter(([a, b]) => {
      if (b - a < minRun) return false;
      const nearLanding = (s: number) => land.some((x) => Math.abs(x - s) <= 10);
      const atStart = a <= step;
      const atEnd = b >= total - step - 0.5;
      return (nearLanding(a) || atStart) && (nearLanding(b) || atEnd) && (nearLanding(a) || nearLanding(b));
    });
    if (!shared.length) continue;
    // cut: keep size parts, emit shared parts as new chains
    const cuts: { a: number; b: number; shared: boolean }[] = [];
    let cur = 0;
    for (const [a, b] of shared) {
      if (a > cur + 1) cuts.push({ a: cur, b: a, shared: false });
      cuts.push({ a, b, shared: true });
      cur = b;
    }
    if (cur < total - 1) cuts.push({ a: cur, b: total, shared: false });
    const sizeParts = cuts.filter((x) => !x.shared);
    const sizeKeep = sizeParts.reduce((best, x) => (!best || x.b - x.a > best.b - best.a ? x : best), null as null | { a: number; b: number });
    const original = { ...c };
    for (const part of cuts) {
      const pts = sliceByArc(original.pts, part.a, part.b);
      if (pts.length < 2) continue;
      const len = part.b - part.a;
      if (part === sizeKeep) {
        chains[i] = { ...original, pts, lengthMm: len };
        continue;
      }
      const id = chains.length;
      chains.push({ ...original, id, pts, lengthMm: len, closed: false });
      if (part.shared) sharedFrom.set(id, r);
      else rankOf.set(id, r);
    }
    if (!sizeKeep) {
      // the whole chain was shared
      rankOf.delete(i);
      sharedFrom.set(i, r);
    }
  }
}

function sliceByArc(pts: PtMm[], a: number, b: number): PtMm[] {
  const out: PtMm[] = [];
  let s = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    const L = dist(p, q);
    const s1 = s + L;
    if (s1 >= a && s <= b) {
      const t0 = L > 0 ? Math.max(0, (a - s) / L) : 0;
      const t1 = L > 0 ? Math.min(1, (b - s) / L) : 1;
      const P = { x: p.x + (q.x - p.x) * t0, y: p.y + (q.y - p.y) * t0 };
      const Q = { x: p.x + (q.x - p.x) * t1, y: p.y + (q.y - p.y) * t1 };
      if (!out.length) out.push(P);
      out.push(Q);
    }
    s = s1;
  }
  return out;
}

/** OCG: chains of different size layers that coincide (≤ 0.2 mm everywhere) → [keep, drop[]]. */
function duplicatesAcrossRanks(chains: Chain[], rankOf: Map<number, number>, n: number): [number, number[]][] {
  const ids = [...rankOf.keys()];
  const grid = new SegGrid(8);
  for (const i of ids) grid.addPolyline(i, chains[i].pts);
  const groupOf = new Map<number, number>();
  const out: [number, number[]][] = [];
  for (const i of ids) {
    if (groupOf.has(i)) continue;
    const smp = resample(chains[i].pts, 3);
    const matches = new Map<number, number>();
    for (const s of smp) {
      const seen = new Set<number>();
      grid.near(s.p, 0.3, (j, si) => {
        if (j === i || seen.has(j) || rankOf.get(j) === rankOf.get(i)) return;
        if (segNearest(s.p, chains[j].pts[si], chains[j].pts[si + 1]).d <= 0.2) {
          seen.add(j);
          matches.set(j, (matches.get(j) ?? 0) + 1);
        }
      });
    }
    const dups = [...matches.entries()]
      .filter(([j, k]) => k >= 0.9 * smp.length && Math.abs(chains[j].lengthMm - chains[i].lengthMm) < 0.1 * chains[i].lengthMm + 2)
      .map(([j]) => j);
    const ranks = new Set([rankOf.get(i)!, ...dups.map((j) => rankOf.get(j)!)]);
    if (ranks.size >= Math.max(2, Math.ceil(n / 2))) {
      for (const j of dups) groupOf.set(j, i);
      groupOf.set(i, i);
      out.push([i, dups]);
    }
  }
  return out;
}
