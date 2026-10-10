// PROD RUN — the assembly skeleton on real cards, through THE SAME CHAIN THE TECH CARD WALKS.
// Bundled for node by prod-run.mjs. Not product code; nothing here writes anywhere but the caller's
// output folder.
//
//   card (read DTO) → mapTechCardToForm → DXF pack (patterns × today's BOM scopes, as useCardDxfPack)
//   → parseSheets (the worker's own call) → DXF index (useDxfIndex's memo body, verbatim — a hook
//   cannot run outside React) → pieceBlockRefs + findPiece (as usePieceShapes) → buildSkeletonFacts
//   (category: skeletonCategoryOf over the category chain, as the panel) → DEFAULT_SKELETON_PROVIDER
//   with makeSkeletonDeps(bom, aliases) (as the panel) → metrics, the «apply all accepted» batch
//   through rowFromStep + techCardSchema + assemblySweep, unit pictures of the card's OWN units as
//   CardUnitPicturesProvider reads them (screen: category + cloth; print: no category, no cloth —
//   exactly what assembly-print/page.tsx passes), and the print sheets via typesetRoute/typesetMap.

import { readSeamGraph } from '../../src/lib/assembly-skeleton/pipeline';
import {
  SKELETON,
  type SkeletonProposal,
  type SkeletonStep,
} from '../../src/lib/assembly-skeleton/types';
import { unitLeaves, unitPictures, type UnionPicture } from '../../src/lib/assembly-skeleton/union';
import type { PieceDTO } from '../../src/lib/nesting/types';
import { parseSheets } from '../../src/lib/nesting/worker/parse-files';
import { isDxfUrl } from '../../src/utils/pattern';

import {
  assemblyPrintModel,
  type PrintCardInput,
} from '../../src/components/managers/tech-card/assembly-print/model';
import {
  typesetMap,
  typesetRoute,
  type SheetMeta,
} from '../../src/components/managers/tech-card/assembly-print/paper';
import { paperSvgString } from '../../src/components/managers/tech-card/assembly-print/paper-svg';
import {
  assemblyReleaseCheck,
  assemblySweep,
  classifyAssemblyInputs,
  type AssemblyStep,
} from '../../src/components/managers/tech-card/components/assembly-frontier';
import { makeSkeletonDeps } from '../../src/components/managers/tech-card/components/assembly-skeleton-deps';
import {
  buildSkeletonFacts,
  DEFAULT_SKELETON_PROVIDER,
  skeletonCategoryOf,
  skeletonCategoryRead,
  skeletonGate,
  skeletonLined,
} from '../../src/components/managers/tech-card/components/assembly-skeleton-source';
import { namesIn } from '../../src/lib/assembly-skeleton/skeleton/build-skeleton';
import { orderTemplate } from '../../src/lib/assembly-skeleton/skeleton';
import {
  isJoin,
  pairPicture,
  pieceFamilies,
  readMap,
  type MapRead,
  type MapStep,
} from '../../src/lib/assembly-skeleton/map';
import { SKELETON_AI, skeletonAIRequest } from '../../src/lib/assembly-skeleton/ai';
import { seamSheetOf } from '../../src/components/managers/tech-card/assembly-print/seam-sheet';
import { typesetSeams } from '../../src/components/managers/tech-card/assembly-print/paper';
import { seamWords } from '../../src/components/managers/tech-card/components/assembly-skeleton-panel';
import { replayExisting } from '../../src/lib/assembly-skeleton/skeleton/existing';
import { scopeKeyOfBinding } from '../../src/components/managers/tech-card/components/bom-purpose';
import {
  normBlock,
  sizeTokensOf,
} from '../../src/components/managers/tech-card/components/nesting/block-code';
import {
  defaultContourLayer,
  layerOptions,
} from '../../src/components/managers/tech-card/components/nesting/contour-layer';
import {
  findPiece,
  type DxfBundle,
  type DxfIndex,
  type FoundPiece,
} from '../../src/components/managers/tech-card/components/nesting/dxf-geometry';
import {
  defaultGrainLayer,
  grainLayerOptions,
} from '../../src/components/managers/tech-card/components/nesting/grain';
import { splitPiecesBySize } from '../../src/components/managers/tech-card/components/nesting/split-pieces';
import {
  operationHeading,
  zoneLabel,
} from '../../src/components/managers/tech-card/components/operation-options';
import { BUNDLED_WORK_CATALOG } from '../../src/components/managers/tech-card/components/operation-work';
import { rowFromStep } from '../../src/components/managers/tech-card/components/operations-field';
import {
  pieceBlockRefs,
  pieceRefKey,
  rollGoodsScopes,
} from '../../src/components/managers/tech-card/components/piece-block-refs';
import {
  pieceClothMap,
  type PieceCloth,
} from '../../src/components/managers/tech-card/components/piece-cloth';
import {
  defaultPicks,
  orderClosure,
} from '../../src/components/managers/tech-card/components/assembly-skeleton-ticks';
import {
  mapTechCardToForm,
  techCardSchema,
  toPurposeEnum,
  type TechCardFormData,
} from '../../src/components/managers/tech-card/components/schema';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export type CardInput = {
  code: string;
  source: string;
  /** common_TechCard as the read API returns it (protojson): `{ id, techCard: {...}, ... }`. */
  card: Json;
  /** Leaf first, as useCardCategoryNames builds it. */
  categoryNames: string[];
  /** pattern url → bytes (already downloaded by the runner). */
  files: Record<string, ArrayBuffer>;
  /** Size dictionary id → name (the prod dictionary). */
  sizeNames: Record<string, string>;
};

// ── the DXF chain (usePieceShapes) ─────────────────────────────────────────────────────────────

/** useDxfIndex's useMemo body, verbatim, with useDictionarySizeTokens' body for dictTokens. */
function dxfIndex(bundle: DxfBundle, sizeNames: Record<string, string>): DxfIndex {
  const dictTokens = new Map<string, number[]>();
  for (const [id, name] of Object.entries(sizeNames)) {
    for (const t of sizeTokensOf(name)) {
      const list = dictTokens.get(t) ?? [];
      list.push(Number(id));
      dictTokens.set(t, list);
    }
  }
  const split = splitPiecesBySize(bundle.pieces, dictTokens);
  const contourLayer = defaultContourLayer(layerOptions(bundle.pieces, split.codeById));
  const grainLayer = defaultGrainLayer(grainLayerOptions(bundle.pieces));
  const byKey = new Map<string, Map<string, PieceDTO[]>>();
  const filesOfScope = new Map<string, number[]>();
  for (const [fileIndex, scope] of bundle.scopeByFile) {
    filesOfScope.set(scope, [...(filesOfScope.get(scope) ?? []), fileIndex]);
  }
  for (const p of bundle.pieces) {
    const code = split.codeById.get(p.id);
    const identity = normBlock(code?.identity ?? p.blockName ?? '');
    if (!identity) continue;
    const scope = bundle.scopeByFile.get(p.fileIndex ?? -1) ?? '';
    const key = `${scope}|${identity.toLowerCase()}`;
    const bySize = byKey.get(key) ?? new Map<string, PieceDTO[]>();
    const size = code?.size ?? '';
    bySize.set(size, [...(bySize.get(size) ?? []), p]);
    byKey.set(key, bySize);
  }
  return { split, contourLayer, grainLayer, byKey, filesOfScope };
}

async function quiet<T>(f: () => Promise<T>): Promise<T> {
  const keep = [console.log, console.warn, console.info];
  console.log = console.warn = console.info = () => {};
  try {
    return await f();
  } finally {
    [console.log, console.warn, console.info] = keep;
  }
}

/** useCardDxfPack + the queryFn of dxfGeometryQuery (download → parseSheets) + index + findPiece. */
async function pieceShapes(form: TechCardFormData, input: CardInput) {
  const scopes = rollGoodsScopes((form.bomItems ?? []) as never);
  const pack = (form.patterns ?? [])
    .filter((p) => !!p.url && isDxfUrl(p.url))
    .map((p) => ({
      scopeKey: scopeKeyOfBinding(p.fabricPurpose, p.bomLineKey, scopes),
      name: p.filename || 'pattern.dxf',
      url: p.url!,
    }));
  const fetched: { name: string; bytes: ArrayBuffer }[] = [];
  const scopeByFile = new Map<number, string>();
  const warnings: string[] = [];
  pack.forEach((f) => {
    const b = input.files[f.url];
    if (!b) {
      warnings.push(`not downloaded: ${f.name}`);
      return;
    }
    scopeByFile.set(fetched.length, f.scopeKey);
    fetched.push({ name: f.name, bytes: b });
  });
  const t0 = performance.now();
  const parsed = await quiet(() =>
    parseSheets(
      fetched.map((f) => ({ name: f.name, open: async () => f.bytes })),
      { unit: 'auto', tol: 0.05, tolChain: 0.05 },
    ),
  );
  const parseMs = performance.now() - t0;
  const bundle: DxfBundle = {
    pieces: parsed.pieces,
    scopeByFile,
    warnings: [...warnings, ...parsed.warnings],
  };
  const index = dxfIndex(bundle, input.sizeNames);
  const refsByPiece = pieceBlockRefs((form.pieceDxfAliases ?? []) as never, scopes);
  const shapeByKey = new Map<string, FoundPiece | null>();
  for (const [key, refs] of refsByPiece) shapeByKey.set(key, findPiece(index, refs));
  return { pack, bundle, index, refsByPiece, shapeByKey, parseMs, scopes };
}

/** construction-tab's pieceClothByColorway[0] (first colourway) — null when the card has none. */
function firstColorwayCloth(card: Json, form: TechCardFormData): Map<string, PieceCloth> | null {
  const cw = (card.colorways ?? card.techCard?.colorways ?? [])[0];
  if (!cw) return null;
  const slots = (form.bomItems ?? []).map((l) => ({
    lineKey: l.lineKey ?? '',
    purpose: l.purpose,
    section: l.section,
    materialId: l.materialId,
  }));
  const usages = cw.pieceMaterials ?? cw.pieceUsages ?? cw.usages ?? [];
  return pieceClothMap(slots as never, usages as never, new Map(), new Map());
}

// ── measuring ──────────────────────────────────────────────────────────────────────────────────

/** Join steps → partition per step (the B4 probe's measure: inputs by the pieces they hold). */
function partitions(joins: { name: string; inputs: string[] }[], pieceKeys: Set<string>) {
  const leaves = new Map<string, string[]>();
  return joins.map((j) => {
    const parts = j.inputs.map((k) => (pieceKeys.has(k) ? [k] : leaves.get(k) ?? [`?${k}`]));
    const all = parts.flat();
    leaves.set(j.name, all);
    return {
      name: j.name,
      inputs: j.inputs,
      key: parts
        .map((p) => [...p].sort().join('+'))
        .sort()
        .join(' | '),
      leaves: [...all].sort().join('+'),
      parts,
    };
  });
}

/** Two partitions of one set nest: every part of one lies inside a part of the other or is a union of them. */
function laminar(a: string[][], b: string[][]): boolean {
  const sets = a.map((p) => new Set(p));
  return b.every((part) => {
    const hit = sets.filter((s) => part.some((k) => s.has(k)));
    return hit.length === 1 || hit.every((s) => [...s].every((k) => part.includes(k)));
  });
}

const isDerived = (s: SkeletonStep) => s.derivedFrom != null && s.derivedFrom >= 0;
const isAmbiguous = (s: SkeletonStep) =>
  (s.alternatives?.length ?? 0) > 0 || s.seams.some((c) => (c.ambiguousWith?.length ?? 0) > 0);

function picStats(pics: Map<string, UnionPicture>, leaves: Map<string, string[]>) {
  const units = [...leaves.entries()].filter(([, l]) => l.length > 0);
  const noPic = units.filter(([k]) => !pics.has(k)).map(([k, l]) => `${k}(${l.length})`);
  const overflow = [...pics.entries()].filter(([, p]) => p.overflow.length > 0);
  const overlaps = [...pics.values()].map((p) => p.overlap);
  return {
    units: units.length,
    pictures: pics.size,
    noPicture: noPic,
    overflow: overflow.map(([k, p]) => `${k}: +${p.overflow.length}`),
    underlay: [...pics.values()].filter((p) => p.underlay.length > 0).length,
    maxOverlap: overlaps.length ? Math.max(...overlaps) : 0,
    over15: [...pics.entries()]
      .filter(([, p]) => p.overlap > 0.15)
      .map(([k, p]) => `${k} ${(100 * p.overlap).toFixed(0)}%`),
  };
}

/** ASSEMBLY MAP over one order: STEP coverage, pair pictures, PIECES numbering. */
function mapStats(read: MapRead, nameOf: (k: string) => string) {
  const joins = read.steps.map((_, i) => i).filter((i) => read.steps[i].sews && isJoin(read, i));
  const withEdges = joins.filter((i) => (read.seams[i] ?? []).length > 0);
  let pics = 0;
  let maxOv = 0;
  let oneSided = 0;
  let overflow = 0;
  for (const i of withEdges) {
    const p = pairPicture(read, i);
    if (!p) continue;
    pics++;
    maxOv = Math.max(maxOv, p.overlap);
    if (p.sides.length < 2) oneSided++;
    overflow += p.overflow.length;
  }
  const fams = pieceFamilies(read);
  const members = fams.flatMap((f) => f.members);
  const numbered = fams.reduce(
    (a, f) => a + f.picture.edges.filter((e) => e.steps.length).length,
    0,
  );
  const sewnSteps = new Set(fams.flatMap((f) => f.picture.edges.flatMap((e) => e.steps)));
  return {
    joinIdx: withEdges,
    unreadIdx: joins.filter((i) => !(read.seams[i] ?? []).length),
    machineJoins: joins.length,
    joinsWithEdges: withEdges.length,
    coveragePct: joins.length ? Math.round((100 * withEdges.length) / joins.length) : null,
    unreadJoins: joins
      .filter((i) => !(read.seams[i] ?? []).length)
      .slice(0, 8)
      .map((i) => `${(i + 1) * 10}: ${read.steps[i].inputs.map((k) => nameOf(k)).join(' + ')}`),
    pairPictures: pics,
    pairMaxOverlapPct: +(100 * maxOv).toFixed(1),
    pairOneSided: oneSided,
    pairOverflowPieces: overflow,
    families: fams.length,
    familyNames: fams.map((f) => f.name + (f.tag ? ` ${f.tag}` : '')).join(', '),
    familiesCoverEveryPieceOnce:
      members.length === read.graph.pieces.length && new Set(members).size === members.length,
    numberedEdges: numbered,
    stepsNumberedOnPieces: sewnSteps.size,
  };
}

const sigOfPic = (p: UnionPicture | undefined) =>
  p
    ? `${p.pieceCount}/${p.shapes.length}/${p.w.toFixed(0)}x${p.h.toFixed(0)}/${p.overflow.length}`
    : '-';

/** printInput of assembly-print/page.tsx (module-private there), with the bundled work catalog. */
function printInput(insert: Json): PrintCardInput {
  const pieces = (insert?.pieces ?? [])
    .filter((p: Json) => !!p.lineKey)
    .map((p: Json) => ({ lineKey: p.lineKey!, name: p.name ?? '' }));
  const steps = (insert?.operations ?? []).map((o: Json, i: number) => {
    const zone = zoneLabel(o.zone);
    const heading =
      operationHeading({
        operationType: o.operationType,
        machineType: o.machineType,
        seamClass: o.seamClass,
        work: o.work,
        workCatalog: BUNDLED_WORK_CATALOG,
        zone: o.zone,
        pieceNames: [],
        note: o.note,
      } as never) || 'step';
    const suffix = zone ? ` · ${zone}` : '';
    let verb = heading;
    let zoneCell = '';
    if (zone && heading.endsWith(suffix)) {
      verb = heading.slice(0, -suffix.length);
      zoneCell = zone;
    } else if (zone && heading === zone) {
      verb = '';
      zoneCell = zone;
    }
    return {
      number: o.operationNumber || (i + 1) * 10,
      verb,
      zone: zoneCell,
      inputKeys: (o.inputKeys?.length ? o.inputKeys : o.pieceLineKeys ?? []).filter(Boolean),
      outputUnitKey: (o.outputUnitKey ?? '').trim(),
      outputUnitName: (o.outputUnitName ?? '').trim(),
    };
  });
  return { pieces, steps };
}

/** The panel's default ticks (assembly-skeleton-ticks.ts — the panel's own module, not a copy). */
function defaultTicks(steps: SkeletonStep[]): boolean[] {
  return defaultPicks(steps).map((p) => p.accepted);
}

/** The server's request doors (assembly_skeleton_ai.go), as scripts/assembly-skeleton/ai.mjs restates them. */
function serverRefusal(req: Json): string | null {
  const B = SKELETON_AI as Json;
  const runes = (x: string) => [...(x ?? '')].length;
  if (!req.pieces.length || req.pieces.length > B.maxPieces) return 'pieces count';
  if (!req.steps.length || req.steps.length > B.maxSteps) return 'steps count';
  if (req.seams.length > B.maxSeams) return 'seams count';
  if (req.decisions.length > B.maxDecisions) return 'decisions count';
  const CLOTH = new Set([
    '',
    'main',
    'lining',
    'pocketing',
    'interfacing',
    'insulation',
    'contrast',
    'mesh',
    'other',
  ]);
  const pieces = new Set<string>();
  for (const p of req.pieces) {
    if (!p.key || pieces.has(p.key) || runes(p.key) > B.keyRunes) return `piece key ${p.key}`;
    if (runes(p.name) > B.nameRunes) return `piece name ${p.key}`;
    if (!CLOTH.has(p.cloth)) return `cloth ${p.cloth}`;
    if (!['', 'L', 'R'].includes(p.hand)) return `hand ${p.hand}`;
    if (p.count < 0 || p.count > 20) return `count ${p.count}`;
    pieces.add(p.key);
  }
  for (const x of req.seams) {
    if (!pieces.has(x.a) || !pieces.has(x.b)) return `seam ${x.a}/${x.b}`;
    if (!(x.score >= 0 && x.score <= 1)) return `seam score ${x.score}`;
    if (!['edge', 'partial', 'composite', 'surface', 'closure'].includes(x.kind))
      return `seam kind ${x.kind}`;
    if (runes(x.evidence) > B.evidenceRunes) return 'seam evidence';
  }
  const inputsOk = (ins: string[]) =>
    ins.length >= 1 && ins.length <= B.maxInputs && ins.every((k) => k && runes(k) <= B.keyRunes);
  const decisions = new Set<string>();
  for (const d of req.decisions) {
    if (!d.id || decisions.has(d.id)) return `decision ${d.id}`;
    if (d.readings.length < 2 || d.readings.length > B.maxReadings) return `readings of ${d.id}`;
    if (d.chosen < 0 || d.chosen >= d.readings.length) return `chosen of ${d.id}`;
    if (!d.readings.every((r: Json) => inputsOk(r.inputs) && runes(r.reason) <= B.reasonRunes))
      return `reading of ${d.id}`;
    decisions.add(d.id);
  }
  const ids = new Map<string, number>();
  const units = new Set<string>();
  for (const [i, x] of (req.steps as Json[]).entries()) {
    if (ids.has(x.id)) return `step id ${x.id} twice`;
    ids.set(x.id, i);
  }
  let ordered = 0;
  for (const [i, x] of (req.steps as Json[]).entries()) {
    if (!['MACHINE', 'PRESS', 'PRESS_OPEN', 'FUSING', 'HANDWORK'].includes(x.operation))
      return `operation ${x.operation}`;
    if (x.outputUnit && (units.has(x.outputUnit) || pieces.has(x.outputUnit)))
      return `unit ${x.outputUnit}`;
    if (x.outputUnit) units.add(x.outputUnit);
    if (x.decisionId && !decisions.has(x.decisionId)) return `decision of ${x.id}`;
    if (!inputsOk(x.inputs)) return `inputs of ${x.id}`;
    if (runes(x.label) > B.labelRunes || runes(x.outputName) > B.nameRunes)
      return `words of ${x.id}`;
    if (x.follows) {
      const j = ids.get(x.follows);
      if (j == null || j >= i) return `${x.id} follows ${x.follows}`;
    } else ordered++;
  }
  if (!ordered) return 'no ordered step';
  return JSON.stringify(req).length >= 128 * 1024 ? 'over 128 KiB' : null;
}

// ── one card ───────────────────────────────────────────────────────────────────────────────────

export async function runCard(input: CardInput) {
  const out: Json = { code: input.code, source: input.source, errors: [] as string[] };
  const T0 = performance.now();
  const insert = input.card.techCard ?? {};
  const form = mapTechCardToForm(input.card as never);
  const formPieces = (form.pieces ?? []) as TechCardFormData['pieces'];
  out.piecesInCard = formPieces.length;
  out.dxf = (form.patterns ?? []).map((p) => ({
    file: p.filename,
    purpose: (p.fabricPurpose ?? '').replace('TECH_CARD_BOM_PURPOSE_', ''),
    bom: (form.bomItems ?? []).find((b) => b.lineKey === p.bomLineKey)?.name ?? '(no BOM line)',
  }));

  // 1. contours
  const S = await pieceShapes(form, input);
  out.parseMs = Math.round(S.parseMs);
  out.dxfWarnings = S.bundle.warnings.slice(0, 8);
  out.scopes = S.pack.map((p) => `${p.name} → scope «${p.scopeKey}»`);
  out.blocksInFiles = new Set([...S.index.byKey.keys()]).size;
  const unmatched: string[] = [];
  for (const p of formPieces) {
    const key = (p.lineKey ?? '').trim();
    const refs = S.refsByPiece.get(pieceRefKey(key));
    if (!refs?.length) unmatched.push(`${p.name}: no block alias`);
    else if (!S.shapeByKey.get(pieceRefKey(key)))
      unmatched.push(
        `${p.name}: alias ${refs.map((r) => `«${r.block}»@${r.scopeKey || '∅'}`).join(',')} not in the files`,
      );
  }
  out.matched = [...S.shapeByKey.values()].filter(Boolean).length;
  out.unmatched = unmatched;
  // aliases pointing at pieces the card does not have
  out.orphanAliases = (form.pieceDxfAliases ?? []).filter(
    (a) =>
      !formPieces.some((p) => pieceRefKey(p.lineKey ?? '') === pieceRefKey(a.pieceLineKey ?? '')),
  ).length;

  // 2. facts as the panel builds them
  const cloth = firstColorwayCloth(input.card, form);
  // as the panel: lining from cloth, lining-scoped links / files, or names
  const hasLining = skeletonLined({
    cloth,
    pieces: formPieces,
    aliases: (form.pieceDxfAliases ?? []) as never,
    patterns: (form.patterns ?? []) as never,
    bomLines: (form.bomItems ?? []) as never,
  });
  const categoryRead = skeletonCategoryRead({
    categoryNames: input.categoryNames,
    hasLining,
    pieceNames: formPieces.map((p) => p.name ?? ''),
    purpose: toPurposeEnum((input.card as Json)?.techCard?.purpose),
  });
  const category = categoryRead.category;
  out.categoryRead = categoryRead;
  out.gate = skeletonGate({
    frozen: false,
    hasDxf: S.pack.length > 0,
    shapes: S.shapeByKey,
    available: true,
    parsedPieces: S.bundle.pieces.length,
    namedBlocks: S.index.byKey.size,
  });
  out.categoryChain = input.categoryNames.join(' < ');
  out.category = category;
  out.cloth = cloth
    ? `${cloth.size} pieces, ${[...new Set([...cloth.values()].map((c) => c.state))].join('/')}`
    : 'none (no colourway)';
  const park = form.construction?.equipmentDefaults;
  const built = buildSkeletonFacts({
    pieces: formPieces,
    shapes: S.shapeByKey,
    cloth,
    bomLines: (form.bomItems ?? []) as never,
    category,
    defaultMachineType:
      (park?.machines ?? []).find(
        (m) => m.machineType && m.machineType !== 'TECH_CARD_MACHINE_TYPE_UNKNOWN',
      )?.machineType ?? null,
    aliases: (form.pieceDxfAliases ?? []) as never,
  });
  out.withoutContour = built.withoutContour.length;
  out.withoutKey = built.withoutKey.length;
  const deps = makeSkeletonDeps({
    bomLines: (form.bomItems ?? []) as never,
    aliases: (form.pieceDxfAliases ?? []) as never,
  });

  // 3. the proposal
  let proposal: SkeletonProposal | null = null;
  const t1 = performance.now();
  try {
    proposal = await DEFAULT_SKELETON_PROVIDER!(built.facts, deps);
  } catch (e) {
    out.errors.push(`proposal threw: ${(e as Error).stack?.split('\n').slice(0, 6).join(' | ')}`);
  }
  out.proposalMs = Math.round(performance.now() - t1);
  const pieceKeys = new Set(formPieces.map((p) => p.lineKey ?? '').filter(Boolean));
  const nameOfPiece = new Map(formPieces.map((p) => [p.lineKey ?? '', p.name ?? '']));
  const existingOps = (form.operations ?? []) as NonNullable<TechCardFormData['operations']>;
  out.existingSteps = existingOps.length;
  out.existingUnits = existingOps.filter((o) => (o.outputUnitKey ?? '').trim()).length;

  // APPEND MODE as the panel reads it: the card's steps as `existing`, the skeleton over what they
  // did not consume — or the honest «every piece is already in the order».
  const sweepPiecesA = formPieces.map((p) => ({ lineKey: p.lineKey ?? '', name: p.name ?? '' }));
  const asStep = (inputs: string[], k: string, n: string): AssemblyStep => ({
    inputs: classifyAssemblyInputs(pieceKeys, inputs),
    outputUnitKey: k,
    outputUnitName: n,
  });
  const cardSteps = existingOps.map((o) =>
    asStep(
      (o.inputKeys ?? []).filter(Boolean),
      (o.outputUnitKey ?? '').trim(),
      (o.outputUnitName ?? '').trim(),
    ),
  );
  const appendRuns: Json[] = [];
  // the card as it is, and the card cut after its first k steps (an order in progress)
  const cuts = existingOps.length
    ? [existingOps.length, Math.floor(existingOps.length / 2), 10]
    : [];
  for (const k of [...new Set(cuts)].filter((x) => x > 0)) {
    const before = cardSteps.slice(0, k);
    const consumed = replayExisting({ steps: before }, pieceKeys).consumed;
    const open = built.facts.pieces.filter((p) => !consumed.has(p.pieceKey)).length;
    const r: Json = { stepsKept: k, openPieces: open };
    if (open === 0) {
      r.message = 'every piece is already in the order — replace to start over';
    } else {
      const ap = await DEFAULT_SKELETON_PROVIDER!(
        { ...built.facts, existing: { steps: before } },
        deps,
      );
      const ticks = defaultTicks(ap.steps);
      const batchA = ap.steps
        .filter((_, i) => ticks[i])
        .map((s) => asStep(s.inputs, s.outputUnitKey, s.outputUnitName));
      const res = assemblySweep(sweepPiecesA, [...before, ...batchA]);
      const hard = res.violations.filter((v) => v.rule !== 4 && v.step >= before.length);
      const rel = assemblyReleaseCheck(sweepPiecesA, [...before, ...batchA], res);
      r.steps = ap.steps.length;
      r.batch = batchA.length;
      r.hard = hard.length;
      r.sample = hard.slice(0, 3).map((v) => namesIn(v.message, nameOfPiece));
      r.release = rel.map((v) => namesIn(v.message, nameOfPiece));
      r.engineBroken = ap.warnings.filter((w) => /^rule \d+ broken/.test(w));
      r.usesCardUnits = ap.steps.filter((s) =>
        s.inputs.some((x) => !pieceKeys.has(x) && !ap.steps.some((t) => t.outputUnitKey === x)),
      ).length;
      r.stepList = ap.steps.map(
        (s) =>
          `${s.label}: ${s.inputs.map((x) => nameOfPiece.get(x) || `[${x}]`).join(' + ')}${s.outputUnitKey ? ` → ${s.outputUnitKey}` : ''}`,
      );
    }
    appendRuns.push(r);
  }
  out.append = appendRuns;

  if (proposal) {
    const g = proposal.graph!;
    const steps = proposal.steps;
    out.template = proposal.template;
    out.seams = {
      chosen: g.chosen.length,
      composite: g.chosen.filter((c) => c.kind === 'composite').length,
      ambiguous: g.chosen.filter((c) => (c.ambiguousWith?.length ?? 0) > 0).length,
      rejected: g.rejected.length,
      components: g.components.length,
    };
    out.steps = steps.length;
    out.units = steps.filter((s) => s.outputUnitKey).length;
    out.riders = steps.filter(isDerived).length;
    out.toDecide = steps.filter(
      (s) => !isDerived(s) && (isAmbiguous(s) || s.confidence < SKELETON.accept),
    ).length;
    out.decisions = steps.filter((s) => s.decision).length;
    out.guessesUnticked = steps.filter((s) => s.confidence < SKELETON.accept).length;
    out.unresolvedEdgePairs = proposal.unresolved.length;
    const used = new Set(steps.flatMap((s) => s.inputs));
    out.leftOut = built.facts.pieces.filter((p) => !used.has(p.pieceKey)).map((p) => p.name);
    // Does the proposal finish ONE garment? Every card piece should land in the one terminal unit
    // (or be named as left out with a reason in the warnings).
    {
      const leavesOf = new Map<string, string[]>();
      const consumed = new Set<string>();
      for (const s of steps) {
        if (!s.outputUnitKey) continue;
        const ls = s.inputs.flatMap((k) => leavesOf.get(k) ?? [k]);
        s.inputs.forEach((k) => consumed.add(k));
        leavesOf.set(s.outputUnitKey, [...new Set(ls)]);
      }
      const terminals = [...leavesOf.keys()].filter((k) => !consumed.has(k));
      const inTerminal = new Set(terminals.length === 1 ? leavesOf.get(terminals[0]) : []);
      const outside = built.facts.pieces
        .filter((p) => p.pieceKey && !inTerminal.has(p.pieceKey))
        .map((p) => p.name);
      const said = outside.filter((n) => proposal.warnings.some((w) => w.includes(n)));
      out.terminal = {
        units: terminals.length,
        pieces: built.facts.pieces.filter((p) => p.pieceKey).length,
        inTerminal: inTerminal.size,
        outside,
        outsideUnsaid: outside.filter((n) => !said.includes(n)),
      };
    }
    out.warnings = proposal.warnings;
    out.engineRuleBroken = proposal.warnings.filter((w) => /^rule \d+ broken/.test(w));
    const sources = steps.reduce<Record<string, number>>(
      (a, s) => ({ ...a, [s.source]: (a[s.source] ?? 0) + 1 }),
      {},
    );
    out.sources = sources;
    out.stepList = steps.map((s, i) => {
      const ins = s.inputs.map((k) => nameOfPiece.get(k) || `[${k}]`).join(' + ');
      return `${String(i + 1).padStart(2)} ${s.operationType.padEnd(9)} ${s.confidence.toFixed(2)} ${s.source.padEnd(8)}${isDerived(s) ? ` ↳${s.derivedFrom! + 1}` : ''}${s.decision ? ` ?${(s.alternatives?.length ?? 0) + 1}` : ''} ${s.label ?? ''}: ${ins}${s.outputUnitKey ? ` → ${s.outputUnitKey} «${s.outputUnitName}»` : ''}`;
    });

    // 4. what «apply all accepted» would WRITE (default ticks, press-open shown): rows through
    //    rowFromStep, the form through techCardSchema, the order through assemblySweep —
    //    appended after the technologist's steps (the default mode) and as a replace.
    const ctx = { machines: park?.machines ?? [], presses: park?.presses ?? [] };
    const ticks = defaultTicks(steps);
    const batch = steps.filter((_, i) => ticks[i]);
    // and the naive batch (every step ≥ accept) — what «tick everything sure» would give
    out.batchNaive = steps.filter((s) => s.confidence >= SKELETON.accept).length;
    out.batch = batch.length;
    const sweepPieces = formPieces.map((p) => ({ lineKey: p.lineKey ?? '', name: p.name ?? '' }));
    const asA = (inputs: string[], k: string, n: string): AssemblyStep => ({
      inputs: classifyAssemblyInputs(pieceKeys, inputs),
      outputUnitKey: k,
      outputUnitName: n,
    });
    const formSteps = existingOps.map((o) =>
      asA(
        (o.inputKeys ?? []).filter(Boolean),
        (o.outputUnitKey ?? '').trim(),
        (o.outputUnitName ?? '').trim(),
      ),
    );
    const batchA = batch.map((s) => asA(s.inputs, s.outputUnitKey, s.outputUnitName));
    for (const [mode, before] of [
      ['replace', [] as AssemblyStep[]],
      // the OLD panel's append: the whole-pattern proposal after the card's steps (kept to show the
      // difference; the real append mode is out.append)
      ['appendNaive', formSteps],
    ] as const) {
      const all = [...before, ...batchA];
      const res = assemblySweep(sweepPieces, all);
      const hard = res.violations.filter((v) => v.rule !== 4 && v.step >= before.length);
      const rel = assemblyReleaseCheck(sweepPieces, all, res);
      out[`sweep_${mode}`] = {
        hard: hard.length,
        rules: [...new Set(hard.map((v) => v.rule))],
        sample: hard.slice(0, 3).map((v) => `r${v.rule} step ${v.step + 1}: ${v.message}`),
        release: rel.length,
        releaseSample: rel.slice(0, 2).map((v) => v.message),
      };
    }
    // F8: do the default ticks reach one finished garment, and does the proposal (every join)?
    {
      const all = steps.map((s) => asA(s.inputs, s.outputUnitKey, s.outputUnitName));
      const relAll = assemblyReleaseCheck(sweepPieces, all, assemblySweep(sweepPieces, all));
      const picks = defaultPicks(steps);
      const closure = orderClosure(steps);
      out.ticks = {
        reachOne: steps.length > 0 && (out.sweep_replace as Json).release === 0,
        proposalReachesOne: steps.length > 0 && relAll.length === 0,
        proposalEnds: closure.ends.length,
        closing: picks.filter((p, i) => p.closing && !isDerived(steps[i])).length,
        deciding: closure.openDecisions.length,
        proposalRelease: relAll.slice(0, 2).map((v) => namesIn(v.message, nameOfPiece)),
      };
    }
    // the technologist's own order, for reference (is the card itself clean?)
    {
      const res = assemblySweep(sweepPieces, formSteps);
      out.sweep_existing = res.violations.filter((v) => v.rule !== 4).length;
    }
    try {
      const rows = batch.map((s) => rowFromStep(s, ctx as never));
      const machineless = rows.filter(
        (r) => r.operationType === 'TECH_CARD_OPERATION_TYPE_MACHINE' && !r.machineType,
      ).length;
      const zoneUnknown = rows.filter((r) => !r.zone || /UNKNOWN/.test(r.zone)).length;
      const zodOf = (ops: unknown[]) => {
        const r = techCardSchema.safeParse({ ...form, operations: ops });
        if (r.success) return { ops: 0, other: 0, sample: [] as string[] };
        const iss = r.error.issues;
        const o = iss.filter((i) => i.path[0] === 'operations');
        return {
          ops: o.length,
          other: iss.length - o.length,
          sample: o.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`),
        };
      };
      const before = zodOf(existingOps);
      const rep = zodOf(rows);
      const app = zodOf([...existingOps, ...rows]);
      out.write = {
        rows: rows.length,
        machineless,
        zoneUnknown,
        zodBaselineOps: before.ops,
        zodReplaceOps: rep.ops,
        zodAppendOps: app.ops,
        zodSample: rep.sample.length ? rep.sample : app.sample,
      };
    } catch (e) {
      out.errors.push(`rowFromStep/zod threw: ${(e as Error).message}`);
    }

    // 5. the technologist's truth (cards that already carry units)
    const truthJoins = existingOps
      .filter((o) => (o.outputUnitKey ?? '').trim())
      .map((o) => ({
        name: (o.outputUnitKey ?? '').trim(),
        inputs: (o.inputKeys ?? []).filter(Boolean),
      }));
    if (truthJoins.length) {
      const truth = partitions(truthJoins, pieceKeys);
      const ours = partitions(
        steps
          .filter((s) => s.outputUnitKey)
          .map((s) => ({ name: s.outputUnitKey, inputs: s.inputs })),
        pieceKeys,
      );
      const byInputs = new Set(ours.map((o) => o.key));
      const byLeaves = new Set(ours.map((o) => o.leaves));
      const word = (leaves: string) =>
        leaves
          .split('+')
          .map((k) => nameOfPiece.get(k) || k)
          .join('+');
      out.compare = {
        technologistJoins: truth.length,
        ourJoins: ours.length,
        byInputs: truth.filter((t) => byInputs.has(t.key)).length,
        byContents: truth.filter((t) => byLeaves.has(t.leaves)).length,
        // 05-PROD-DIAGNOSIS §2: a technologist join counts when one of our joins has the same
        // pieces AND its inputs are compatible with theirs (each of our inputs lies inside one of
        // theirs or is a union of theirs) — one tree refines the other there, so granularity
        // (three in one step vs two steps) is an alternative, a different grouping is an error.
        treeRefinement: truth.filter((t) =>
          ours.some((o) => o.leaves === t.leaves && laminar(t.parts, o.parts)),
        ).length,
        mismatches: truth
          .filter((t) => !byInputs.has(t.key))
          .map((t) => {
            const near = ours.find((o) => o.leaves === t.leaves);
            const tw = t.parts.map((p) => word(p.sort().join('+'))).join(' | ');
            return near
              ? `${t.name}: same pieces, other grouping — tech {${tw}} vs ours {${near.parts.map((p) => word(p.sort().join('+'))).join(' | ')}}`
              : `${t.name}: {${tw}} — not made by any of our joins`;
          }),
      };
      // order: the rank of reproduced joins in ours vs the technologist's
      const ourRank = new Map(ours.map((o, i) => [o.key, i]));
      const hits = truth.filter((t) => ourRank.has(t.key)).map((t) => ourRank.get(t.key)!);
      let inv = 0;
      for (let i = 0; i < hits.length; i++)
        for (let j = i + 1; j < hits.length; j++) if (hits[i] > hits[j]) inv++;
      out.compare.orderInversions = `${inv} of ${(hits.length * (hits.length - 1)) / 2} pairs`;
    }
  }

  // 6. unit pictures of the card's OWN units (CardUnitPicturesProvider): screen and print readers
  const unitSteps = existingOps.map((o) => ({
    inputs: (o.inputKeys ?? []).filter(Boolean),
    outputUnitKey: (o.outputUnitKey ?? '').trim(),
  }));
  let screenPics = new Map<string, UnionPicture>();
  let printPics = new Map<string, UnionPicture>();
  if (unitSteps.some((s) => s.outputUnitKey) && built.facts.pieces.length > 0) {
    const t2 = performance.now();
    try {
      const gScreen = readSeamGraph(built.facts);
      screenPics = unitPictures(gScreen, unitSteps);
      out.picturesMs = Math.round(performance.now() - t2);
      // print: PrintUnitPictures now feeds the SAME cloth (first colourway) and category chain
      const printFacts = buildSkeletonFacts({
        pieces: formPieces,
        shapes: S.shapeByKey,
        cloth,
        bomLines: (form.bomItems ?? []) as never,
        category,
        defaultMachineType: null,
        aliases: (form.pieceDxfAliases ?? []) as never,
      }).facts;
      printPics = unitPictures(readSeamGraph(printFacts), unitSteps);
    } catch (e) {
      out.errors.push(
        `unit pictures threw: ${(e as Error).stack?.split('\n').slice(0, 5).join(' | ')}`,
      );
    }
    const leaves = unitLeaves(unitSteps, (k) => built.facts.pieces.some((p) => p.pieceKey === k));
    out.pictures = picStats(screenPics, leaves);
    const keys = new Set([...screenPics.keys(), ...printPics.keys()]);
    out.printDiffers = [...keys]
      .filter((k) => sigOfPic(screenPics.get(k)) !== sigOfPic(printPics.get(k)))
      .map(
        (k) => `${k}: screen ${sigOfPic(screenPics.get(k))} vs print ${sigOfPic(printPics.get(k))}`,
      );
    out.pictureDetail = [...screenPics.entries()].map(
      ([k, p]) =>
        `${k}: ${p.pieceCount} pcs, ${p.shapes.length} shapes, ${p.w.toFixed(0)}×${p.h.toFixed(0)} mm, overlap ${(100 * p.overlap).toFixed(1)}%${p.overflow.length ? `, overflow ${p.overflow.length}` : ''}${p.underlay.length ? `, underlay ${p.underlay.length}` : ''}`,
    );
  }

  // 7. print sheets (assembly-print/page.tsx Document): route and map, shapes on, unionOf from the
  //    print reader's pictures
  let print: { route: string; map: string; report: Json; seams?: string } | null = null;
  if ((insert.operations ?? []).length) {
    try {
      const M = assemblyPrintModel(printInput(insert));
      const meta: SheetMeta = {
        code: insert.styleNumber ?? input.code,
        name: insert.name ?? '',
        season: '',
        revision: '',
        unreleased: true,
        warnings: [],
        printedOn: '2026-10-10',
      };
      const shapeOf = (k: string) => S.shapeByKey.get(pieceRefKey(k))?.piece ?? null;
      const unionOf = printPics.size ? (k: string) => printPics.get(k) ?? null : null;
      const route = typesetRoute(M, meta, shapeOf, unionOf);
      const map = typesetMap(M, meta, shapeOf, unionOf);
      print = {
        route: paperSvgString(route),
        map: paperSvgString(map),
        report: { route: route.report, map: map.report },
      };
      out.print = {
        route: `${route.w.toFixed(0)}×${route.h.toFixed(0)} mm`,
        map: `${map.w.toFixed(0)}×${map.h.toFixed(0)} mm`,
        unionTiles: printPics.size,
        violations: M.violations?.length ?? 0,
      };
    } catch (e) {
      out.errors.push(`print threw: ${(e as Error).stack?.split('\n').slice(0, 5).join(' | ')}`);
    }
  }
  // 8. ASSEMBLY MAP (STEP + PIECES) over the card's own order (use-map-model: the form's ops, the
  //    card seam graph) and over the proposal; the print SEAM MAP (seam-sheet.ts + typesetSeams);
  //    the AI request (the panel's useMemo) against the server's doors — no call is made.
  let seams: string | null = null;
  try {
    const t3 = performance.now();
    const graph = built.facts.pieces.length ? readSeamGraph(built.facts) : null;
    const nameOf = (k: string) => nameOfPiece.get(k) || `[${k}]`;
    if (graph) {
      const cardSteps: MapStep[] = existingOps.map((o) => ({
        inputs: (o.inputKeys ?? []).filter(Boolean),
        outputUnitKey: (o.outputUnitKey ?? '').trim(),
        sews: o.operationType === 'TECH_CARD_OPERATION_TYPE_MACHINE',
      }));
      if (cardSteps.length) out.mapCard = mapStats(readMap(graph, cardSteps), nameOf);
      if (proposal) {
        const pSteps: MapStep[] = proposal.steps.map((s) => ({
          inputs: s.inputs,
          outputUnitKey: s.outputUnitKey,
          sews: s.operationType === 'MACHINE',
          seams: s.seams,
        }));
        out.mapProposal = mapStats(readMap(proposal.graph ?? graph, pSteps), nameOf);
      }
      out.mapMs = Math.round(performance.now() - t3);
    }
    if ((insert.operations ?? []).length) {
      const M = assemblyPrintModel(printInput(insert));
      const sheet = seamSheetOf(
        graph,
        existingOps.map((o) => ({
          ...(o as Json),
          inputKeys: o.inputKeys ?? [],
          outputUnitKey: o.outputUnitKey ?? '',
          sews: o.operationType === 'TECH_CARD_OPERATION_TYPE_MACHINE',
        })) as never,
        M,
        {
          defaultSeamClass: form.construction?.defaultSeamClass,
          machines: form.construction?.equipmentDefaults?.machines ?? [],
        } as never,
      );
      const doc = typesetSeams(
        M,
        {
          code: insert.styleNumber ?? input.code,
          name: insert.name ?? '',
          season: '',
          revision: '',
          unreleased: true,
          warnings: [],
          printedOn: '2026-10-10',
        },
        sheet,
      );
      seams = paperSvgString(doc);
      const A1 = { w: 841, h: 594 };
      out.seamSheet = {
        size: `${doc.w.toFixed(0)}×${doc.h.toFixed(0)} mm`,
        families: sheet?.families.length ?? 0,
        keyRows: sheet?.key.length ?? 0,
        unreadKeyRows: sheet?.key.filter((k) => k.unread).length ?? 0,
        legendRows: sheet?.legend.length ?? 0,
        // the largest sheet is A1; landing on it with more height than A1 = it did not fit
        fits: !(doc.w >= A1.w && doc.h > A1.h + 0.01),
        overWidth: doc.report.overWidth,
      };
    }
    if (proposal) {
      const r = skeletonAIRequest({
        proposal,
        facts: built.facts,
        templateStages: orderTemplate(built.facts.category).stages.map((st) => st.label),
        seamWords,
        techCardId: 1,
      });
      if (!r.ok) out.ai = { ok: false, why: r.why };
      else {
        const req = r.request as Json;
        out.ai = {
          ok: true,
          pieces: req.pieces.length,
          steps: req.steps.length,
          ordered: req.steps.filter((s: Json) => !s.follows).length,
          seams: req.seams.length,
          decisions: req.decisions.length,
          bytes: JSON.stringify(req).length,
          serverRefusal: serverRefusal(req),
        };
      }
    }
  } catch (e) {
    out.errors.push(
      `map/seams/ai threw: ${(e as Error).stack?.split('\n').slice(0, 6).join(' | ')}`,
    );
  }
  if (print && seams) (print as Json).seams = seams;
  else if (seams) print = { route: '', map: '', report: {}, seams } as never;
  out.totalMs = Math.round(performance.now() - T0);

  // the stand needs the form and the contour map as the card would hold them
  const stand = {
    code: input.code,
    form,
    categoryNames: input.categoryNames,
    shapes: [...S.shapeByKey.entries()],
    cloth: cloth ? [...cloth.entries()] : null,
    mapPick: out.mapCard ? { withEdges: out.mapCard.joinIdx, unread: out.mapCard.unreadIdx } : null,
  };
  // indexes are for the UI stand only; the report keeps counts
  for (const k of ['mapCard', 'mapProposal']) {
    if (out[k]) {
      delete out[k].joinIdx;
      delete out[k].unreadIdx;
    }
  }
  return { report: out, stand, print, proposal };
}

// ── a corpus DXF as a card (no prod card behind it): one piece per block identity ──────────────

export async function synthCard(
  name: string,
  bytes: ArrayBuffer,
  sizeNames: Record<string, string>,
  categoryNames: string[],
): Promise<CardInput> {
  const parsed = await quiet(() =>
    parseSheets([{ name, open: async () => bytes }], { unit: 'auto', tol: 0.05, tolChain: 0.05 }),
  );
  const index = dxfIndex(
    { pieces: parsed.pieces, scopeByFile: new Map([[0, '']]), warnings: [] },
    sizeNames,
  );
  const ids = [...new Set([...index.byKey.keys()].map((k) => k.split('|')[1]))];
  // the identity in the file's own spelling
  const spell = new Map<string, string>();
  for (const p of parsed.pieces) {
    const code = index.split.codeById.get(p.id);
    const id = normBlock(code?.identity ?? p.blockName ?? '');
    if (id) spell.set(id.toLowerCase(), id);
  }
  const url = `https://files.example.invalid/${encodeURIComponent(name)}`;
  const FAB = 'SYNTH_FABRIC_LINE';
  const pieces = ids.map((i) => ({
    lineKey: spell.get(i) ?? i,
    name: spell.get(i) ?? i,
    piecesPerGarment: 1,
    cutSymmetry: 'TECH_CARD_PIECE_CUT_SYMMETRY_IDENTICAL',
  }));
  return {
    code: name.replace(/\.dxf$/i, ''),
    source: 'corpus DXF (synthetic card: one piece per block, aliases = block names)',
    card: {
      id: 0,
      techCard: {
        styleNumber: name.replace(/\.dxf$/i, ''),
        name,
        bomItems: [
          {
            section: 'TECH_CARD_BOM_SECTION_FABRIC',
            name: 'main fabric',
            lineKey: FAB,
            purpose: 'TECH_CARD_BOM_PURPOSE_UNSET',
            kind: 'TECH_CARD_BOM_KIND_UNSET',
            unit: 'm',
          },
        ],
        patterns: [
          { filename: name, url, bomLineKey: FAB, fabricPurpose: 'TECH_CARD_BOM_PURPOSE_UNSET' },
        ],
        pieces,
        pieceDxfAliases: {
          items: pieces.map((p) => ({
            bomLineKey: FAB,
            blockName: p.name,
            pieceLineKey: p.lineKey,
          })),
        },
        operations: [],
        construction: { equipmentDefaults: { machines: [], presses: [] } },
      },
    },
    categoryNames,
    files: { [url]: bytes },
    sizeNames,
  };
}

export { skeletonCategoryOf };
