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
import { normDash } from '../chains/link';
import { dist, endTangent, PtGrid, resample, SegGrid, segNearest } from '../chains/geom';
import { cosine, describeSig, type Signature } from '../chains/motif';
import { type Group } from './align';
import { ranksFromCoords, seriate } from './seriate';
import { bridgeSameRank, landEnds, type Landing } from './land';
import { legendIdentity, type LegendIdentity } from './legend-id';
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
  notches: number[];
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
  const totalCand = lenOf(
    chains,
    chains.map((_, i) => i).filter((i) => cand[i]),
  );

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
  const sizeLayers = [...layerLen.entries()].filter(
    ([name, L]) => parseSizeToken(name, true) && L >= 0.02 * totalCand,
  );
  const bigFiles = [...fileLen.entries()].filter(([, L]) => L >= 0.05 * totalCand);
  // declared dashes among candidates
  const dashed = chains
    .map((c, i) => ({ i, st: styles.get(c.style) }))
    .filter(({ i, st }) => cand[i] && st?.dash && st.dash.some((v) => v > 0.01));
  const dclAll = dashCluster(
    dashed.map(({ i, st }) => ({ dash: st!.dash!, len: chains[i].lengthMm })),
  );
  diag.dashClusters = dclAll.map(
    (c) => `${c.rep.map((v) => v.toFixed(2)).join('/')}:${(c.len / 1000).toFixed(2)}m`,
  );
  const dclusters = dclAll.filter((c) => c.len >= Math.max(600, 0.015 * totalCand));
  const allTexts = sheet.texts;
  const hits0 = tokenHits(allTexts, chains, cand, 6);
  // labels ALONG long lines (r4454) vs labels next to short sample strokes (a legend: viola p29)
  const onLine = hits0.filter((h) => chains[h.chain].lengthMm >= 150);
  const legendHits0 = alignedLegend(legendEndHits(allTexts, chains, cand), chains);
  const hitRun = labelRun(onLine, 2);
  let hits = onLine.filter((h) => hitRun.has(h.label));
  {
    // labels along lines are spread over the sheet; a cluster in one corner is a table or legend
    const cells = new Set(
      hits.map((h) => `${Math.floor(h.text.anchor.x / 150)},${Math.floor(h.text.anchor.y / 150)}`),
    );
    if (cells.size < 3) hits = [];
  }
  const texts = [...allTexts.map((t) => t.text), ...(inp.extraTexts ?? [])];
  const runs: TextRun[] = [...runsInText(texts), ...runsInTokens(allTexts.map((t) => t.text))];
  // the legend's labels: a run among the sample labels — or, when some samples are not chains
  // (reef draws S and 3XL as loose marks), the size run the file states that holds them all
  let legendRun = labelRun(legendHits0, 1, 2);
  {
    // compare by value: the key spells "2XL", the run "XS to 5XL" expands to "XXL"
    const spelling = new Map<string, string>();
    for (const h of legendHits0)
      spelling.set(`${parseSizeToken(h.label, true)?.kind}${h.value}`, h.label);
    const keyOf = (l: string) => {
      const t = parseSizeToken(l, true);
      return t ? `${t.kind}${t.value}` : l;
    };
    const stated = runs
      .filter((r) => r.labels.length >= 3 && (r.keyword || r.kind === 'legend'))
      .filter((r) => {
        const inRun = r.labels.filter((l) => spelling.has(keyOf(l))).length;
        return inRun >= 3 && inRun > legendRun.size && inRun >= spelling.size - 2;
      })
      .sort((a, b) => b.labels.length - a.labels.length)[0];
    if (stated) legendRun = new Set(stated.labels.map((l) => spelling.get(keyOf(l)) ?? l));
  }
  const legendHits = legendHits0.filter((h) => legendRun.has(h.label));
  const hitLabels = new Map<string, number>();
  for (const h of hits) hitLabels.set(h.label, (hitLabels.get(h.label) ?? 0) + 1);

  // colour groups among line work: saturated colours (and at most one dark ink) each carrying
  // ≥ 3 % of the candidate length
  const colourLen = new Map<string, { rgb: [number, number, number]; len: number }>();
  chains.forEach((c, i) => {
    if (!cand[i]) return;
    const rgb = styles.get(c.style)?.strokeRgb;
    if (!rgb) return;
    const k = colourKey(rgb);
    const e = colourLen.get(k) ?? { rgb: rgb as [number, number, number], len: 0 };
    e.len += c.lengthMm;
    colourLen.set(k, e);
  });
  const colourGroups: { rgb: [number, number, number]; members: Set<string>; len: number }[] = [];
  for (const [k, e] of [...colourLen].sort((a, b) => b[1].len - a[1].len)) {
    const g = colourGroups.find((x) => rgbDist(x.rgb, e.rgb) < 36);
    if (g) {
      g.members.add(k);
      g.len += e.len;
    } else colourGroups.push({ rgb: e.rgb, members: new Set([k]), len: e.len });
  }
  {
    const big = colourGroups.filter((g) => g.len >= 0.03 * totalCand);
    const saturated = big.filter((g) => Math.max(...g.rgb) - Math.min(...g.rgb) >= 60);
    colourGroups.length = 0;
    if (saturated.length >= 2)
      colourGroups.push(...big.filter((g) => saturated.includes(g) || Math.max(...g.rgb) < 110));
  }
  diag.colours = colourGroups.map((g) => `${g.rgb.join(',')}:${(g.len / 1000).toFixed(1)}m`);

  let encoding: SizeEncoding;
  // unit per chain: the identity hint the alignment works with
  const unit = new Array(chains.length).fill(-1);
  let unitNames: string[] = [];
  let unitEvidence: ClassEvidence[][] = [];
  let labelOrderKnown = false;
  if (bigFiles.length >= 2) {
    encoding = 'file-per-size';
    unitNames = bigFiles.map(([f]) => f);
    unitEvidence = bigFiles.map(([f]) => [
      { kind: 'file', file: f, label: inp.fileNames?.get(f) ?? f },
    ]);
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
  } else if (colourGroups.length >= 3) {
    // line colour per size (leonie). Colour is NOT identity: one size may borrow another's colour
    // on some tiles and black carries text too — ranks still come from nesting, colour is the hint.
    encoding = 'color';
    unitNames = colourGroups.map((g) => `rgb(${g.rgb.join(',')})`);
    unitEvidence = colourGroups.map((g) => [{ kind: 'color', rgb: g.rgb }]);
    chains.forEach((c, i) => {
      if (!cand[i]) return;
      const rgb = styles.get(c.style)?.strokeRgb;
      if (!rgb) return;
      unit[i] = colourGroups.findIndex((g) => g.members.has(colourKey(rgb)));
    });
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
  const notSize = new Set<number>();
  for (let l = 0; l < nLooks; l++)
    sizeLook[l] = lookLen[l] >= 300 && lookBundled[l] / lookLen[l] >= 0.35;
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
    // a look that is not a declared dash but runs beside declared size lines is one more size
    // (robe: 5 dashes + 1 solid; reef: 4 dashes + chevrons, zigzag-with-rings, dots … drawn as geometry)
    const declaredSet = new Set(chains.map((_, i) => i).filter((i) => unit[i] >= 0));
    const declaredWidths = [
      ...new Set(
        [...declaredSet].map((i) => +(styles.get(chains[i].style)?.widthMm ?? 0).toFixed(2)),
      ),
    ];
    const share: string[] = [];
    for (let l = 0; l < nLooks; l++) {
      const members = chains.map((_, i) => i).filter((i) => looks.look[i] === l && unit[i] < 0);
      const memberLen = lenOf(chains, members);
      if (memberLen < 800 || memberLen < 0.5 * lookLen[l]) continue;
      const memberSet = new Set(members);
      let declaredNeighbours = 0;
      let samples = 0;
      for (const x of xsA.sections) {
        if (!memberSet.has(x.from)) continue;
        samples++;
        const k = x.lanes.findIndex((ln) => ln.includes(x.from));
        const nb = [x.lanes[k - 1], x.lanes[k + 1]].filter(Boolean).flat();
        if (nb.some((c) => declaredSet.has(c))) declaredNeighbours++;
      }
      const sh = samples ? declaredNeighbours / samples : 0;
      share.push(`${lookDesc(l)}:${sh.toFixed(2)}/${samples}`);
      if (declaredNeighbours < 10 || sh < 0.2) continue;
      // a plain solid beside the sizes is a size only when drawn with the size lines' pen (robe:
      // 46 = solid 0.42 like the dashes; the 0.35 outline next to it is the common edge)
      const sig0 = sigs[members[0]];
      if (sig0?.solid && !Object.values(sig0.decorPer10).some((v) => v > 0.3)) {
        const w = sig0.backbone?.widthMm ?? 0;
        if (!declaredWidths.some((dw) => Math.abs(dw - w) <= 0.03)) continue;
      }
      const u = unitNames.length;
      unitNames.push(lookDesc(l));
      unitEvidence.push(
        sigs[members[0]]?.motif
          ? [{ kind: 'recovered-motif', motif: sigs[members[0]].motif! }]
          : [],
      );
      for (const i of members) if (cand[i]) unit[i] = u;
    }
    diag.besideDeclared = share;
  }
  if (encoding === 'subpath-dash' || encoding === 'separate-dash') {
    // a look that sits right beside ITSELF wherever it is bundled is not a size: grain arrows
    // (shaft + barbs), quilting / topstitch rows, double fold marks (palto, zhaket: w0.25)
    const pre = crossSections(
      chains,
      chains.map((_, i) => cand[i] && unit[i] >= 0),
      blockers,
    ).sections;
    const selfAdj = new Array(unitNames.length).fill(0);
    const otherAdj = new Array(unitNames.length).fill(0);
    const seen = new Array(unitNames.length).fill(0);
    for (const x of pre) {
      const u = unit[x.from];
      if (u < 0) continue;
      const k = x.lanes.findIndex((ln) => ln.includes(x.from));
      seen[u]++;
      const nb = [x.lanes[k - 1], x.lanes[k + 1]].filter(Boolean);
      const nu = nb.map((ln) => majorityUnit(ln, unit, chains));
      if (nu.includes(u)) selfAdj[u]++;
      if (nu.some((v) => v >= 0 && v !== u)) otherAdj[u]++;
    }
    // …and never beside another size look (two sizes drawn alike still meet the others)
    const keep = unitNames.map(
      (_, u) => !(seen[u] >= 20 && selfAdj[u] / seen[u] >= 0.8 && otherAdj[u] / seen[u] < 0.1),
    );
    diag.selfAdjacency = unitNames.map(
      (nm, u) =>
        `${nm}:${(selfAdj[u] / Math.max(1, seen[u])).toFixed(2)}/${(otherAdj[u] / Math.max(1, seen[u])).toFixed(2)}/${seen[u]}`,
    );
    if (keep.some((k) => !k)) {
      diag.selfBundledLooks = unitNames
        .map((nm, u) => (keep[u] ? '' : `${nm}:${(selfAdj[u] / seen[u]).toFixed(2)}`))
        .filter(Boolean);
      const remap = new Map<number, number>();
      const names: string[] = [];
      const evs: ClassEvidence[][] = [];
      unitNames.forEach((nm, u) => {
        if (!keep[u]) return;
        remap.set(u, names.length);
        names.push(nm);
        evs.push(unitEvidence[u]);
      });
      for (let i = 0; i < unit.length; i++)
        if (unit[i] >= 0) {
          const v = remap.get(unit[i]);
          unit[i] = v === undefined ? -1 : v;
          if (v === undefined) notSize.add(i);
        }
      unitNames = names;
      unitEvidence = evs;
    }
  }
  // ── legend identity: the drawing's own key names the line groups ─────────────────────────────
  const legendKey = [...legendRun]
    .map((l) => parseSizeToken(l, true)!)
    .sort((a, b) => a.value - b.value)
    .map((t) => t.label);
  let legendId: LegendIdentity | null = null;
  const unranked = new Set<number>(); // size lines the key does not name: ranked by neighbours
  if (
    (encoding === 'declared-dash' || encoding === 'subpath-dash' || encoding === 'separate-dash') &&
    legendKey.length >= 3 &&
    legendHits.length >= 3
  ) {
    // only lines that could be size lines: the units found so far, declared dashes, bundled looks
    const eligible = chains.map(
      (c, i) =>
        cand[i] &&
        !notSize.has(i) &&
        (unit[i] >= 0 ||
          !!styles.get(c.style)?.dash?.some((v) => v > 0.01) ||
          (looks.look[i] >= 0 && sizeLook[looks.look[i]])),
    );
    const lid = legendIdentity(
      chains,
      sigs,
      eligible,
      styles,
      looks.look,
      (i) => describeSig(sigs[i]),
      legendHits,
      legendKey,
    );
    const before = lenOf(
      chains,
      chains.map((_, i) => i).filter((i) => cand[i] && unit[i] >= 0),
    );
    const got = lid ? lid.label.reduce((a, k, i) => a + (k >= 0 ? chains[i].lengthMm : 0), 0) : 0;
    const distinct = lid ? lid.matched.filter((m) => m.length).length : 0;
    diag.legendIdentity = lid
      ? {
          matched: lid.matched.map(
            (m, k) =>
              `${legendKey[k]}=${m.map((x) => `${x.group}(${(x.lengthMm / 1000).toFixed(1)}m ${x.score})`).join('+') || '∅'}`,
          ),
          unmatched: lid.unmatched.map(
            (u) => `${u.group} ${(u.lengthMm / 1000).toFixed(1)}m best ${u.best} ${u.score}`,
          ),
          coverage: +(got / Math.max(1, before)).toFixed(2),
        }
      : null;
    if (lid && distinct >= Math.max(3, Math.ceil(legendKey.length / 2)) && got >= 0.4 * before) {
      legendId = lid;
      for (let i = 0; i < chains.length; i++) {
        if (!cand[i]) continue;
        if (lid.label[i] >= 0) unit[i] = lid.label[i];
        else {
          if (unit[i] >= 0 && !notSize.has(i)) unranked.add(i);
          unit[i] = -1;
        }
      }
      unitNames = legendKey.slice();
      unitEvidence = legendKey.map((_, k) => {
        const ev: ClassEvidence[] = [];
        const ch = chains.findIndex((_, i) => lid.label[i] === k);
        const d = ch >= 0 ? styles.get(chains[ch].style)?.dash : null;
        if (ch >= 0 && d && d.some((v) => v > 0.01))
          ev.push({ kind: 'declared-dash', dash: normDash(d) });
        else if (ch >= 0 && sigs[ch]?.motif)
          ev.push({ kind: 'recovered-motif', motif: sigs[ch].motif! });
        return ev;
      });
      for (const k of lid.absent)
        ambiguities.push({
          kind: 'size-empty',
          message: `the legend's sample for ${legendKey[k]} matches no line on the sheet: ${legendKey[k]} is drawn on another size's line or not at all`,
          classes: [],
          chains: [],
          at: legendHits.find((h) => h.label === legendKey[k])?.text.anchor ?? null,
        });
      for (const u of lid.unmatched)
        ambiguities.push({
          kind: 'class-split',
          message: `${(u.lengthMm / 1000).toFixed(1)} m drawn as "${u.group}" match no legend sample (closest ${u.best}, ${u.score}): ranked by their neighbours`,
          classes: [],
          chains: [],
          at: null,
        });
    }
  }
  const nUnits = unitNames.length;
  if (process.env.F3_DEBUG)
    diag.allLooks = Array.from({ length: nLooks }, (_, l) => l)
      .filter((l) => lookLen[l] > 200)
      .map(
        (l) =>
          `${lookDesc(l)} L=${(lookLen[l] / 1000).toFixed(1)} b=${(lookBundled[l] / Math.max(1, lookLen[l])).toFixed(2)}${sizeLook[l] ? ' SIZE' : ''}`,
      );

  // ── cross-sections over size candidates; every other line blocks ────────────────────────────
  const sizeCand = chains.map((_, i) => cand[i] && (unit[i] >= 0 || unranked.has(i)));
  if (encoding === 'text-label')
    for (let i = 0; i < chains.length; i++)
      if (cand[i] && looks.look[i] >= 0 && sizeLook[looks.look[i]] && !notSize.has(i))
        sizeCand[i] = true;
  // lane spacing: plus-size runs (reef XS–5XL) grade 10–25 mm per size on long seams; a fixed
  // 12 mm reach leaves those lines alone and they read as shared. Measure the spacing between
  // neighbouring lanes of different identity and reach 1.5× its upper quartile (12…30 mm).
  let sepMm = BUNDLE.maxSepMm;
  {
    const wide = crossSections(chains, sizeCand, blockers, 40).sections;
    const gaps: number[] = [];
    for (const x of wide)
      for (let k = 1; k < x.lanes.length; k++) {
        const a = majorityUnit(x.lanes[k - 1], unit, chains);
        const b = majorityUnit(x.lanes[k], unit, chains);
        if (a >= 0 && b >= 0 && a !== b) gaps.push(x.offsets[k] - x.offsets[k - 1]);
      }
    gaps.sort((a, b) => a - b);
    if (gaps.length >= 50) {
      const q75 = gaps[Math.floor(0.75 * (gaps.length - 1))];
      sepMm = Math.min(30, Math.max(BUNDLE.maxSepMm, 1.5 * q75));
    }
    diag.laneSpacing = {
      n: gaps.length,
      median: gaps.length ? +gaps[gaps.length >> 1].toFixed(1) : null,
      q75: gaps.length ? +gaps[Math.floor(0.75 * (gaps.length - 1))].toFixed(1) : null,
      reachMm: +sepMm.toFixed(1),
    };
  }
  const xsB = crossSections(chains, sizeCand, blockers, sepMm).sections;
  const laneUnit = (lane: number[]) => majorityUnit(lane, unit, chains);
  const laneHist = new Map<number, number>();
  for (const x of xsB) laneHist.set(x.lanes.length, (laneHist.get(x.lanes.length) ?? 0) + 1);
  diag.sectionLanes = Object.fromEntries([...laneHist].sort((a, b) => a[0] - b[0]));

  // ── size count n ────────────────────────────────────────────────────────────────────────────
  const coverage = (nn: number) => {
    let cov = 0;
    for (const x of xsB) {
      if (x.lanes.length < nn) continue;
      for (const g of x.lanes.length > nn
        ? splitSection(x, nn, laneUnit)
        : [x.lanes.map((_, k) => k)]) {
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
  } else if (
    encoding === 'ocg' ||
    encoding === 'file-per-size' ||
    encoding === 'declared-dash' ||
    encoding === 'color'
  ) {
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
    const widths = [...distinctHist]
      .filter(([k, v]) => k >= 3 && v >= 0.15 * modeFreq)
      .map(([k]) => k);
    const scores: [number, number][] = [];
    for (let nn = 3; nn <= 12; nn++) scores.push([nn, coverage(nn)]);
    scores.sort((a, b) => b[1] - a[1]);
    n = widths.length ? Math.max(...widths) : scores[0][1] > 0 ? scores[0][0] : Math.max(2, nUnits);
    nWhy = `widest look-distinct lane run (${[...distinctHist]
      .sort((a, b) => a[0] - b[0])
      .map(([k, v]) => `${k}:${v}`)
      .join(' ')})`;
    diag.coverage = scores
      .slice(0, 4)
      .map(([k, v]) => `${k}:${v}`)
      .join(' ');
    const runN = new Set(
      runs
        .filter((r) => r.labels.length >= 3 && (r.keyword || r.kind === 'legend'))
        .map((r) => r.labels.length),
    );
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
  if (legendId && n !== legendKey.length) {
    nWhy += ` → ${legendKey.length} (the legend names ${legendKey.join(' ')})`;
    n = legendKey.length;
  }
  diag.n = { n, why: nWhy };
  {
    const said = new Set(
      runs
        .filter((r) => r.labels.length >= 3 && (r.keyword || r.kind === 'legend'))
        .map((r) => r.labels.length),
    );
    if (said.size && !said.has(n))
      ambiguities.push({
        kind: 'size-count',
        message: `${n} sizes found in the drawing, the text names ${[...said].join(' or ')} (${runs
          .filter((r) => said.has(r.labels.length))
          .slice(0, 2)
          .map((r) => r.source)
          .join('; ')})`,
        classes: [],
        chains: [],
        at: null,
      });
  }

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
      groups.push({
        x,
        lanes: p,
        group: { units: p.map((k) => laneUnit(x.lanes[k])), weights: p.map(() => 1), flip: false },
      });
    }
  }
  diag.groups = {
    total: groups.length,
    full: groups.filter((g) => g.lanes.length === n).length,
    superSplit,
  };

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
  let labelEvidence: ClassEvidence[][] = Array.from({ length: n }, () => []);
  if (legendId) {
    labels = legendKey.slice();
    labels.forEach((l, r) =>
      labelEvidence[r].push({
        kind: 'text-label',
        text: `legend ${l}`,
        distanceMm: medianDist(legendHits, l!),
      }),
    );
  }
  // votes[chain] = weight per rank
  const votes = new Map<number, number[]>();
  // sizes the legend shows but the sheet does not draw apart (viola 34 on 36's line) take no votes
  const noVote = new Set(legendId?.absent ?? []);
  const vote = (c: number, r: number, w: number) => {
    if (r < 0 || r >= n || noVote.has(r)) return;
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
      t: parseSizeToken(
        encoding === 'ocg' ? u : fileSizeLabel(inp.fileNames?.get(u) ?? '') ?? '',
        true,
      ),
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
      const rs = g.lanes.map((k) =>
        unit[g.x.lanes[k][0]] >= 0 ? unitRank[unit[g.x.lanes[k][0]]] : -1,
      );
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
    const order = [...hitLabels.keys()]
      .map((l) => parseSizeToken(l, true)!)
      .sort((a, b) => a.value - b.value);
    labels = order.map((t) => t.label);
    const rankOfLabel = new Map(order.map((t, r) => [t.label, r]));
    const laneLabel = (lane: number[]) => {
      const m = new Map<number, number>();
      for (const c of lane)
        for (const l of hitByChain.get(c) ?? [])
          m.set(rankOfLabel.get(l)!, (m.get(rankOfLabel.get(l)!) ?? 0) + 1);
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
        const fit =
          bestFit && (known >= 2 || g.lanes.length === n) ? bestFit.base + bestFit.dir * idx : -1;
        for (const c of g.x.lanes[k]) {
          if (fit >= 0) vote(c, fit, 1);
          else if (own >= 0) vote(c, own, 0.5);
        }
      });
    }
    for (const [c, ls] of hitByChain) for (const l of ls) vote(c, rankOfLabel.get(l)!, 3);
    settle(0.5);
    // propagate along the line work: a chain ranked anywhere ranks its neighbours in every group it
    // shares; with one anchor the direction comes from the inside side (larger sizes outside)
    for (let round = 0; round < 6; round++) {
      let added = 0;
      for (const g of groups) {
        const lr = g.lanes.map((k) => {
          const m = new Map<number, number>();
          for (const c of g.x.lanes[k])
            if (rankOf.has(c)) m.set(rankOf.get(c)!, (m.get(rankOf.get(c)!) ?? 0) + 1);
          return m.size === 1 ? [...m.keys()][0] : -1;
        });
        const known = lr.map((r, k) => ({ r, k })).filter((e) => e.r >= 0);
        if (known.length === g.lanes.length) continue;
        let dir = 0;
        for (let a = 0; a < known.length; a++)
          for (let b = a + 1; b < known.length; b++)
            dir += Math.sign(known[b].r - known[a].r) * Math.sign(known[b].k - known[a].k);
        if (dir === 0) {
          const A = closureArea(chains[g.x.from].pts);
          if (Math.abs(A) < 100) continue;
          dir = A > 0 ? -1 : 1; // interior at +normal (higher lane index) → ranks fall that way
        }
        const step = dir > 0 ? 1 : -1;
        const anchors = known.length
          ? known
          : g.lanes.length === n
            ? [{ r: step > 0 ? 0 : n - 1, k: 0 }]
            : [];
        if (!anchors.length) continue;
        g.lanes.forEach((k, idx) => {
          if (lr[idx] >= 0) return;
          const a = anchors.reduce((x, y) => (Math.abs(y.k - idx) < Math.abs(x.k - idx) ? y : x));
          const r = a.r + step * (idx - a.k);
          if (r >= 0 && r < n)
            for (const c of g.x.lanes[k]) vote(c, r, known.length >= 2 ? 1 : 0.5);
        });
      }
      const before = rankOf.size;
      settle(0.5);
      added = rankOf.size - before;
      if (!added) break;
    }
    labels.forEach(
      (l, r) =>
        l &&
        labelEvidence[r].push({ kind: 'text-label', text: l, distanceMm: medianDist(hits, l) }),
    );
  } else {
    // nesting order (declared-dash, file without labels, rhythm): seriate the units over every
    // group, orient the axis by the inside vote, cut it into n ranks
    const ser = seriate(
      groups.map((g) => ({ units: g.group.units, turn: g.x.turn })),
      nUnits,
      n,
    );
    {
      // where all n sizes stand side by side in distinct looks/colours, the lane order IS the size
      // order (up to direction): one permutation dominating those cross-sections overrides the
      // seriation coordinates (leonie: 358 of 364 full sections read grey·purple·yellow·green·pink·blue)
      const perm = new Map<string, number>();
      let fullDistinct = 0;
      for (const g of groups) {
        const us = g.group.units;
        if (us.length !== n || us.some((u) => u < 0) || new Set(us).size !== n) continue;
        fullDistinct++;
        const seq = us[0] < us[us.length - 1] ? us : us.slice().reverse();
        const k = seq.join(',');
        perm.set(k, (perm.get(k) ?? 0) + 1);
      }
      const top = [...perm].sort((a, b) => b[1] - a[1]);
      diag.permutations = {
        fullDistinct,
        top: top.slice(0, 4).map(([k, v]) => `${k}:${v}`),
      };
      if (!legendId && top.length && top[0][1] >= 30 && top[0][1] >= 0.6 * fullDistinct) {
        const order = top[0][0].split(',').map(Number);
        const supp = ser.support.slice().sort((a, b) => a - b);
        const med = supp[supp.length >> 1] ?? 0;
        const outside = ser.support
          .map((sp, u) => ({ u, sp }))
          .filter((e) => !order.includes(e.u) && e.sp >= 0.1 * med);
        if (!outside.length) {
          const p0 = ser.p;
          // a minor look outside the permutation sits where its seriation coordinate is nearest
          ser.p = p0.map((x, u) => {
            if (order.includes(u)) return order.indexOf(u);
            if (!Number.isFinite(x)) return x;
            let bk = 0;
            for (let k = 1; k < order.length; k++)
              if (Math.abs(p0[order[k]] - x) < Math.abs(p0[order[bk]] - x)) bk = k;
            return bk;
          });
          diag.permutationOrder = order.map((u) => unitNames[u]);
        }
      }
    }
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
      const known = g.group.units
        .map((u, k) => ({ k, p: u >= 0 ? ser.p[u] : NaN }))
        .filter((e) => Number.isFinite(e.p));
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
    const identityUnits =
      encoding === 'declared-dash' || encoding === 'file-per-size' || !!legendId;
    let ur: number[];
    if (legendId) {
      // the key IS the order: unit k = key index k
      ur = unitNames.map((_, u) => u);
    } else if ((identityUnits || encoding === 'color') && nUnits === n) {
      // each unit IS a size: its rank is its place on the axis (coordinates compress, order holds)
      const order = ser.p
        .map((x, u) => ({ u, x: Number.isFinite(x) ? x : Infinity }))
        .sort((a, b) => a.x - b.x);
      ur = new Array(nUnits).fill(-1);
      order.forEach((e, r) => {
        if (Number.isFinite(e.x)) ur[e.u] = r;
      });
    } else ur = ranksFromCoords(ser.p, n, ser.support);
    for (let u = 0; u < nUnits; u++) {
      unitRank[u] = ur[u];
      unitPurity[u] = ser.support[u] ? 1 - ser.selfRepeat[u] / ser.support[u] : 0;
    }
    diag.seriation = {
      stress: +ser.stress.toFixed(2),
      p: ser.p.map((x) => (Number.isFinite(x) ? +x.toFixed(1) : null)),
    };
    const pure = (u: number) => u >= 0 && unitRank[u] >= 0 && unitPurity[u] >= 0.8;
    for (const g of groups) {
      const r = g.group.units.map((u) => (pure(u) ? unitRank[u] : -1));
      if (encoding === 'color') {
        // a lane whose colour breaks the order of the others is that look borrowed by another
        // size (leonie: 38 drawn in 44's purple on three tiles): keep the longest monotone run of
        // known ranks, the rest are filled from their neighbours like unknown lanes
        const keep = longestMonotone(r);
        for (let k = 0; k < r.length; k++) if (r[k] >= 0 && !keep.has(k)) r[k] = -1;
      }
      // direction of rank along the lanes, from the known lanes
      let dir = 0;
      for (let a = 0; a < r.length; a++)
        for (let b = a + 1; b < r.length; b++)
          if (r[a] >= 0 && r[b] >= 0) dir += Math.sign(r[b] - r[a]);
      // fill unknown lanes outward from the known ones, one step per lane, both directions
      const filled = r.slice();
      if (dir !== 0) {
        const step = dir > 0 ? 1 : -1;
        for (let pass = 0; pass < 2; pass++) {
          for (let idx = 1; idx < filled.length; idx++)
            if (filled[idx] < 0 && filled[idx - 1] >= 0) filled[idx] = filled[idx - 1] + step;
          for (let idx = filled.length - 2; idx >= 0; idx--)
            if (filled[idx] < 0 && filled[idx + 1] >= 0) filled[idx] = filled[idx + 1] - step;
        }
      }
      g.lanes.forEach((k, idx) => {
        const rk = filled[idx];
        const w = r[idx] >= 0 ? 1 : 0.7;
        if (rk >= 0 && rk < n) for (const c of g.x.lanes[k]) vote(c, rk, w);
      });
    }
    chains.forEach((_, i) => {
      const u = unit[i];
      if (identityUnits && u >= 0 && unitRank[u] >= 0)
        rankOf.set(i, unitRank[u]); // identity wins
      // colour is a hint, not identity: one vote, the cross-sections outvote it where they disagree
      else if (pure(u) && sizeCand[i] && (encoding !== 'color' || votes.has(i)))
        // a colour chain no cross-section saw (black text among the 46 lines) is not ranked by
        // its colour alone
        vote(i, unitRank[u], encoding === 'color' ? 1 : 4);
    });
    settle(0.45);
    for (let u = 0; u < nUnits; u++)
      if (!identityUnits && ser.support[u] >= 10 && unitPurity[u] < 0.8)
        ambiguities.push({
          kind: 'class-merge',
          message: `look "${unitNames[u]}" appears twice side by side in ${(100 * (1 - unitPurity[u])).toFixed(0)} % of its sections: two sizes may be drawn alike; its chains are ranked by their neighbours`,
          classes: [],
          chains: chains
            .map((_, i) => i)
            .filter((i) => unit[i] === u)
            .slice(0, 50),
          at: null,
        });
    if (encoding === 'color') {
      // a colour chain that never runs beside a line of ANOTHER colour is not a size line: black
      // text and black construction lines share the 46 colour (leonie)
      const besideOther = new Set<number>();
      for (const x of xsB)
        x.lanes.forEach((ln, k) => {
          const own = majorityUnit(ln, unit, chains);
          const nb = [x.lanes[k - 1], x.lanes[k + 1]].filter(Boolean);
          if (nb.some((l) => majorityUnit(l, unit, chains) !== own))
            for (const c of ln) besideOther.add(c);
        });
      let dropped = 0;
      for (const c of [...rankOf.keys()])
        if (!besideOther.has(c)) {
          rankOf.delete(c);
          dropped += chains[c].lengthMm;
        }
      diag.colourAlone = +(dropped / 1000).toFixed(2);
      // colour borrowed by another size (leonie: 38 drawn in 44's purple on some tiles): the
      // cross-sections ranked these chains away from their colour — say where
      const moved = new Map<string, { n: number; len: number; ids: number[] }>();
      for (const [c, r] of rankOf) {
        const u = unit[c];
        if (u < 0 || unitRank[u] < 0 || unitRank[u] === r) continue;
        const k = `${u}|${r}`;
        const e = moved.get(k) ?? { n: 0, len: 0, ids: [] };
        e.n++;
        e.len += chains[c].lengthMm;
        if (e.ids.length < 50) e.ids.push(c);
        moved.set(k, e);
      }
      for (const [k, e] of moved) {
        if (e.len < 100) continue;
        const [u, r] = k.split('|').map(Number);
        ambiguities.push({
          kind: 'class-split',
          message: `${e.n} chains (${(e.len / 1000).toFixed(1)} m) drawn in ${unitNames[u]} (rank ${unitRank[u]}) sit where rank ${r} runs: ranked ${r} by nesting — confirm`,
          classes: [],
          chains: e.ids,
          at: chains[e.ids[0]].pts[0],
        });
      }
    }
    if (encoding === 'file-per-size') labels = labels.map(() => null);
  }

  // ── identity vs nesting: where every line carries its size (OCG, file, declared dash, the
  // legend), the sizes met crossing a graded group must come in order — in either direction. A
  // group whose known sizes go up and down contradicts the identities (shuffled dashes, a wrong
  // key match): flag it rather than trust either.
  if (identityEncoding(encoding) || legendId) {
    let mono = 0;
    let broken = 0;
    const bad: number[] = [];
    for (const g of groups) {
      // lanes of ONE size only (a line printed in every OCG layer is one lane of all sizes)
      const rs = g.lanes
        .map((k) => {
          const us = new Set(g.x.lanes[k].map((c) => unit[c]).filter((u) => u >= 0));
          return us.size === 1 ? unitRank[[...us][0]] : -1;
        })
        .filter((r) => r >= 0);
      if (rs.length < 3) continue;
      let up = 0;
      let down = 0;
      for (let k = 1; k < rs.length; k++) {
        if (rs[k] > rs[k - 1]) up++;
        else if (rs[k] < rs[k - 1]) down++;
      }
      if (up && down) {
        broken++;
        if (bad.length < 50) bad.push(g.x.from);
      } else mono++;
    }
    diag.identityOrder = { monotone: mono, broken };
    if (broken > 0.2 * (mono + broken) && broken >= 10)
      ambiguities.push({
        kind: 'class-merge',
        message: `size identities and nesting disagree: in ${broken} of ${mono + broken} graded cross-sections the sizes do not come in order (${encoding}${legendId ? ', legend' : ''}) — a class may carry two sizes or a size two looks`,
        classes: [],
        chains: bad,
        at: bad.length ? chains[bad[0]].pts[0] : null,
      });
  }

  // ── legend: sample strokes with a size token beside them name the units directly ────────────
  diag.legendHits = legendHits.map((h) => `${h.label}:c${h.chain}`);
  if (
    legendHits.length >= 3 &&
    !legendId &&
    encoding !== 'ocg' &&
    encoding !== 'text-label' &&
    !(encoding === 'file-per-size' && labelOrderKnown)
  ) {
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
          const s1 =
            Math.sign(pairs[a].r - pairs[b].r) * Math.sign(pairs[a].value - pairs[b].value);
          if (s1 > 0) agree++;
          else if (s1 < 0) against++;
        }
      diag.legend = { pairs: pairs.map((p) => `r${p.r}=${p.label}`), agree, against };
      // the legend's labels form a run: label index = rank. Map the seriated ranks onto it with a
      // flip and/or a shift (a size that never shows as its own lane leaves a hole at one end).
      const legendLabels = [...legendRun]
        .map((l) => parseSizeToken(l, true)!)
        .sort((x, y) => x.value - y.value);
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
        if (
          bestMap &&
          bestMap.hit >= Math.max(2, Math.ceil(pairs.length / 2)) &&
          (bestMap.sgn !== 1 || bestMap.t !== 0)
        ) {
          const f = (r: number) => bestMap!.sgn * r + bestMap!.t;
          for (const [c, r] of [...rankOf]) {
            const nr = f(r);
            if (nr >= 0 && nr < n) rankOf.set(c, nr);
            else rankOf.delete(c);
          }
          for (let u = 0; u < nUnits; u++) if (unitRank[u] >= 0) unitRank[u] = f(unitRank[u]);
          for (const p of pairs) p.r = f(p.r);
          diag.legendRemap = {
            sgn: bestMap.sgn,
            shift: bestMap.t,
            hit: bestMap.hit,
            of: pairs.length,
          };
          agree = pairs.length;
          against = 0;
          for (let a2 = 0; a2 < pairs.length; a2++)
            for (let b2 = a2 + 1; b2 < pairs.length; b2++)
              if (
                Math.sign(pairs[a2].r - pairs[b2].r) !==
                Math.sign(pairs[a2].value - pairs[b2].value)
              )
                against++;
          if (against) agree = 0;
          // every legend label sits on its index now
          legendLabels.forEach((t, k) => {
            labels[k] = t.label;
            labelEvidence[k].push({
              kind: 'text-label',
              text: `legend ${t.label}`,
              distanceMm: medianDist(legendHits, t.label),
            });
          });
        }
      } else if (legendLabels.length > n && pairs.length >= 3 && Math.min(agree, against) === 0) {
        // the key names more sizes than distinct lines were found (reef: 9 named, 8 drawn apart):
        // ranks move to the key's index; ranks between two anchors are spread between them
        const sgn = against > agree ? -1 : 1;
        const anchors = pairs
          .map((p) => ({ old: sgn > 0 ? p.r : n - 1 - p.r, idx: idxOf.get(p.label)! }))
          .sort((a, b) => a.old - b.old);
        const newN = legendLabels.length;
        const mapRank = (r0: number) => {
          const r = sgn > 0 ? r0 : n - 1 - r0;
          const hit = anchors.find((a) => a.old === r);
          if (hit) return hit.idx;
          const lo = [...anchors].reverse().find((a) => a.old < r);
          const hi = anchors.find((a) => a.old > r);
          if (lo && hi)
            return Math.round(lo.idx + ((r - lo.old) * (hi.idx - lo.idx)) / (hi.old - lo.old));
          if (lo) return Math.min(newN - 1, lo.idx + (r - lo.old));
          if (hi) return Math.max(0, hi.idx - (hi.old - r));
          return r;
        };
        for (const [c, r] of [...rankOf]) rankOf.set(c, mapRank(r));
        for (let u = 0; u < nUnits; u++) if (unitRank[u] >= 0) unitRank[u] = mapRank(unitRank[u]);
        diag.legendExpand = { from: n, to: newN, anchors: anchors.map((a) => `${a.old}→${a.idx}`) };
        n = newN;
        labels = legendLabels.map((t) => t.label);
        labelEvidence = labels.map((l) => [
          {
            kind: 'text-label' as const,
            text: `legend ${l}`,
            distanceMm: medianDist(legendHits, l!),
          },
        ]);
        agree = 1;
        against = 0;
        for (const p of pairs) p.r = idxOf.get(p.label)!;
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
          if (p.r < 0 || p.r >= n || labels[p.r] === p.label) continue;
          labels[p.r] = p.label;
          labelEvidence[p.r].push({
            kind: 'text-label',
            text: `legend ${p.label}`,
            distanceMm: medianDist(legendHits, p.label),
          });
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
    // when the file SAYS its size run (a key, "Size: 36-46") and the count differs, a coincidental
    // row of numbers with the right count must not name the sizes
    const said = runs.filter((r) => r.labels.length >= 3 && (r.keyword || r.kind === 'legend'));
    const exact = runs.filter(
      (r) => r.labels.length === n && (!said.length || r.keyword || r.kind === 'legend'),
    );
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
      labels.forEach(
        (l, r) =>
          l &&
          labelEvidence[r].push({ kind: 'text-label', text: pick.source, distanceMm: Infinity }),
      );
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
  const sectioned = new Set<number>();
  for (const x of xsB)
    if (x.lanes.length >= 2) for (const l of x.lanes) for (const c of l) sectioned.add(c);
  // which unranked size candidates actually run beside graded lines (a ranked neighbour lane), and
  // the widest section each sits in: drawn letters, grain arrows and notch stacks drawn in the size
  // pen bundle only with themselves
  const besideRanked = new Set<number>();
  const widest = new Map<number, number>();
  for (const x of xsB) {
    x.lanes.forEach((ln, k) => {
      for (const c of ln) widest.set(c, Math.max(widest.get(c) ?? 0, x.lanes.length));
      const nb = [x.lanes[k - 1], x.lanes[k + 1]].filter(Boolean).flat();
      if (nb.some((c) => rankOf.has(c))) for (const c of ln) besideRanked.add(c);
    });
  }
  splitShared(chains, rankOf, sharedFrom, landings, sectioned, sepMm);
  diag.bridges = joined.size;
  diag.landings = landings.length;

  // ── classify the rest ───────────────────────────────────────────────────────────────────────
  const common: number[] = [...ocgCommon];
  const internal: number[] = [];
  const ignore: { id: number; why: string }[] = [
    ...ocgDropped,
    ...[...joined].map(([id, host]) => ({ id, why: `joined into chain ${host}` })),
  ];
  const orphans: number[] = [];
  const decided = new Set([...ocgCommon, ...ocgDropped.map((d) => d.id), ...joined.keys()]);
  const contourWidth = medianWidth(chains, rankOf, styles);
  const touchGrid = new SegGrid(6);
  chains.forEach((c, i) => {
    if (!(i < N0 && furniture[i])) touchGrid.addPolyline(i, c.pts);
  });
  const notches: number[] = [];
  const isNotch = (i: number) => {
    // a short straight mark ending on (or crossing) an outline at a steep angle
    const c = chains[i];
    if (c.lengthMm > 25 || c.lengthMm < 1.5) return false;
    const a = c.pts[0];
    const b = c.pts[c.pts.length - 1];
    const L = dist(a, b);
    if (L < 0.9 * c.lengthMm) return false;
    const t = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    let steep = false;
    // ends, middle, and every mm between: a graded notch stack crosses the size lines it marks
    const probes = [a, b];
    for (let t = 0; t <= L; t += 1)
      probes.push({ x: a.x + (b.x - a.x) * (t / L), y: a.y + (b.y - a.y) * (t / L) });
    for (const p of probes) {
      touchGrid.near(p, 1, (j, si) => {
        if (steep || j === i || !(rankOf.has(j) || sharedFrom.has(j))) return;
        const q0 = chains[j].pts[si];
        const q1 = chains[j].pts[si + 1];
        if (!q0 || !q1 || segNearest(p, q0, q1).d > 1) return;
        const sl = dist(q0, q1) || 1;
        if (Math.abs((t.x * (q1.x - q0.x) + t.y * (q1.y - q0.y)) / sl) < Math.cos(Math.PI / 4))
          steep = true;
      });
    }
    return steep;
  };
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
    if (isNotch(i)) {
      notches.push(i);
      return;
    }
    if (i < N0 && sizeCand[i]) {
      // never beside another size line: not a graded line at all — an outline drawn once in a
      // size's style when it meets other lines, else a free internal line (grain drawn in w0.35)
      if (!sectioned.has(i)) {
        if (touchesOthers(i)) common.push(i);
        else internal.push(i);
      } else if (
        besideRanked.has(i) ||
        ((widest.get(i) ?? 0) >= Math.max(3, n - 1) && c.lengthMm >= 15)
      )
        orphans.push(i);
      else internal.push(i);
      return;
    }
    const st = styles.get(c.style);
    if (c.lengthMm < 8) {
      ignore.push({ id: i, why: 'fragment < 8 mm' });
      return;
    }
    // same weight as size lines = outline (common); thinner = internal (grain, darts, placement)
    if (
      st &&
      contourWidth > 0 &&
      st.widthMm >= contourWidth * 0.85 &&
      !(st.fill && st.widthMm === 0)
    )
      common.push(i);
    else internal.push(i);
  });

  // ── classes ─────────────────────────────────────────────────────────────────────────────────
  const sizes: SizeClassOut[] = [];
  for (let r = 0; r < n; r++) {
    const ids = [...rankOf.entries()].filter(([, rr]) => rr === r).map(([c]) => c);
    const us = new Map<number, number>();
    for (const c of ids)
      if (unit[c] >= 0) us.set(unit[c], (us.get(unit[c]) ?? 0) + chains[c].lengthMm);
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
    sizes.push({
      rank: r,
      label: labels[r] ?? null,
      chains: ids,
      evidence: ev,
      confidence: +conf.toFixed(2),
      looks: lk,
    });
    if (!ids.length)
      ambiguities.push({
        kind: 'size-empty',
        message: `no line found for rank ${r}${labels[r] ? ` (${labels[r]})` : ''}`,
        classes: [],
        chains: [],
        at: null,
      });
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
      at: chains[orphans.reduce((a, b) => (chains[a].lengthMm >= chains[b].lengthMm ? a : b))]
        .pts[0],
    });
  }

  // ── bundles: full groups whose lanes map to n distinct ranks, keyed by their chain tuple ──────
  const tuples = new Map<string, { chains: number[]; support: number; spacing: number }>();
  // ranks that exist at all: when a size never shows as its own line (viola 34), bundles of the
  // others are counted too (diagnostic only — a contract Bundle has one chain per rank)
  const present = new Set(rankOf.values());
  const relaxed = new Map<string, number>();
  for (const g of groups) {
    if (present.size < n && g.lanes.length === present.size) {
      const rs = g.lanes.map((k) => {
        const ids = g.x.lanes[k].filter((c) => rankOf.has(c));
        return ids.length
          ? rankOf.get(ids.reduce((a, b) => (chains[a].lengthMm >= chains[b].lengthMm ? a : b)))!
          : -1;
      });
      if (rs.every((r) => r >= 0) && new Set(rs).size === present.size) {
        const key = g.lanes
          .map((k) => g.x.lanes[k].filter((c) => rankOf.has(c)).sort((a, b) => a - b)[0])
          .sort((a, b) => a - b)
          .join(',');
        relaxed.set(key, (relaxed.get(key) ?? 0) + 1);
      }
    }
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
  diag.presentRanks = present.size;
  diag.bundlesOfPresentRanks = [...relaxed.values()].filter((v) => v >= 3).length;
  diag.bundleSupport = bundles.map((b) => tuples.get(b.chains.join(','))!.support);
  if (
    encoding !== 'ocg' &&
    encoding !== 'file-per-size' &&
    encoding !== 'text-label' &&
    nUnits &&
    n &&
    nUnits !== n
  )
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
    notches,
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
  // every (label, sample stroke) candidate with a score; assigned one-to-one below (a stroke
  // between two labels belongs to the nearer one: reef's chevrons are no chain, so "SIZE S" must not
  // take the XS stroke above it)
  type Cand = {
    text: IRText;
    label: string;
    value: number;
    chain: number;
    d: number;
    score: number;
  };
  const cands: Cand[] = [];
  const segs = new SegGrid(8);
  chains.forEach((c, i) => {
    if (ok[i] && c.lengthMm < 150 && !c.closed) segs.addPolyline(i, c.pts);
  });
  for (const tx of texts) {
    const worded = /^(size|größe|gr\.|taille|talla|maat|rozmiar|размер)\b/i.test(tx.text.trim());
    const tok = parseSizeToken(tx.text, !worded);
    if (!tok) continue;
    const b = tx.bbox;
    if (worded) {
      // "SIZE XS" with its sample stroke under / beside it (reef's Size Line Key)
      const best = new Map<number, number>();
      const c0 = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
      segs.near(c0, 12, (ci, si) => {
        const a = chains[ci].pts[si];
        const q = chains[ci].pts[si + 1];
        for (const p of [a, q, { x: (a.x + q.x) / 2, y: (a.y + q.y) / 2 }]) {
          const dx = Math.max(b.minX - p.x, 0, p.x - b.maxX);
          const dy = Math.max(b.minY - p.y, 0, p.y - b.maxY);
          const d = Math.hypot(dx, dy);
          if (d < 5 && d < (best.get(ci) ?? Infinity)) best.set(ci, d);
        }
      });
      for (const [ci, d] of best)
        cands.push({ text: tx, label: tok.label, value: tok.value, chain: ci, d, score: d });
      continue;
    }
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const h = Math.max(1, b.maxY - b.minY, b.maxX - b.minX);
    const best = new Map<number, { d: number; score: number }>();
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
      const prev = best.get(e.c);
      if (!prev || score < prev.score) best.set(e.c, { d, score });
    });
    for (const [ci, v] of best)
      cands.push({
        text: tx,
        label: tok.label,
        value: tok.value,
        chain: ci,
        d: v.d,
        score: v.score,
      });
  }
  cands.sort((a, b) => a.score - b.score);
  if (process.env.F3_LEGEND)
    for (const c of cands)
      console.log(`legend cand ${c.label} c${c.chain} d=${c.d.toFixed(2)} s=${c.score.toFixed(2)}`);
  const usedText = new Set<IRText>();
  const usedChain = new Set<number>();
  const out: { text: IRText; label: string; value: number; chain: number; d: number }[] = [];
  for (const c of cands) {
    if (usedText.has(c.text) || usedChain.has(c.chain)) continue;
    usedText.add(c.text);
    usedChain.add(c.chain);
    out.push({ text: c.text, label: c.label, value: c.value, chain: c.chain, d: c.d });
  }
  return out;
}

/**
 * A key is a column (or row) of labels: keep the aligned set with the most distinct labels, one hit
 * per label. Size numbers in a measurement table next to it (viola p29) end table rules too.
 */
function alignedLegend<
  T extends { text: IRText; label: string; value: number; d: number; chain: number },
>(hits: T[], chains: Chain[]): T[] {
  if (hits.length < 3) return hits;
  let best: T[] = [];
  let bestRun = 0;
  for (const axis of ['x', 'y'] as const) {
    for (const h of hits) {
      const v = h.text.anchor[axis];
      const set = hits.filter((o) => Math.abs(o.text.anchor[axis] - v) <= 2);
      const byLabel = new Map<string, T>();
      for (const o of set) {
        const prev = byLabel.get(o.label);
        if (!prev || o.d < prev.d) byLabel.set(o.label, o);
      }
      // a ruler row has more distinct numbers than a key; the key's numbers form a size run
      const run = labelRun([...byLabel.values()], 1, 2).size;
      if (run > bestRun || (run === bestRun && byLabel.size > best.length)) {
        best = [...byLabel.values()];
        bestRun = run;
      }
    }
  }
  if (bestRun < 3) return hits;
  // a key draws its samples alike long: a table rule or an outline ending near a number is not one
  const lens = best.map((h) => chains[h.chain].lengthMm).sort((a, b) => a - b);
  const med = lens[lens.length >> 1];
  return best.filter((h) => {
    const L = chains[h.chain].lengthMm;
    return L >= 0.6 * med && L <= 1.6 * med;
  });
}

/**
 * The size labels placed along lines (r4454 «44»…«54»): among size tokens near lines, the longest
 * consecutive run (numbers with step 2/4/6, or letters) whose labels each occur ≥ 2× and roughly
 * equally often. Ruler digits (step 1), tile marks and piece numbers do not form such a run.
 */
function labelRun(
  hits: { label: string; value: number }[],
  minCount: number,
  holes = 0,
): Set<string> {
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
        let holed = 0;
        for (let j = i + 1; j < vals.length; j++) {
          const last = run[run.length - 1][1].value;
          if (vals[j][1].value === last + step) run.push(vals[j]);
          else if (!letter && holed < holes && vals[j][1].value === last + 2 * step) {
            // a key entry whose sample is not a chain (viola 44: dashes broken by «x» marks)
            run.push([String(last + step), { value: last + step, n: vals[j][1].n, letter }]);
            run.push(vals[j]);
            holed++;
          }
        }
        const ns = run.map(([, e]) => e.n);
        // a hole needs a real run around it: ≥ 4 labels actually seen, at most a quarter missing
        if (holed && (run.length - holed < 4 || holed * 4 > run.length)) continue;
        if (
          run.length >= 3 &&
          Math.min(...ns) >= 0.25 * Math.max(...ns) &&
          run.length > best.length
        )
          best = run.map(([l]) => l);
      }
  }
  return new Set(best);
}

/** Lane indices of the longest strictly monotone (either direction) run of known ranks (≥ 0). */
function longestMonotone(r: number[]): Set<number> {
  const idx = r.map((v, k) => ({ v, k })).filter((e) => e.v >= 0);
  let best: number[] = [];
  for (const sgn of [1, -1]) {
    const L = idx.map(() => 1);
    const prev = idx.map(() => -1);
    for (let a = 0; a < idx.length; a++)
      for (let b = 0; b < a; b++)
        if (sgn * (idx[a].v - idx[b].v) > 0 && L[b] + 1 > L[a]) {
          L[a] = L[b] + 1;
          prev[a] = b;
        }
    let end = -1;
    for (let a = 0; a < idx.length; a++) if (end < 0 || L[a] > L[end]) end = a;
    const seq: number[] = [];
    for (let a = end; a >= 0; a = prev[a]) seq.push(idx[a].k);
    if (seq.length > best.length) best = seq;
  }
  return new Set(best);
}

function identityEncoding(e: SizeEncoding): boolean {
  return e === 'ocg' || e === 'file-per-size' || e === 'declared-dash';
}

function colourKey(rgb: number[]): string {
  return rgb.map((v) => Math.round(v / 8)).join(',');
}
function rgbDist(a: number[], b: number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
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
  const ds = hits
    .filter((h) => h.label === label)
    .map((h) => h.d)
    .sort((a, b) => a - b);
  return ds.length ? +ds[ds.length >> 1].toFixed(2) : Infinity;
}

function medianWidth(
  chains: Chain[],
  rankOf: Map<number, number>,
  styles: Map<number, Style>,
): number {
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
    if (t && (t.kind === 'letter' || (t.value >= 20 && t.value <= 70) || parts.length === 1))
      return t.label;
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
function splitShared(
  chains: Chain[],
  rankOf: Map<number, number>,
  sharedFrom: Map<number, number>,
  landings: Landing[],
  sectioned: Set<number>,
  sepMm = BUNDLE.maxSepMm,
): void {
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
      grid.near(s.p, 1.4 * sepMm, (j, si) => {
        if (hit || j === i || rank0.get(j) === r) return;
        const pj = poly.get(j)!;
        const q = segNearest(s.p, pj[si], pj[si + 1]);
        if (q.d <= 1.4 * sepMm) {
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
    if (accFrac < 0.05 && total >= 30 && !sectioned.has(i)) {
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
      return (
        (nearLanding(a) || atStart) &&
        (nearLanding(b) || atEnd) &&
        (nearLanding(a) || nearLanding(b))
      );
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
    const sizeKeep = sizeParts.reduce(
      (best, x) => (!best || x.b - x.a > best.b - best.a ? x : best),
      null as null | { a: number; b: number },
    );
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
function duplicatesAcrossRanks(
  chains: Chain[],
  rankOf: Map<number, number>,
  n: number,
): [number, number[]][] {
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
      .filter(
        ([j, k]) =>
          k >= 0.9 * smp.length &&
          Math.abs(chains[j].lengthMm - chains[i].lengthMm) < 0.1 * chains[i].lengthMm + 2,
      )
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
