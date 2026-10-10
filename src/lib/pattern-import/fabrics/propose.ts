// proposeFabrics — which fabric(s) each piece is cut from, and which card scope each fabric goes to
// (owner decision 13: «если в выкройке более одной ткани, например подклад — чтобы оно тоже это
// понимало»). Evidence, strongest first:
//
//   1. a LABEL inside the piece («ПОДКЛАДКА», «Futter», «Einlage», «рибана») — lining / rib /
//      pocketing / insulation / contrast / mesh labels make the piece THAT cloth only; an
//      interfacing label ADDS interlining (the shell piece is fused, it is not cut from interlining
//      instead of the shell);
//   2. the piece's NAME says lining (`LIN_…`, from the names step) — lining only;
//   3. the CUT LAYOUT of the instructions (layout.ts): the piece's printed number in a fabric's list.
//      Interlining lists add; any other secondary list makes the piece that cloth only UNLESS the
//      number is also in a main list (r4454: back, front and sleeve are in the shell list AND the
//      lining list → both files);
//   4. the AI's `fabrics` for the piece (F10 suggestion), only where the sheet itself is silent, only
//      for an AI name auto-accepted at T (C7: `aiFabricHintsOf`) and never below T; a cloth other
//      than main decided by the AI alone waits for the operator (`aiOnly[].needsConfirm`);
//   5. nothing said → the main fabric (confidence 0.6, the operator sees it).
//
// Each fabric is then mapped to a live card scope (`scope.ts scopeFor`). Interlining without a BOM
// line is not refused: its seeds are the `fused` proposal (decision 14). Any other fabric without a
// scope is REFUSED with a reason — its seeds stay visible and block the step until the operator
// ticks another fabric or adds the BOM line.

import type {
  NameDecision,
  DraftScopeTarget,
  FabricAssignment,
  FabricEvidence,
  FabricProposal,
  IRText,
  PieceFamily,
  ProposeFabricsFn,
  Seed,
  SeedId,
  FabricPurposeKey,
} from '../types';
import { AI_AUTO_ACCEPT_T } from '../ai/threshold';
import { codeWordsOf } from '../manifest/identity';
import { type CutList, linesOf, pieceNumberText, readCutLists } from './layout';
import { type FabricKind, fabricKindsIn, hasFuseVerb } from './lexicon';
import { KIND_OF_PURPOSE, PURPOSE_OF_KIND, isInterliningScope, scopeFor } from './scope';

export type FabricHint = { seed: SeedId; fabrics: FabricPurposeKey[]; confidence: number };

/**
 * C7: the AI fabric calls the proposal may use — the same bar as an auto-accepted NAME: the model's
 * answer (not the sheet text's), combined confidence ≥ T, and the combiner's evidence gates passed
 * (`autoAccepted`: text backs the code, unique, grammar, no bare collision). A piece whose name the
 * operator typed has no AI fabric: the call was made for the AI's name, not theirs.
 */
export function aiFabricHintsOf(
  names: readonly NameDecision[],
  editedNames: readonly SeedId[],
  threshold: number = AI_AUTO_ACCEPT_T,
): FabricHint[] {
  const edited = new Set(editedNames);
  return names.flatMap((n) =>
    n.source === 'ai' &&
    n.autoAccepted &&
    n.confidence >= threshold &&
    !edited.has(n.seed) &&
    n.suggestion?.fabrics.length
      ? [{ seed: n.seed, fabrics: n.suggestion.fabrics, confidence: n.confidence }]
      : [],
  );
}

export type ProposeFabricsInput = {
  /** Sheet texts (labels inside pieces and any layout printed on the sheet itself). */
  texts: readonly IRText[];
  families: readonly PieceFamily[];
  seeds?: readonly Seed[];
  bom: readonly DraftScopeTarget[];
  /** Text of the pages that are NOT the sheet (instructions, cover, overview): the cut layouts. */
  pageTexts?: readonly IRText[];
  /** F10 suggestions (`PieceSuggestion.fabrics`) per seed, with the combined name confidence. */
  aiHints?: readonly FabricHint[];
  /** The identity each seed is written as (semantics), for the `LIN_` name rule. */
  identities?: readonly { seed: SeedId; identity: string }[];
};

export type SeedFabrics = {
  seed: SeedId;
  number: string | null;
  kinds: FabricKind[];
  confidence: number;
  why: string[];
  evidence: FabricEvidence[];
  /** C7: the kinds came from the AI alone (the sheet was silent). */
  aiOnly: boolean;
};

export type ProposeFabricsDetail = {
  assignment: FabricAssignment;
  perSeed: SeedFabrics[];
  lists: CutList[];
};

const SECONDARY_EXCLUSIVE: ReadonlySet<FabricKind> = new Set([
  'lining',
  'rib',
  'pocketing',
  'insulation',
  'contrast',
  'mesh',
]);

const pageKey = (t: IRText) => `${t.src.file}:${String(t.src.page).padStart(4, '0')}`;

export function proposeFabricsDetailed(input: ProposeFabricsInput): ProposeFabricsDetail {
  const textById = new Map(input.texts.map((t) => [t.id, t]));
  const seedById = new Map((input.seeds ?? []).map((s) => [s.id, s]));
  const insidePiece = new Set<number>();
  for (const f of input.families)
    for (const c of f.candidates) for (const id of c.textsInside) insidePiece.add(id);

  // ── cut layouts: instruction pages + whatever the sheet prints outside the pieces ────────
  const layoutTexts = [
    ...(input.pageTexts ?? []),
    ...input.texts.filter((t) => !insidePiece.has(t.id)),
  ];
  const lists = readCutLists(linesOf(layoutTexts, pageKey));
  const mainListExists = lists.some((l) => l.kind === 'main');

  // C7: below the auto-accept bar the AI's fabric is not used at all (aiFabricHintsOf is the gate;
  // this keeps any other caller to the same bar)
  const hintBySeed = new Map(
    (input.aiHints ?? []).filter((h) => h.confidence >= AI_AUTO_ACCEPT_T).map((h) => [h.seed, h]),
  );
  const idBySeed = new Map<SeedId, string[]>();
  for (const x of input.identities ?? [])
    idBySeed.set(x.seed, [...(idBySeed.get(x.seed) ?? []), x.identity]);

  const perSeed: SeedFabrics[] = [];
  for (const fam of input.families) {
    const seed = fam.seed;
    const cand = [...fam.candidates].sort((a, b) => b.rank - a.rank)[0];
    const labels: string[] = [];
    const sd = seedById.get(seed);
    if (sd?.text?.text) labels.push(sd.text.text);
    let number = sd?.text ? pieceNumberText(sd.text.text) : null;
    let numberFont = -1;
    for (const id of cand?.textsInside ?? []) {
      const t = textById.get(id);
      if (!t) continue;
      if (!labels.includes(t.text)) labels.push(t.text);
      // the piece number: the seed's own text, else the biggest bare number printed inside
      const n = pieceNumberText(t.text);
      if (n && !sd?.text && t.fontSizeMm > numberFont) {
        number = n;
        numberFont = t.fontSizeMm;
      }
    }

    const why: string[] = [];
    const evidence: FabricEvidence[] = [];
    let kinds = new Set<FabricKind>(['main']);
    let confidence = 0.6;
    let explicitMain = false;
    let said = false;
    let aiOnly = false;

    // 1. labels inside the piece
    const labelKinds = new Set<FabricKind>();
    for (const l of labels) {
      const hits = fabricKindsIn(l);
      for (const h of hits) {
        labelKinds.add(h.kind);
        evidence.push({ kind: 'label', text: l.slice(0, 60), seed });
      }
      if (hits.length) why.push(`label «${l.trim().slice(0, 40)}»`);
      if (hits.some((h) => h.kind === 'interfacing') && hasFuseVerb(l))
        why.push('the label says to fuse it');
    }
    if (labelKinds.has('main')) explicitMain = true;
    const exclusive = [...labelKinds].filter((k) => SECONDARY_EXCLUSIVE.has(k));
    if (exclusive.length) {
      kinds = new Set(exclusive);
      if (explicitMain) kinds.add('main');
      confidence = 0.85;
      said = true;
    }
    if (labelKinds.has('interfacing')) {
      kinds.add('interfacing');
      confidence = Math.max(confidence, 0.8);
      said = true;
    }
    if (labelKinds.has('main') && !exclusive.length) {
      confidence = Math.max(confidence, 0.8);
      said = true;
    }

    // 2. the name says lining
    const ids = idBySeed.get(seed) ?? [];
    if (!exclusive.length && ids.length && ids.every((id) => codeWordsOf(id).includes('LIN'))) {
      kinds = new Set(['lining', ...[...kinds].filter((k) => k === 'interfacing')]);
      confidence = Math.max(confidence, 0.75);
      why.push(`named ${ids[0]}`);
      said = true;
    }

    // 3. cut layouts by piece number
    if (number) {
      const inLists = lists.filter((l) => l.pieces.includes(number));
      const inMain = inLists.some((l) => l.kind === 'main');
      const secondary = [...new Set(inLists.map((l) => l.kind).filter((k) => k !== 'main'))];
      for (const l of inLists)
        evidence.push({
          kind: 'cut-layout',
          text: l.label,
          ...(l.widthCm ? { widthCm: l.widthCm } : {}),
          pieces: l.pieces,
        });
      if (inLists.length) {
        why.push(
          `cut layout: ${inLists.map((l) => `${l.kind} «${l.label.slice(0, 30)}»`).join(', ')}`,
        );
        said = true;
      }
      if (inMain) explicitMain = true;
      for (const k of secondary) kinds.add(k);
      const excl = secondary.filter((k) => SECONDARY_EXCLUSIVE.has(k));
      if (excl.length && !inMain && !explicitMain) {
        kinds.delete('main');
        confidence = Math.max(confidence, mainListExists ? 0.8 : 0.65);
      } else if (inLists.length) {
        if (inMain) kinds.add('main');
        confidence = Math.max(confidence, 0.8);
      }
    }

    // 4. the AI, where the sheet is silent
    const hint = hintBySeed.get(seed);
    if (hint && hint.fabrics.length) {
      const aiKinds = hint.fabrics.flatMap((p) => (KIND_OF_PURPOSE[p] ? [KIND_OF_PURPOSE[p]] : []));
      if (aiKinds.length) {
        evidence.push({ kind: 'ai', confidence: hint.confidence });
        if (!said) {
          kinds = new Set(aiKinds);
          confidence = Math.min(0.8, 0.8 * hint.confidence);
          why.push(`AI: ${aiKinds.join(' + ')}`);
          aiOnly = true;
        } else if (
          aiKinds.every((k) => kinds.has(k)) &&
          [...kinds].every((k) => aiKinds.includes(k))
        ) {
          confidence = Math.min(0.95, confidence + 0.1);
          why.push('AI agrees');
        }
      }
    }
    if (!said && !(hint && hint.fabrics.length)) why.push('no fabric named — main fabric');
    perSeed.push({ seed, number, kinds: [...kinds], confidence, why, evidence, aiOnly });
  }

  return { assignment: assign(perSeed, input.bom, lists), perSeed, lists };
}

/** Seeds × fabric kinds → card scopes, proposals per fabric, refusals. */
function assign(
  perSeed: readonly SeedFabrics[],
  bom: readonly DraftScopeTarget[],
  lists: readonly CutList[],
): FabricAssignment {
  const byPurpose: Record<string, SeedId[]> = {};
  const interliningInBom = bom.some(isInterliningScope);
  const proposals = new Map<string, FabricProposal & { _n: number }>();
  const refused = new Map<
    string,
    { label: string; purpose: string; seeds: SeedId[]; reason: string }
  >();
  const KIND_LABEL: Record<FabricKind, string> = {
    main: 'main fabric',
    lining: 'lining',
    interfacing: 'interlining',
    rib: 'rib knit',
    pocketing: 'pocketing',
    insulation: 'insulation',
    contrast: 'contrast fabric',
    mesh: 'mesh',
  };
  for (const s of perSeed) {
    for (const kind of s.kinds) {
      const hit = scopeFor(kind, bom);
      const label =
        s.evidence
          .flatMap((e) => (e.kind === 'label' ? [e.text] : []))
          .find((t) => fabricKindsIn(t).some((h) => h.kind === kind)) ??
        lists.find((l) => l.kind === kind && s.number && l.pieces.includes(s.number))?.label ??
        KIND_LABEL[kind];
      const purpose = hit?.target.fabricPurpose || PURPOSE_OF_KIND[kind];
      const key = hit ? hit.target.scopeKey : `kind:${kind}`;
      const pr: FabricProposal & { _n: number } = proposals.get(key) ?? {
        label,
        purpose,
        scopeKey: hit?.target.scopeKey ?? null,
        seeds: [],
        evidence: [],
        confidence: 0,
        _n: 0,
      };
      if (!pr.seeds.includes(s.seed)) pr.seeds.push(s.seed);
      for (const e of s.evidence) if (e.kind !== 'label' || e.seed === s.seed) pr.evidence.push(e);
      pr.confidence =
        (pr.confidence * pr._n + s.confidence * (hit && hit.alternatives ? 0.8 : 1)) / (pr._n + 1);
      pr._n++;
      proposals.set(key, pr);
      if (hit) {
        const list = (byPurpose[hit.target.scopeKey] ??= []);
        if (!list.includes(s.seed)) list.push(s.seed);
        continue;
      }
      if (kind === 'interfacing') continue; // no interlining line → `fused` (decision 14)
      const r = refused.get(kind) ?? {
        label: KIND_LABEL[kind],
        purpose,
        seeds: [],
        reason:
          kind === 'main'
            ? 'the BOM has no main fabric line — add it on the BOM tab (no DXF is written for these pieces until then)'
            : `the sheet cuts these pieces from ${KIND_LABEL[kind]}, but the BOM has no ${KIND_LABEL[kind]} line — add it on the BOM tab or tick another fabric (no ${KIND_LABEL[kind]} DXF is written)`,
      };
      if (!r.seeds.includes(s.seed)) r.seeds.push(s.seed);
      refused.set(kind, r);
    }
  }
  const aiOnly = perSeed
    .filter((s) => s.aiOnly)
    .map((s) => ({
      seed: s.seed,
      purposes: s.kinds.map((k) => PURPOSE_OF_KIND[k]),
      needsConfirm: s.kinds.some((k) => k !== 'main'),
    }));
  return {
    byPurpose,
    interliningInBom,
    proposals: [...proposals.values()].map(({ _n: _drop, ...p }) => ({
      ...p,
      evidence: dedupeEvidence(p.evidence),
    })),
    refused: [...refused.values()],
    ...(aiOnly.length ? { aiOnly } : {}),
  };
}

function dedupeEvidence(ev: FabricEvidence[]): FabricEvidence[] {
  const seen = new Set<string>();
  return ev.filter((e) => {
    const k = JSON.stringify(e);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** The contract's `ProposeFabricsFn` (sheet texts + families + BOM; no instructions, no AI). */
export const proposeFabrics: ProposeFabricsFn = (sheet, families, bom) =>
  proposeFabricsDetailed({ texts: sheet.texts, families, bom }).assignment;
