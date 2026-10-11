// THE ASSEMBLY SKELETON — the proposal screen and its two doors.
//
// WHAT IT IS. A draft of the assembly order read off the pattern: pieces → units → order, with the
// seam types left empty for the technologist (owner, 09.10). The screen shows each proposed step with
// its inputs as silhouettes, what it makes, how sure the reading is and WHY, in words — and writes
// nothing until «apply» is pressed. It is drawn in the grammar of the ratification panel
// (`operations-ratify-panel.tsx`): one ruled line per step, in order, short doors on the line.
//
// WHAT IT IS NOT.
//   * NOT A SECOND WRITER. Apply goes through `OperationsField`'s `applyRequest` and `rowFromStep` —
//     the same row builder as the create dialog. After apply the steps are ordinary steps; only this
//     session's rail marks them «draft» until a hand changes them.
//   * NOT A SILENT ONE. Nothing is applied without a press; a guess is unticked; an ambiguous join
//     shows both readings with the first preselected and «?»; a piece the pattern gave no evidence
//     for is listed as a gap; the machine the server demands is a card default and says «check».
//   * NOT THE ENGINE. The proposal comes from `useSkeletonProposal` (assembly-skeleton-source.ts).
import * as Dialog from '@radix-ui/react-dialog';
import {
  applySkeletonAIOrder,
  skeletonAIDecisionKey,
  skeletonAIPins,
  skeletonAIPlaces,
  skeletonAIRequest,
  skeletonAIStepIndex,
  skeletonAIStructure,
  skeletonStepSignatures,
} from 'lib/assembly-skeleton/ai';
import { readablePieceName } from 'lib/assembly-skeleton/names';
import { orderTemplate } from 'lib/assembly-skeleton/skeleton';
import { namesIn } from 'lib/assembly-skeleton/skeleton/build-skeleton';
import { replayExisting } from 'lib/assembly-skeleton/skeleton/existing';
import { unitLeaves } from 'lib/assembly-skeleton/union';
import {
  SKELETON,
  type SeamCandidate,
  type SkeletonDeps,
  type SkeletonExistingOrder,
  type SkeletonFacts,
  type SkeletonOptions,
  type SkeletonPins,
  type SkeletonProposal,
  type SkeletonStep,
} from 'lib/assembly-skeleton/types';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import CheckboxCommon from 'ui/components/checkbox';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { HeaderNote } from 'ui/components/section-header';
import Text from 'ui/components/text';

import { assemblySweep, classifyAssemblyInputs, type AssemblyStep } from './assembly-frontier';
import { SkeletonAIBar, useSkeletonAI } from './assembly-skeleton-ai';
import { makeSkeletonDeps } from './assembly-skeleton-deps';
import {
  AUTO_KIND_WORDS,
  autoGroups,
  autoGuess,
  autoKindOf,
  autoTickedGuesses,
  defaultPick,
  isDerived,
  isOpenChoice,
  openTies,
  orderClosure,
  personalPick,
  picksFor,
  ridersOf,
  type StepPick,
} from './assembly-skeleton-ticks';
import {
  buildSkeletonFacts,
  skeletonCategoryRead,
  skeletonGate,
  skeletonLined,
  useSkeletonProposal,
  type SkeletonRun,
} from './assembly-skeleton-source';
import { machineTypeLabel, pressEquipmentLabel } from './equipment-options';
import type { InferenceAlias, InferenceBomLine } from './operation-inference';
import { zoneLabel } from './operation-options';
import {
  skeletonMachineOf,
  skeletonPressOf,
  skeletonZoneOf,
  type SkeletonApplyRequest,
  type SkeletonApplyResult,
  type SkeletonRowContext,
  type SkeletonUndoRequest,
  type SkeletonUndoResult,
} from './operations-field';

/** The unit pictograms' cap (`unitPictures` maxPieces): a bigger unit is said in numbers. */
const UNIT_PICTO_MAX = 16;

/** The footer's last word: an apply's answer, or what its undo did. */
type PanelResult = SkeletonApplyResult & {
  /** Rows an undo took back. */
  undone?: number;
  /** Why an undo did nothing, in words. */
  undoRefused?: string;
};
import { pieceRefKey } from './piece-block-refs';
import type { PieceCloth } from './piece-cloth';
import { PieceTile } from './piece-silhouette';
import { toPurposeEnum, type TechCardFormData } from './schema';
import type { PieceShapes } from './use-piece-shapes';

/**
 * A unit's pictogram (lane C) — for the unit a step makes and for an earlier unit it takes as an
 * input. Returns null when the unit has no picture (no contours); the line then shows the plain
 * «▣ key» tile.
 */
export type RenderUnit = (unitKey: string, name: string, proposal: SkeletonProposal) => ReactNode;

// ── words ───────────────────────────────────────────────────────────────────────────────────────

/** Confidence is never shown as a bare number. */
export function confidenceWord(c: number): string {
  if (c >= 0.85) return 'sure';
  if (c >= SKELETON.accept) return 'likely';
  return 'a guess';
}

const mm = (v: number) => String(Math.round(v));

/** One seam's evidence, in words: «518 = 518 mm · 2 notches · curves fit». */
export function seamWords(s: SeamCandidate): string {
  const e = s.evidence;
  // A part laid on a placement mark: its evidence is the mark, not two edge lengths.
  if (s.kind === 'surface')
    return (e.rule ?? 'laid on its placement mark').replace(/^surface: /, '');
  const parts: string[] = [];
  if (s.kind === 'closure-not-seam') parts.push('a closure, not a seam');
  if (s.kind === 'partial') parts.push('partial seam');
  if (s.kind === 'composite') parts.push('against the assembled edge');
  if (e.aLenMm != null && e.bLenMm != null) {
    const same = Math.abs(e.aLenMm - e.bLenMm) < 0.5;
    parts.push(`${mm(e.aLenMm)} ${same ? '=' : '≈'} ${mm(e.bLenMm)} mm`);
  } else if (e.dLenMm < 0.5) {
    parts.push('same length');
  } else {
    parts.push(`lengths ${mm(e.dLenMm)} mm apart`);
  }
  if (e.notchesMatched != null && e.notchesMatched > 0) {
    parts.push(`${e.notchesMatched} ${e.notchesMatched === 1 ? 'notch' : 'notches'}`);
  } else if (e.notchScore === 1) parts.push('notches match');
  else if (e.notchScore === 0.7) parts.push('most notches match');
  else if (e.notchScore === 0.3) parts.push('one notch matches');
  else if (e.notchScore === 0) parts.push('notches disagree');
  else parts.push('no notches to compare');
  if (e.curvature === 'complementary') parts.push('curves fit');
  if (e.twin === 'mirror') parts.push('mirror pair');
  if (e.twin === 'identical') parts.push('layers of one shape');
  if (e.hand === 'cross') parts.push('left meets right');
  if (e.rule) parts.push(e.rule);
  return parts.join(', ');
}

const SOURCE_WORD: Record<SkeletonStep['source'], string> = {
  geometry: 'read off the pattern',
  template: 'from the order template',
  bom: 'from the BOM',
  ai: 'AI',
};

/** What the step does and on what — the words the rail will print, plus the «check» flag. */
function operationWords(
  step: SkeletonStep,
  ctx: SkeletonRowContext,
): { text: string; check: string } {
  const zone = zoneLabel(skeletonZoneOf(step) as Parameters<typeof zoneLabel>[0]);
  const t = step.operationType;
  if (t === 'MACHINE') {
    const m = skeletonMachineOf(step, ctx);
    // Short on the line (it repeats on every sewn step); the full sentence rides the title.
    const check =
      m.source === 'step'
        ? ''
        : m.source === 'card'
          ? 'check the machine · card default'
          : 'check the machine · none on the card';
    return {
      text: ['sew', machineTypeLabel(m.machineType), zone].filter(Boolean).join(' · '),
      check,
    };
  }
  if (t === 'PRESS' || t === 'PRESS_OPEN' || t === 'FUSING') {
    const p = skeletonPressOf(`TECH_CARD_OPERATION_TYPE_${t}`, ctx);
    const verb = t === 'PRESS_OPEN' ? 'press open' : t === 'FUSING' ? 'fuse' : 'press';
    return {
      text: [verb, pressEquipmentLabel(p.pressEquipment), zone].filter(Boolean).join(' · '),
      check: p.source === 'fallback' ? 'check the equipment · none on the card' : '',
    };
  }
  return { text: ['by hand', zone].filter(Boolean).join(' · '), check: '' };
}

// ── per-step view model ─────────────────────────────────────────────────────────────────────────

type Variant = { inputs: string[]; seams: SeamCandidate[]; reason: string };

/**
 * The readings of an ambiguous join in their STABLE order: the step carries the chosen one as its
 * own inputs and the rest as `alternatives`, so the chosen one is spliced back in at its place.
 */
const variantsOf = (s: SkeletonStep): Variant[] => {
  const own = { inputs: s.inputs, seams: s.seams, reason: s.reason };
  const list = [...(s.alternatives ?? [])];
  list.splice(Math.min(s.decision?.chosen ?? 0, list.length), 0, own);
  return list;
};

const isAmbiguous = (s: SkeletonStep): boolean =>
  (s.alternatives?.length ?? 0) > 0 || s.seams.some((c) => (c.ambiguousWith?.length ?? 0) > 0);

/** The readings the proposal was built with — the base a new choice is added to. */
const pinsOf = (p: SkeletonProposal): Record<string, number> => {
  const pins: Record<string, number> = {};
  for (const s of p.steps) if (s.decision) pins[s.decision.id] = s.decision.chosen;
  return pins;
};

/**
 * The person's ticks carried from the proposal they were made on to its rebuild. A new step (a
 * rebuild's) gets the mode's default ticks — in manual the order-closing ones included, in auto a
 * tick and its AUTO mark; a step the person already had keeps their tick. In auto mode the join
 * whose reading was just chosen is the person's decision now: ticked, and no longer marked AUTO.
 */
const carryPicks = (
  prev: SkeletonProposal | null,
  prevPicks: readonly StepPick[],
  next: SkeletonProposal,
  auto: boolean,
): StepPick[] => {
  if (!prev || prevPicks.length !== prev.steps.length)
    return picksFor(next.steps, auto, () => undefined);
  const old = new Map(skeletonStepSignatures(prev.steps).map((sig, i) => [sig, prevPicks[i]]));
  const carried = skeletonStepSignatures(next.steps).map((sig) => old.get(sig));
  const chosenBefore = new Map(
    prev.steps.flatMap((s) => (s.decision ? [[s.decision.id, s.decision.chosen] as const] : [])),
  );
  const chosenNow = (s: SkeletonStep): boolean =>
    !!s.decision &&
    chosenBefore.has(s.decision.id) &&
    chosenBefore.get(s.decision.id) !== s.decision.chosen;
  return picksFor(
    next.steps,
    auto,
    (i) =>
      carried[i] ??
      (auto && chosenNow(next.steps[i])
        ? { accepted: true, applied: false, own: true }
        : undefined),
  );
};

// ── the door ────────────────────────────────────────────────────────────────────────────────────

/**
 * Everything the construction tab needs to host the skeleton: the two doors (section header, empty
 * state), the panel, and the request it hands to `OperationsField`. State lives here — above the
 * panel — so a closed and reopened panel keeps its proposal and its «applied» marks.
 */
export function useSkeletonDoor({
  frozen,
  shapes,
  cloth,
  categoryNames,
  renderUnit,
  techCardId,
}: {
  frozen: boolean;
  shapes: PieceShapes;
  /** Cloth of each piece (first colourway), keyed by the piece's lineKey. */
  cloth: ReadonlyMap<string, PieceCloth> | null;
  /** The card's category chain, leaf first — picks the order template. */
  categoryNames: ReadonlyArray<string>;
  renderUnit?: RenderUnit;
  /** The card asked about, for the AI call's log (0 / absent = a card not saved yet). */
  techCardId?: number;
}): {
  headerAction: ReactNode;
  emptyAction: ReactNode;
  panel: ReactNode;
  applyRequest: SkeletonApplyRequest | null;
  onSkeletonApplied: (r: SkeletonApplyResult) => void;
  skeletonUndoRequest: SkeletonUndoRequest | null;
  onSkeletonUndone: (r: SkeletonUndoResult) => void;
  onSkeletonUndoable: (nonce: number | null) => void;
} {
  const proposal = useSkeletonProposal();
  // The AI's answer outlives the panel like the proposal does: reopening shows it again for free.
  const ai = useSkeletonAI();
  const gate = skeletonGate({
    frozen,
    hasDxf: shapes.hasDxf,
    shapes: shapes.shapeByKey,
    available: proposal.available,
    parsedPieces: shapes.parsedPieces,
    namedBlocks: shapes.namedBlocks,
  });
  const [open, setOpen] = useState(false);
  // With steps on the card the person CHOOSES add or replace before anything is read; the choice
  // and the mode the proposal on screen was read for outlive the panel, like the proposal itself.
  const [mode, setMode] = useState<SkeletonMode | null>(null);
  const [readFor, setReadFor] = useState<SkeletonMode | null>(null);
  const [applyRequest, setApplyRequest] = useState<SkeletonApplyRequest | null>(null);
  const [result, setResult] = useState<PanelResult | null>(null);
  // UNDO (03-P2 §6). The field owns the history; the door only asks («undo» = this apply's nonce)
  // and listens: which apply ⌘Z would take back now, and what an undo / a redo did. The picks of
  // each apply are kept before/after, so an undo un-marks exactly what it took back and a redo
  // (⇧⌘Z) marks it again.
  const [undoable, setUndoable] = useState<number | null>(null);
  const [undoRequest, setUndoRequest] = useState<SkeletonUndoRequest | null>(null);
  const undoSeq = useRef(0);
  const pickSnaps = useRef(new Map<number, { before: StepPick[]; after: StepPick[] }>());
  const [picks, setPicks] = useState<StepPick[]>([]);
  // AUTO MODE (07 §5): on by default, and it outlives the panel like the proposal does. The ref is
  // what the rebuild effect reads, so a switch does not re-run it.
  const [autoMode, setAutoMode] = useState(true);
  const autoRef = useRef(true);

  // A fresh proposal gets fresh picks; the same proposal keeps them across close/open; a rebuild
  // around a chosen reading keeps the ticks of every step the choice did not touch.
  const ready = proposal.state.status === 'ready' ? proposal.state.proposal : null;
  const pickedOn = useRef<SkeletonProposal | null>(null);
  useEffect(() => {
    const prev = pickedOn.current;
    pickedOn.current = ready;
    setPicks((before) => (ready ? carryPicks(prev, before, ready, autoRef.current) : []));
  }, [ready]);
  // Switching auto ↔ manual re-picks every step but the ones a person ticked or unticked and the
  // ones already applied.
  const switchAuto = (on: boolean) => {
    autoRef.current = on;
    setAutoMode(on);
    const steps = pickedOn.current?.steps;
    if (steps)
      setPicks((prev) =>
        prev.length === steps.length ? picksFor(steps, on, (i) => personalPick(prev[i])) : prev,
      );
  };

  // Which proposal steps each request carried, so its answer marks exactly those as applied.
  const [carried, setCarried] = useState<{ nonce: number; idx: number[]; replace: boolean } | null>(
    null,
  );
  const nonceRef = useRef(0);
  const { isCurrent } = proposal;
  const request = useCallback(
    (
      steps: SkeletonStep[],
      idx: number[],
      mode: 'append' | 'replace',
      /** The run whose proposal these steps were rendered from (SkeletonRun.gen). */
      gen: number,
      confirmedReplace = false,
    ) => {
      setResult(null);
      const nonce = (nonceRef.current += 1);
      // A reading was chosen since these steps were drawn: they are the OLD reading's. Nothing is
      // written; the person applies again from the steps on screen now.
      if (!isCurrent(gen)) {
        setResult({
          nonce,
          applied: 0,
          refused:
            'the skeleton was re-read around a chosen reading since — check the new steps and apply again',
        });
        return;
      }
      setCarried({ nonce, idx, replace: mode === 'replace' });
      setApplyRequest({ steps, mode, confirmedReplace, nonce });
    },
    [isCurrent],
  );

  const door = (where: 'header' | 'empty') => {
    // A card without a pattern has nothing to read: the header stays silent (as the silhouette
    // line does), and only the empty state names the reason.
    if (where === 'header' && !shapes.hasDxf) return null;
    const label = where === 'header' ? 'suggest skeleton' : 'suggest a skeleton from the pattern';
    const button =
      where === 'header' ? (
        <Button
          type='button'
          variant='underline'
          size='xs'
          disabled={!gate.open}
          onClick={() => setOpen(true)}
          data-skeleton-door={where}
          title={
            gate.open
              ? 'read pieces → units → order off the pattern; nothing is written until you apply'
              : gate.why
          }
        >
          {label}
        </Button>
      ) : (
        <Chip
          dashed
          disabled={!gate.open}
          onClick={() => setOpen(true)}
          data-skeleton-door={where}
          title={
            gate.open
              ? 'read pieces → units → order off the pattern; nothing is written until you apply'
              : gate.why
          }
        >
          {label}
        </Chip>
      );
    // A shut door says why in words, beside it — a greyed button alone reads as broken.
    return (
      <>
        {button}
        {!gate.open &&
          (where === 'header' ? (
            <HeaderNote data-skeleton-why={where}>{gate.why}</HeaderNote>
          ) : (
            <Text size='micro' variant='label' component='span' data-skeleton-why={where}>
              {gate.why}
            </Text>
          ))}
      </>
    );
  };

  return {
    headerAction: door('header'),
    emptyAction: door('empty'),
    panel:
      open && gate.open ? (
        <AssemblySkeletonPanel
          run={proposal.state}
          onRun={proposal.run}
          onAdopt={proposal.adopt}
          ai={ai}
          techCardId={techCardId}
          shapes={shapes}
          cloth={cloth}
          categoryNames={categoryNames}
          picks={picks}
          onPicks={setPicks}
          autoMode={autoMode}
          onAutoMode={switchAuto}
          mode={mode}
          onMode={setMode}
          readFor={readFor}
          onReadFor={setReadFor}
          onApply={request}
          result={result}
          undoable={!!result && result.applied > 0 && undoable === result.nonce}
          onUndo={() =>
            result && setUndoRequest({ nonce: result.nonce, seq: (undoSeq.current += 1) })
          }
          renderUnit={renderUnit}
          onClose={() => setOpen(false)}
        />
      ) : null,
    applyRequest,
    onSkeletonApplied: (r) => {
      setResult(r);
      if (r.applied === 0 || !carried || carried.nonce !== r.nonce) return;
      const done = new Set(carried.idx);
      // A replace wipes what earlier applies wrote; only this batch stands in the form now.
      setPicks((prev) => {
        const next = prev.map((p, i) =>
          done.has(i) ? { ...p, applied: true } : carried.replace ? { ...p, applied: false } : p,
        );
        pickSnaps.current.set(r.nonce, { before: prev, after: next });
        return next;
      });
    },
    skeletonUndoRequest: undoRequest,
    onSkeletonUndone: (r) => {
      const snap = pickSnaps.current.get(r.nonce);
      if (r.refused) {
        setResult({ nonce: r.nonce, applied: 0, undoRefused: r.refused });
      } else if (r.undone > 0) {
        setResult({ nonce: r.nonce, applied: 0, undone: r.undone });
        if (snap) setPicks(snap.before);
      } else if (r.redone) {
        setResult({ nonce: r.nonce, applied: r.redone });
        if (snap) setPicks(snap.after);
      }
    },
    onSkeletonUndoable: setUndoable,
  };
}

// ── the panel ───────────────────────────────────────────────────────────────────────────────────

/** Add the skeleton after the card's own steps, or replace them with it. */
type SkeletonMode = 'append' | 'replace';

function AssemblySkeletonPanel({
  run,
  onRun,
  onAdopt,
  ai,
  techCardId,
  shapes,
  cloth,
  categoryNames,
  picks,
  onPicks,
  autoMode,
  onAutoMode,
  mode: chosenMode,
  onMode,
  readFor,
  onReadFor,
  onApply,
  result,
  undoable,
  onUndo,
  renderUnit,
  onClose,
}: {
  run: SkeletonRun;
  onRun: (facts: SkeletonFacts, deps?: SkeletonDeps, options?: SkeletonOptions) => void;
  onAdopt: (p: SkeletonProposal) => void;
  ai: ReturnType<typeof useSkeletonAI>;
  techCardId?: number;
  shapes: PieceShapes;
  cloth: ReadonlyMap<string, PieceCloth> | null;
  categoryNames: ReadonlyArray<string>;
  picks: StepPick[];
  onPicks: (next: StepPick[] | ((prev: StepPick[]) => StepPick[])) => void;
  /** Auto mode: every step ticked, each guess and open reading taken at the engine's reading. */
  autoMode: boolean;
  onAutoMode: (on: boolean) => void;
  /** null = not chosen yet (only possible while the card has steps). */
  mode: SkeletonMode | null;
  onMode: (m: SkeletonMode) => void;
  /** The mode the proposal on screen was read for. */
  readFor: SkeletonMode | null;
  onReadFor: (m: SkeletonMode) => void;
  onApply: (
    steps: SkeletonStep[],
    idx: number[],
    mode: 'append' | 'replace',
    gen: number,
    confirmedReplace?: boolean,
  ) => void;
  result: PanelResult | null;
  /** The last apply can still be taken back (its record is on top, its rows untouched). */
  undoable: boolean;
  onUndo: () => void;
  renderUnit?: RenderUnit;
  onClose: () => void;
}) {
  // The panel reads the form only while it is open — the tab does not pay for it on every keystroke.
  const formPieces = (useWatch<TechCardFormData>({ name: 'pieces' }) ??
    []) as TechCardFormData['pieces'];
  const bomItems = (useWatch<TechCardFormData>({ name: 'bomItems' }) ??
    []) as TechCardFormData['bomItems'];
  const operations = (useWatch<TechCardFormData>({ name: 'operations' }) ?? []) as NonNullable<
    TechCardFormData['operations']
  >;
  const aliases = (useWatch<TechCardFormData>({ name: 'pieceDxfAliases' }) ??
    []) as InferenceAlias[];
  const park = useWatch<TechCardFormData>({ name: 'construction.equipmentDefaults' }) as
    | TechCardFormData['construction']['equipmentDefaults']
    | undefined;
  const ctx: SkeletonRowContext = useMemo(
    () => ({ machines: park?.machines ?? [], presses: park?.presses ?? [] }),
    [park],
  );

  const patterns = (useWatch<TechCardFormData>({ name: 'patterns' }) ??
    []) as TechCardFormData['patterns'];
  const purpose = useWatch<TechCardFormData>({ name: 'purpose' }) as string | undefined;
  // The template: the card's category; with none set, what the piece names say (and the panel says
  // it read them).
  const categoryReading = useMemo(
    () =>
      skeletonCategoryRead({
        categoryNames,
        hasLining: skeletonLined({
          cloth,
          pieces: formPieces ?? [],
          aliases,
          patterns: patterns ?? [],
          bomLines: (bomItems ?? []) as Parameters<typeof skeletonLined>[0]['bomLines'],
        }),
        pieceNames: (formPieces ?? []).map((p) => p.name ?? ''),
        purpose: toPurposeEnum(purpose),
      }),
    [categoryNames, cloth, formPieces, aliases, patterns, bomItems, purpose],
  );
  const category = categoryReading.category;

  // The card's own deps: zones read its BOM and piece↔block links (lining steps → LINING zone).
  const deps = useMemo(
    () =>
      makeSkeletonDeps({
        bomLines: (bomItems ?? []) as InferenceBomLine[],
        aliases,
      }),
    [bomItems, aliases],
  );

  const pieceName = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of formPieces ?? [])
      if (p.lineKey) m.set(p.lineKey, readablePieceName(p.name?.trim() ?? '') || p.lineKey);
    return m;
  }, [formPieces]);
  const pieceKeys = useMemo(() => new Set(pieceName.keys()), [pieceName]);
  const sweepPieces = useMemo(
    () => [...pieceName].map(([lineKey, name]) => ({ lineKey, name })),
    [pieceName],
  );
  const formSteps: AssemblyStep[] = useMemo(
    () =>
      operations.map((o) => ({
        inputs: classifyAssemblyInputs(pieceKeys, (o.inputKeys ?? []).filter(Boolean)),
        outputUnitKey: (o.outputUnitKey ?? '').trim(),
        outputUnitName: (o.outputUnitName ?? '').trim(),
      })),
    [operations, pieceKeys],
  );

  const [pressOpen, setPressOpen] = useState(true);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const existing = operations.length;
  // An empty order has nothing to choose about; with steps, nothing is read until a mode is chosen.
  const mode: SkeletonMode | null = existing === 0 ? 'append' : chosenMode;
  const effectiveMode: SkeletonMode = mode ?? 'append';
  const replacing = effectiveMode === 'replace';

  // APPEND = the skeleton continues the card's order: built over the pieces its joins have not
  // consumed, with its live units on the table. REPLACE = the whole pattern, from scratch.
  const existingOrder: SkeletonExistingOrder | undefined = useMemo(
    () => (effectiveMode === 'append' && formSteps.length ? { steps: formSteps } : undefined),
    [effectiveMode, formSteps],
  );
  const built = useMemo(
    () =>
      buildSkeletonFacts({
        pieces: formPieces ?? [],
        shapes: shapes.shapeByKey,
        cloth,
        bomLines: (bomItems ?? []) as Parameters<typeof buildSkeletonFacts>[0]['bomLines'],
        category,
        defaultMachineType:
          (park?.machines ?? []).find(
            (m) => m.machineType && m.machineType !== 'TECH_CARD_MACHINE_TYPE_UNKNOWN',
          )?.machineType ?? null,
        aliases,
        existing: existingOrder,
      }),
    [formPieces, bomItems, shapes.shapeByKey, cloth, category, park, aliases, existingOrder],
  );
  // What the card's own joins have already sewn: out of an appended skeleton, and out of its gaps.
  const consumed = useMemo(
    () => replayExisting({ steps: formSteps }, pieceKeys).consumed,
    [formSteps, pieceKeys],
  );
  const openPieces = built.facts.pieces.filter((p) => !consumed.has(p.pieceKey)).length;
  // Every piece is in the order already: an appended skeleton has nothing to read.
  const nothingToAdd = existing > 0 && openPieces === 0;

  // The pattern is read once per chosen mode: opening reads it, reopening shows what was read,
  // switching add ↔ replace reads it again for the other mode.
  useEffect(() => {
    if (!mode) return;
    // An empty order chose «add» by itself: keep it chosen once the first apply fills the order.
    if (!chosenMode) onMode(mode);
    if (mode === 'append' && nothingToAdd) return;
    if (run.status !== 'idle' && readFor === mode) return;
    onReadFor(mode);
    onRun(built.facts, deps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  const proposal =
    run.status === 'ready' && readFor === mode && !(mode === 'append' && nothingToAdd)
      ? run.proposal
      : null;
  // A chosen reading is being read in: the steps on screen are the old reading's until it lands, so
  // no apply — one press, one step or all — may write them. Every apply carries the run it was drawn
  // from; the door refuses one that is no longer current.
  const rebuilding = run.status === 'ready' && !!run.rebuilding;
  const shownGen = run.status === 'ready' ? run.gen : -1;
  // «use AI structure» in force: the category and units the skeleton on screen was built on, kept on
  // the proposal itself — every rebuild of it (a chosen reading, the AI's readings) keeps them, and
  // closing / reopening the panel cannot lose them. null = the engine's own structure.
  const aiStructure = proposal?.structure ?? null;

  const unitName = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of operations)
      if (o.outputUnitKey) m.set(o.outputUnitKey, o.outputUnitName || o.outputUnitKey);
    for (const s of proposal?.steps ?? [])
      if (s.outputUnitKey) m.set(s.outputUnitKey, s.outputUnitName || s.outputUnitKey);
    return m;
  }, [operations, proposal]);
  const nameOf = (k: string) => pieceName.get(k) ?? unitName.get(k) ?? k;

  // Which steps the switch leaves in: «press open after joins» is on by default and switchable.
  const shown = (s: SkeletonStep) => pressOpen || s.operationType !== 'PRESS_OPEN';

  // The batch «apply all accepted» would write, and what the frontier rules say about it — computed
  // over the order as it would stand: the form's steps (unless replaced) followed by the batch.
  const batch = useMemo(() => {
    if (!proposal) return { idx: [] as number[], steps: [] as SkeletonStep[] };
    const idx: number[] = [];
    proposal.steps.forEach((s, i) => {
      const p = picks[i];
      // A replace rewrites the whole order, so steps applied earlier go in again.
      if (p && p.accepted && (!p.applied || replacing) && shown(s)) idx.push(i);
    });
    return { idx, steps: idx.map((i) => proposal.steps[i]) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal, picks, pressOpen, replacing]);
  const base = effectiveMode === 'replace' ? 0 : existing;
  const asAssembly = (s: SkeletonStep): AssemblyStep => ({
    inputs: classifyAssemblyInputs(pieceKeys, s.inputs),
    outputUnitKey: s.outputUnitKey,
    outputUnitName: s.outputUnitName,
  });
  const batchViolations = useMemo(() => {
    const before = effectiveMode === 'replace' ? [] : formSteps;
    const res = assemblySweep(sweepPieces, [...before, ...batch.steps.map(asAssembly)]);
    const byStep = new Map<number, string[]>();
    // Rule 4 (does the order converge) is a release-gate warning, not a refusal (01-PLAN B3).
    for (const v of res.violations) {
      if (v.rule === 4 || v.step < before.length) continue;
      const i = batch.idx[v.step - before.length];
      if (i === undefined) continue;
      byStep.set(i, [...(byStep.get(i) ?? []), namesIn(v.message, pieceName)]);
    }
    return byStep;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch, formSteps, sweepPieces, effectiveMode, pieceName]);

  /** Why «apply this step» alone would break the order now, or '' when it would not. */
  const singleRefusal = (i: number): string => {
    if (!proposal) return '';
    const s = proposal.steps[i];
    const res = assemblySweep(sweepPieces, [...formSteps, asAssembly(s)]);
    const v = res.violations.find((x) => x.rule !== 4 && x.step === formSteps.length);
    return v ? namesIn(v.message, pieceName) : '';
  };

  const usedPieces = useMemo(() => {
    const used = new Set<string>();
    proposal?.steps.forEach((s) => s.inputs.forEach((k) => used.add(k)));
    return used;
  }, [proposal]);
  // How many pieces each unit of the proposal holds — the pictograms stop at UNIT_PICTO_MAX.
  const unitLeafCount = useMemo(() => {
    const m = new Map<string, number>();
    if (!proposal) return m;
    for (const [k, l] of unitLeaves(
      [
        ...formSteps.map((s) => ({
          inputs: s.inputs.map((x) => x.key),
          outputUnitKey: s.outputUnitKey,
        })),
        ...proposal.steps,
      ],
      (k) => pieceKeys.has(k),
    ))
      m.set(k, l.length);
    return m;
  }, [proposal, formSteps, pieceKeys]);
  // Pieces the card's own order has sewn are not «left out» of an appended skeleton.
  const leftOut = built.facts.pieces
    .map((p) => p.pieceKey)
    .filter((k) => !usedPieces.has(k) && !(existingOrder && consumed.has(k)));

  // Ticking a join ticks what rides on it (its press, the hem on the unit it made); unticking it
  // unticks them. A rider may still be dropped on its own.
  const setAccepted = (i: number, accepted: boolean) => {
    const riders = new Set(proposal ? ridersOf(proposal.steps, i) : []);
    onPicks((prev) => {
      // A person's tick is theirs: it is no longer «ticked to close the order» nor AUTO, and an
      // auto ↔ manual switch keeps it.
      const next = prev.map(
        (p, j): StepPick =>
          j === i || (riders.has(j) && !p.applied)
            ? { accepted, applied: p.applied, own: true }
            : p,
      );
      // Auto mode: a tick settles what waited on it (a tie and the steps built on its unit) — every
      // step but a person's own picks takes auto mode's pick again.
      return autoMode && accepted && proposal && next.length === proposal.steps.length
        ? picksFor(proposal.steps, true, (j) => personalPick(next[j]))
        : next;
    });
  };

  // CHOOSING A READING REBUILDS THE PROPOSAL around it: the steps after an ambiguous join depend on
  // which pieces it took, so patching that one step would leave them consuming the wrong units.
  // Once a step of this proposal is in the order, the readings are fixed — a rebuild could recode
  // the units the applied steps already made; «replace» rewrites the whole order and may.
  const readingsLocked = !replacing && picks.some((p) => p.applied);
  const chooseReading = (step: SkeletonStep, v: number) => {
    if (!proposal || !step.decision || step.decision.chosen === v || readingsLocked) return;
    // Every reading on screen is kept (pinned); only THIS one is the person's decision.
    const pins: SkeletonPins = { ...pinsOf(proposal), [step.decision.id]: v };
    const resolved = [...(proposal.resolved ?? []), step.decision.id];
    onRun(built.facts, deps, { ...aiStructure, pins, resolved });
  };

  // ── THE AI SECOND OPINION (lane E). Asked only on a press; its order and readings are shown
  // beside the engine's and reach the steps only through «use AI order» / «use AI readings».
  const aiRequest = useMemo(
    () =>
      proposal
        ? skeletonAIRequest({
            proposal,
            // the category the skeleton on screen was read as (the AI's, once its structure is used)
            facts: proposal.structure?.category
              ? { ...built.facts, category: proposal.structure.category }
              : built.facts,
            templateStages: orderTemplate(
              proposal.structure?.category ?? built.facts.category,
            ).stages.map((st) => st.label),
            seamWords,
            techCardId,
          })
        : null,
    [proposal, built.facts, techCardId],
  );
  const aiResult = ai.state.status === 'ready' ? ai.state.result : null;
  const aiView = useMemo(() => {
    if (!proposal || !aiResult) return null;
    const answer = aiResult.answer;
    const indexOf = skeletonAIStepIndex(proposal, aiResult.sent);
    const places = skeletonAIPlaces(proposal, answer.order ?? [], aiResult.sent);
    const warningsAt = new Map<number, string[]>();
    for (const w of answer.warnings ?? [])
      for (const id of w.stepIds ?? []) {
        const i = indexOf(id);
        if (i != null) warningsAt.set(i, [...(warningsAt.get(i) ?? []), w.message ?? '']);
      }
    const picks = new Map((answer.picks ?? []).map((p) => [p.decisionId ?? '', p]));
    const order =
      (answer.order?.length ?? 0) > 0
        ? applySkeletonAIOrder(proposal, answer.order ?? [], aiResult.sent)
        : null;
    return {
      indexOf,
      places,
      warningsAt,
      picks,
      order,
      pins: skeletonAIPins(proposal, answer, aiResult.request),
      structure: skeletonAIStructure(built.facts, answer),
    };
  }, [proposal, aiResult, built.facts]);
  const [adopted, setAdopted] = useState<SkeletonProposal | null>(null);
  // Each step's place among the steps that stand on their own (riders follow their join).
  const ownPlace = useMemo(() => {
    let n = 0;
    return (proposal?.steps ?? []).map((st) => (isDerived(st) ? null : (n += 1)));
  }, [proposal]);
  const lockedWhy = readingsLocked
    ? 'a step of this skeleton is already in the order; switch to «replace» to change it'
    : '';
  const askAI = (again = false) => {
    if (aiRequest?.ok) ai.ask(aiRequest.request, aiRequest.signatures, again);
  };
  const useAIOrder = () => {
    const o = aiView?.order;
    if (!o?.ok || readingsLocked) return;
    setAdopted(o.proposal);
    onAdopt(o.proposal);
  };
  const useAIReadings = () => {
    if (!aiView || readingsLocked || aiView.pins.changed === 0) return;
    onRun(built.facts, deps, {
      ...aiStructure,
      pins: aiView.pins.pins,
      resolved: [...(proposal?.resolved ?? []), ...aiView.pins.picked],
    });
  };
  // The AI's structure replaces the engine's: its readings (pins) belonged to the old structure.
  const useAIStructure = () => {
    if (!aiView || readingsLocked || aiView.structure.changes === 0) return;
    const next = {
      ...(aiView.structure.category ? { category: aiView.structure.category } : {}),
      ...(aiView.structure.units.length ? { units: aiView.structure.units } : {}),
    };
    onRun(built.facts, deps, next);
  };
  const backToEngine = () => {
    if (readingsLocked) return;
    onRun(built.facts, deps);
  };

  // What a confirmed replace takes with the old steps, said before the confirming press.
  const photosInForm = operations.reduce(
    (n, o) => n + ((o as { media?: unknown[] }).media?.length ?? 0),
    0,
  );
  const unitsGo =
    operations.some((o) => (o.outputUnitKey ?? '').trim() !== '') &&
    !batch.steps.some((s) => s.outputUnitKey);
  // Steps a person has filled beyond what a skeleton writes: seam type, work, minutes.
  const filledInForm = operations.filter(
    (o) =>
      (o.work ?? '').trim() !== '' ||
      (o.smv ?? '').trim() !== '' ||
      (!!o.seamClass && o.seamClass !== 'TECH_CARD_SEAM_CLASS_UNKNOWN'),
  ).length;
  const hasUnitsInForm = operations.some((o) => (o.outputUnitKey ?? '').trim() !== '');
  /** What «replace» takes with the card's steps, in words: «47 steps · 3 step photos · …». */
  const replaceLoses = [
    `${existing} ${existing === 1 ? 'step' : 'steps'}`,
    photosInForm > 0 ? `${photosInForm} step ${photosInForm === 1 ? 'photo' : 'photos'}` : '',
    filledInForm > 0
      ? `seam types, work or minutes on ${filledInForm} ${filledInForm === 1 ? 'step' : 'steps'}`
      : '',
    hasUnitsInForm ? 'the unit markup' : '',
  ].filter(Boolean);
  const chooseMode = (m: SkeletonMode) => {
    setConfirmReplace(false);
    onMode(m);
  };

  const applyAll = () => {
    if (batch.steps.length === 0 || rebuilding) return;
    if (effectiveMode === 'replace' && !confirmReplace) {
      setConfirmReplace(true);
      return;
    }
    onApply(batch.steps, batch.idx, effectiveMode, shownGen, effectiveMode === 'replace');
    setConfirmReplace(false);
  };

  const steps = proposal?.steps ?? [];
  // To decide = the engine's own doubts: a join it guessed or read two ways. A press or a hem that
  // rides on a join is decided with it; a step unticked only because its join is a guess is too.
  // In auto mode nothing is left to decide: each such step is picked, marked AUTO, and listed.
  // Except a TIE: the engine's reading won by name only, so auto mode leaves it to the person.
  const ties = autoMode ? openTies(steps, picks, shown) : [];
  const toCheck = autoMode
    ? ties.length
    : steps.filter((s) => shown(s) && !isDerived(s) && isOpenChoice(s)).length;
  // Auto mode's header: how many shown steps are unticked (none = «all picked»), ties apart.
  const unticked = steps.filter(
    (s, i) => shown(s) && picks[i] && !picks[i].accepted && !picks[i].tie,
  ).length;
  // The number each counted step will get, for «with 30» on the steps that ride on it.
  const numbers = new Map<number, number>();
  {
    let n = base;
    steps.forEach((s, i) => {
      const stored = picks[i] ?? defaultPick(s);
      const applied = replacing ? false : stored.applied;
      if (shown(s) && stored.accepted && !applied) numbers.set(i, (n += 1) * 10);
    });
  }
  const stepNumber = (i: number): string => {
    const n = numbers.get(i);
    if (n != null) return String(n);
    return picks[i]?.applied && !replacing ? 'an applied step' : 'an unticked step';
  };

  // THE ORDER MUST CLOSE: where the proposal ends, which guesses the default ticks took to get there,
  // and which open reading the whole order hangs on — said above the steps, not found in them.
  const closure = useMemo(() => (proposal ? orderClosure(proposal.steps) : null), [proposal]);
  // Every guess the default ticks took — joins that close the order, and riders ticked with a join
  // read on its own evidence — is listed here and marked on its row.
  const {
    closing: closingJoins,
    withJoin: riderGuesses,
    auto: autoPicked,
  } = autoTickedGuesses(steps, picks, shown);
  const autoKinds = autoGroups(steps, autoPicked);
  const decidingJoins = (closure?.openDecisions ?? []).filter(
    (i) => picks[i]?.accepted && !picks[i]?.applied && !!steps[i]?.decision,
  );
  const looseEnds = closure && closure.ends.length > 1 ? closure.ends : [];
  const listNumbers = (idx: number[]) => {
    const ns = idx.map((i) => numbers.get(i)).filter((n): n is number => n != null);
    if (ns.length > 8) return `${ns.slice(0, 7).join(', ')} and ${ns.length - 7} more`;
    return ns.length > 1 ? `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}` : String(ns[0]);
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal container={document.body}>
        <Dialog.Overlay className='fixed inset-0 z-[var(--z-modal)] h-screen bg-overlay' />
        <Dialog.Content
          data-skeleton-panel='1'
          // The ratification panel's shell, byte for byte: white sheet, ink outline, header strip,
          // scrolling body, ruled footer.
          className='fixed inset-x-2.5 top-1/2 z-[var(--z-modal)] flex max-h-[90vh] w-auto -translate-y-1/2 flex-col border border-textColor bg-bgColor text-textColor shadow-[var(--shadow-modal)] focus:outline-none lg:inset-x-auto lg:left-1/2 lg:w-full lg:max-w-5xl lg:-translate-x-1/2'
        >
          <div className='flex shrink-0 items-center gap-2 border-b border-borderColor bg-bgSecondary px-2.5 py-1.5'>
            <Dialog.Title asChild>
              <Text
                size='micro'
                variant='uppercase'
                tracking='group'
                component='span'
                className='font-bold'
              >
                assembly skeleton
              </Text>
            </Dialog.Title>
            {proposal && (
              <Text
                size='micro'
                variant='label'
                component='span'
                className='tabular-nums'
                data-skeleton-count={steps.length}
                data-skeleton-to-decide={toCheck}
                data-skeleton-auto-picked={autoMode ? autoPicked.length : undefined}
              >
                {steps.length} {steps.length === 1 ? 'step' : 'steps'}
                {autoMode
                  ? `${
                      ties.length > 0
                        ? ` · ${ties.length} ${ties.length === 1 ? 'tie' : 'ties'} to decide`
                        : ''
                    }${unticked > 0 ? ` · ${unticked} unticked` : ties.length ? '' : ' · all picked'}${
                      autoPicked.length > 0 ? ` · ${autoPicked.length} auto-picked` : ''
                    }`
                  : toCheck > 0
                    ? ` · ${toCheck} to decide`
                    : ''}{' '}
                · read off the pattern, nothing written yet
              </Text>
            )}
            <Dialog.Close asChild>
              <button
                type='button'
                aria-label='close'
                className='ml-auto text-labelColor hover:text-textColor'
              >
                ✕
              </button>
            </Dialog.Close>
          </div>
          <Dialog.Description className='sr-only'>
            a draft assembly order read off the pattern; tick the steps to keep and apply them
          </Dialog.Description>

          <div className='min-h-0 flex-1 overflow-y-auto p-2.5'>
            {existing > 0 && (
              <ModeChoice
                mode={mode}
                existing={existing}
                openPieces={openPieces}
                replaceLoses={replaceLoses}
                onChoose={chooseMode}
              />
            )}
            {mode === 'append' && nothingToAdd && (
              <Text
                size='micro'
                variant='label'
                component='p'
                className='mb-1.5'
                data-skeleton-nothing-to-add='1'
              >
                to read the pattern again, replace the {existing}{' '}
                {existing === 1 ? 'step' : 'steps'}: the skeleton then starts over from every piece.
              </Text>
            )}
            {mode && run.status === 'running' && (
              <Text size='micro' variant='label' component='p' data-skeleton-state='running'>
                reading the pattern — edges, notches, mirror pairs…
              </Text>
            )}
            {mode && rebuilding && (
              <Text size='micro' variant='label' component='p' data-skeleton-state='rebuilding'>
                rebuilding around the chosen reading — the steps below are the old ones until it
                lands; nothing can be applied meanwhile…
              </Text>
            )}
            {mode && run.status === 'error' && (
              <div className='flex items-center gap-2' data-skeleton-state='error'>
                <Text size='micro' variant='error' component='span'>
                  the pattern could not be read: {run.message}
                </Text>
                <Button
                  type='button'
                  variant='secondary'
                  size='xs'
                  onClick={() => {
                    if (mode) onReadFor(mode);
                    onRun(built.facts, deps);
                  }}
                >
                  try again
                </Button>
              </div>
            )}
            {proposal && (
              <>
                <ChipRow className='mb-1.5'>
                  <Text
                    size='micro'
                    variant='label'
                    component='span'
                    data-skeleton-template={proposal.template}
                  >
                    order from the “{proposal.template}” template
                  </Text>
                  {categoryReading.source !== 'card' && (
                    <Text
                      size='micro'
                      variant='label'
                      component='span'
                      data-skeleton-category-read={categoryReading.source}
                      title='set the category on the card to choose the order template yourself'
                    >
                      {categoryReading.source === 'pieces'
                        ? `· category not set: read as ${categoryReading.category} from the pieces (${categoryReading.why})`
                        : categoryReading.source === 'purpose'
                          ? '· category not set: an auxiliary item, so the generic order'
                          : `· category not set, and the piece names do not say which garment (${categoryReading.why}), so the generic order: set the category`}
                    </Text>
                  )}
                  <Chip
                    nonForm
                    selected={pressOpen}
                    onClick={() => setPressOpen((v) => !v)}
                    title='insert «press open» after each join, as most cards press seams before crossing them'
                    data-skeleton-press={pressOpen ? 'on' : 'off'}
                  >
                    {pressOpen ? '✓ ' : ''}press open after joins
                  </Chip>
                  <Chip
                    nonForm
                    selected={autoMode}
                    onClick={() => onAutoMode(!autoMode)}
                    title={
                      autoMode
                        ? 'auto: every step is ticked and each guess takes the engine’s reading, marked AUTO — press for manual, where guesses wait for you'
                        : 'manual: only what the pattern showed is ticked, guesses wait for you — press to tick every step at the engine’s reading'
                    }
                    data-skeleton-auto={autoMode ? 'on' : 'off'}
                  >
                    {autoMode ? '✓ ' : ''}auto: every step picked
                  </Chip>
                </ChipRow>
                <SkeletonAIBar
                  state={ai.state}
                  available={ai.available}
                  canAsk={!!aiRequest?.ok}
                  whyNot={aiRequest && !aiRequest.ok ? aiRequest.why : ''}
                  onAsk={() => askAI(false)}
                  onAskAgain={() => askAI(true)}
                  readings={{
                    changed: aiView?.pins.changed ?? 0,
                    total: aiView?.picks.size ?? 0,
                    stale: aiView?.pins.stale.length ?? 0,
                    locked: lockedWhy,
                    onUse: useAIReadings,
                  }}
                  order={{
                    moved: aiView?.order?.ok ? aiView.order.moved : 0,
                    blocked:
                      lockedWhy || (aiView?.order && !aiView.order.ok ? aiView.order.why : ''),
                    inUse: !!adopted && adopted === proposal,
                    onUse: useAIOrder,
                  }}
                  structure={{
                    category: aiView?.structure.category ?? null,
                    from: built.facts.category,
                    reason: aiView?.structure.categoryReason ?? '',
                    units: aiView?.structure.units.length ?? 0,
                    inUse: !!aiStructure,
                    locked: lockedWhy,
                    onUse: useAIStructure,
                    onBack: backToEngine,
                  }}
                  stepName={(id) => {
                    const i = aiView?.indexOf(id);
                    if (i == null) return null;
                    const st = steps[i];
                    const n = numbers.get(i);
                    return [n, st.label || st.outputUnitName || 'a step'].filter(Boolean).join(' ');
                  }}
                />
                {proposal.warnings.map((w, i) => (
                  <Text
                    key={i}
                    size='micro'
                    variant='label'
                    component='p'
                    className='mb-1'
                    data-skeleton-warning={i}
                  >
                    {w}
                  </Text>
                ))}

                {(closingJoins.length > 0 ||
                  ties.length > 0 ||
                  autoPicked.length > 0 ||
                  riderGuesses.length > 0 ||
                  decidingJoins.length > 0 ||
                  looseEnds.length > 0) && (
                  <div
                    className='mb-1.5 flex flex-col gap-1 border border-borderColor px-2 py-1.5'
                    data-skeleton-closure={closure?.ends.length ?? 0}
                  >
                    {closingJoins.length > 0 && (
                      <Text size='micro' component='p' data-skeleton-closing={closingJoins.length}>
                        <b>
                          ticked to close the order: {closingJoins.length === 1 ? 'step' : 'steps'}{' '}
                          {listNumbers(closingJoins)}
                        </b>
                        <span className='text-labelColor'>
                          {' '}
                          {closingJoins.length === 1 ? 'is a guess' : 'are guesses'} (the standard
                          order, no seam read) on the way to one finished garment. Check{' '}
                          {closingJoins.length === 1 ? 'it' : 'them'}; unticked, the order stops
                          short of the garment.
                        </span>
                      </Text>
                    )}
                    {ties.map((i) => {
                      const st = steps[i];
                      const vs = variantsOf(st);
                      return (
                        <div key={`tie${i}`} data-skeleton-tie={i}>
                          <Text size='micro' component='p'>
                            <b>to decide: «{st.label || st.outputUnitName}» is a tie</b>
                            <span className='text-labelColor'>
                              {' '}
                              — {st.decision?.tie}. Auto mode does not pick it, and the steps built
                              on it wait unticked: choose one, or tick the step to take the first.
                            </span>
                          </Text>
                          {vs.length > 1 && (
                            <ChipRow className='mt-0.5'>
                              {vs.map((v, vi) => (
                                <Chip
                                  key={vi}
                                  nonForm
                                  selected={false}
                                  disabled={readingsLocked}
                                  onClick={() =>
                                    vi === (st.decision?.chosen ?? 0)
                                      ? setAccepted(i, true)
                                      : chooseReading(st, vi)
                                  }
                                  title={`${v.reason} · choosing it ${
                                    vi === (st.decision?.chosen ?? 0)
                                      ? 'ticks this step'
                                      : 're-reads the steps after it'
                                  }`}
                                  data-skeleton-tie-variant={`${i}.${vi}`}
                                >
                                  {v.inputs.map(nameOf).join(' + ')}
                                </Chip>
                              ))}
                            </ChipRow>
                          )}
                        </div>
                      );
                    })}
                    {autoPicked.length > 0 && (
                      <div className='flex flex-col' data-skeleton-auto-notice={autoPicked.length}>
                        <Text size='micro' component='p'>
                          <b>
                            auto-picked: {autoPicked.length}{' '}
                            {autoPicked.length === 1 ? 'step' : 'steps'}
                          </b>
                          <span className='text-labelColor'>
                            {' '}
                            {autoPicked.length === 1 ? 'takes' : 'take'} the engine’s reading and{' '}
                            {autoPicked.length === 1 ? 'is' : 'are'} marked AUTO on the line. Check
                            them: flip a reading or untick to change.
                          </span>
                        </Text>
                        {autoKinds.map((g) => (
                          <Text
                            key={g.kind}
                            size='micro'
                            component='p'
                            data-skeleton-auto-kind={g.kind}
                            data-skeleton-auto-kind-n={g.idx.length}
                          >
                            <b className='tabular-nums'>
                              {g.idx.length === 1 ? 'step' : 'steps'} {listNumbers(g.idx)}
                            </b>
                            <span className='text-labelColor'> — {AUTO_KIND_WORDS[g.kind]}</span>
                          </Text>
                        ))}
                      </div>
                    )}
                    {riderGuesses.length > 0 && (
                      <Text
                        size='micro'
                        component='p'
                        data-skeleton-rider-guesses={riderGuesses.length}
                      >
                        <b>
                          ticked with their join: {riderGuesses.length === 1 ? 'step' : 'steps'}{' '}
                          {listNumbers(riderGuesses)}
                        </b>
                        <span className='text-labelColor'>
                          {' '}
                          {riderGuesses.length === 1 ? 'is a guess' : 'are guesses'} riding on{' '}
                          {autoMode ? 'their join' : 'a join the pattern did read'}. Check{' '}
                          {riderGuesses.length === 1 ? 'it' : 'them'}, or untick.
                        </span>
                      </Text>
                    )}
                    {decidingJoins.map((i) => {
                      const st = steps[i];
                      const vs = variantsOf(st);
                      return (
                        <div key={i} data-skeleton-deciding={i}>
                          <Text size='micro' component='p'>
                            <b>step {numbers.get(i) ?? stepNumber(i)} decides the order:</b>
                            <span className='text-labelColor'>
                              {' '}
                              {vs.length} readings are as likely as each other, and every step after
                              it follows the one picked. Pick it first:
                            </span>
                          </Text>
                          <ChipRow className='mt-0.5'>
                            {vs.map((v, vi) => (
                              <Chip
                                key={vi}
                                nonForm
                                selected={(st.decision?.chosen ?? 0) === vi}
                                disabled={readingsLocked}
                                onClick={() => chooseReading(st, vi)}
                                title={`${v.reason} · choosing it re-reads the steps after it`}
                                data-skeleton-deciding-variant={`${i}.${vi}`}
                              >
                                {v.inputs.map(nameOf).join(' + ')}
                              </Chip>
                            ))}
                          </ChipRow>
                        </div>
                      );
                    })}
                    {looseEnds.length > 0 && (
                      <Text size='micro' component='p' data-skeleton-loose-ends={looseEnds.length}>
                        <b>the proposal ends in {looseEnds.length} units, not one garment:</b>
                        <span className='text-labelColor'>
                          {' '}
                          {looseEnds.map(nameOf).join(', ')}. The pattern did not say how they meet;
                          join them by hand after applying.
                        </span>
                      </Text>
                    )}
                  </div>
                )}
                {steps.length === 0 && (
                  <Text size='micro' variant='label' component='p' data-skeleton-empty='1'>
                    no step to propose: the pattern gave nothing to join. The reasons are above
                  </Text>
                )}
                <div className='flex flex-col divide-y divide-hairline'>
                  {steps.map((raw, i) => {
                    if (!shown(raw)) return null;
                    const stored = picks[i] ?? defaultPick(raw);
                    // Under «replace» an applied step is rewritten with the rest: it reads as open.
                    const pick = replacing ? { ...stored, applied: false } : stored;
                    const s = raw;
                    const counted = pick.accepted && (!pick.applied || replacing);
                    const number = counted ? numbers.get(i) ?? null : null;
                    return (
                      <SkeletonLine
                        key={i}
                        index={i}
                        raw={raw}
                        step={s}
                        pick={pick}
                        number={number}
                        ctx={ctx}
                        nameOf={nameOf}
                        isPiece={(k) => pieceKeys.has(k)}
                        shapes={shapes}
                        cloth={cloth}
                        violations={counted ? batchViolations.get(i) ?? [] : []}
                        singleRefusal={
                          pick.applied
                            ? ''
                            : replacing
                              ? 'one step at a time adds at the end — switch to «add after»'
                              : singleRefusal(i)
                        }
                        unitSlot={
                          renderUnit && s.outputUnitKey
                            ? renderUnit(
                                s.outputUnitKey,
                                s.outputUnitName || s.outputUnitKey,
                                proposal,
                              )
                            : null
                        }
                        unitInput={
                          renderUnit ? (k: string) => renderUnit(k, nameOf(k), proposal) : undefined
                        }
                        unitSize={(k) => unitLeafCount.get(k) ?? 0}
                        follows={isDerived(raw) ? stepNumber(raw.derivedFrom!) : null}
                        readingsLocked={readingsLocked}
                        ai={
                          aiView
                            ? {
                                place: aiView.places[i]?.place ?? null,
                                now: ownPlace[i],
                                reason: aiView.places[i]?.reason ?? '',
                                warnings: aiView.warningsAt.get(i) ?? [],
                                // A pick on a decision that reads otherwise since the AI
                                // answered is not shown on any of its readings.
                                pick:
                                  raw.decision && !aiView.pins.stale.includes(raw.decision.id)
                                    ? aiView.picks.get(skeletonAIDecisionKey(raw.decision.id)) ??
                                      null
                                    : null,
                              }
                            : null
                        }
                        onAccept={(v) => setAccepted(i, v)}
                        onVariant={(v) => chooseReading(raw, v)}
                        rebuilding={rebuilding}
                        onApplyOne={() => {
                          if (!rebuilding) onApply([s], [i], 'append', shownGen);
                        }}
                      />
                    );
                  })}
                </div>

                {/* THE HONEST GAP. What the pattern did not give evidence for is named, not filled. */}
                {(leftOut.length > 0 ||
                  built.withoutContour.length > 0 ||
                  built.withoutKey.length > 0 ||
                  proposal.unresolved.length > 0) && (
                  <>
                    <GroupLabel>not in the skeleton</GroupLabel>
                    <div className='flex flex-col gap-1' data-skeleton-gaps='1'>
                      {leftOut.length > 0 && (
                        <div
                          className='flex flex-wrap items-center gap-1.5'
                          data-skeleton-leftout={leftOut.length}
                        >
                          <Text size='micro' variant='label' component='span' className='w-full'>
                            the pattern gave no evidence where these join — add their steps by hand
                          </Text>
                          {leftOut.map((k) => (
                            <PieceTile
                              key={k}
                              found={shapes.shapeByKey?.get(pieceRefKey(k)) ?? null}
                              name={nameOf(k)}
                              cloth={cloth?.get(k) ?? null}
                            />
                          ))}
                        </div>
                      )}
                      {built.withoutContour.length > 0 && (
                        <Text
                          size='micro'
                          variant='label'
                          component='p'
                          data-skeleton-nocontour={built.withoutContour.length}
                        >
                          no contour, so not read: {built.withoutContour.map(nameOf).join(', ')} —
                          match them to pattern blocks on the PATTERNS tab
                        </Text>
                      )}
                      {built.withoutKey.length > 0 && (
                        <Text
                          size='micro'
                          variant='label'
                          component='p'
                          data-skeleton-nokey={built.withoutKey.length}
                        >
                          no piece key yet, so no step can refer to them:{' '}
                          {built.withoutKey.join(', ')}. Save the card to give them keys
                        </Text>
                      )}
                      {proposal.unresolved.length > 0 && (
                        <Text
                          size='micro'
                          variant='label'
                          component='p'
                          data-skeleton-unresolved={proposal.unresolved.length}
                        >
                          {proposal.unresolved.length}{' '}
                          {proposal.unresolved.length === 1 ? 'edge pair' : 'edge pairs'} the
                          pattern could not decide between — left out rather than guessed
                        </Text>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          <div className='flex shrink-0 flex-wrap items-center gap-2 border-t border-borderColor px-2.5 py-1.5'>
            <Text
              size='micro'
              variant='label'
              component='span'
              className='min-w-0 flex-1'
              data-skeleton-footer='1'
            >
              {confirmReplace ? (
                <span data-skeleton-replace-loses={photosInForm}>
                  goes for good: {replaceLoses.join(' · ')}
                  {unitsGo ? ' (the new steps make no units)' : ''}
                  {' · undo is available until the next save'}
                </span>
              ) : result?.refused ? (
                <span className='text-error' data-skeleton-refused='1'>
                  not applied — {result.refused}
                </span>
              ) : result?.undoRefused ? (
                <span className='text-error' data-skeleton-undo-refused='1'>
                  not undone — {result.undoRefused}
                </span>
              ) : result?.undone ? (
                <span data-skeleton-undone={result.undone}>
                  {result.undone} {result.undone === 1 ? 'step' : 'steps'} taken back — the steps,
                  photos and units are as they were before the apply
                </span>
              ) : result && result.applied > 0 ? (
                <span data-skeleton-applied={result.applied}>
                  {result.applied} {result.applied === 1 ? 'step' : 'steps'} added — the rail marks
                  them “draft” until you change them or mark them reviewed
                  {undoable ? ' · undo takes the whole batch back' : ''}
                </span>
              ) : (
                'seam types, work and minutes stay empty — they are yours to fill · esc — close'
              )}
            </Text>
            {undoable && (
              <Button
                type='button'
                variant='secondary'
                size='sm'
                onClick={onUndo}
                data-skeleton-undo={result?.nonce}
                title='take back every step this apply wrote; photos and units come back as they were'
              >
                undo
              </Button>
            )}
            {batchViolations.size > 0 && (
              <Text
                size='micro'
                variant='error'
                component='span'
                data-skeleton-blocked={batchViolations.size}
              >
                ! {batchViolations.size}{' '}
                {batchViolations.size === 1 ? 'step breaks' : 'steps break'} the order
              </Text>
            )}
            {confirmReplace && (
              <Button
                type='button'
                variant='secondary'
                size='sm'
                onClick={() => setConfirmReplace(false)}
              >
                keep the steps
              </Button>
            )}
            <Button
              type='button'
              variant='main'
              size='sm'
              disabled={
                !proposal || rebuilding || batch.steps.length === 0 || batchViolations.size > 0
              }
              onClick={applyAll}
              data-skeleton-apply-all={batch.steps.length}
              data-skeleton-rebuilding={rebuilding ? '1' : undefined}
              title={rebuilding ? 'rebuilding around the chosen reading…' : undefined}
            >
              {rebuilding
                ? 'rebuilding…'
                : confirmReplace
                  ? `replace ${existing} with ${batch.steps.length} — confirm`
                  : effectiveMode === 'replace'
                    ? `replace with ${batch.steps.length} accepted`
                    : `apply all accepted (${batch.steps.length})`}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── add or replace ──────────────────────────────────────────────────────────────────────────────

/**
 * THE CHOICE A CARD WITH STEPS ASKS FIRST. Two ruled lines, one per mode, each saying what it reads
 * and what it costs; nothing is read until one is pressed, and the chosen one stays inked as the
 * switch. «Add» names how many pieces are still out of the order; «replace» names what goes.
 */
function ModeChoice({
  mode,
  existing,
  openPieces,
  replaceLoses,
  onChoose,
}: {
  mode: SkeletonMode | null;
  existing: number;
  openPieces: number;
  replaceLoses: string[];
  onChoose: (m: SkeletonMode) => void;
}) {
  const steps = `${existing} ${existing === 1 ? 'step' : 'steps'}`;
  const options: { id: SkeletonMode; title: string; detail: string }[] = [
    {
      id: 'append',
      title: `add to the ${steps}`,
      detail:
        openPieces === 0
          ? 'every piece is already in the order: nothing to add'
          : `reads only the ${openPieces} ${openPieces === 1 ? 'piece' : 'pieces'} not in the order yet; your steps and units stay as they are`,
    },
    {
      id: 'replace',
      title: `replace the ${steps}`,
      detail: `reads the whole pattern and starts over. Goes when you apply: ${replaceLoses.join(' · ')}`,
    },
  ];
  return (
    <div className='mb-2' data-skeleton-modes={mode ?? 'unchosen'}>
      {!mode && (
        <Text size='micro' variant='label' component='p' className='mb-1'>
          the card already has an order. Choose how the skeleton meets it:
        </Text>
      )}
      <div
        role='radiogroup'
        aria-label='add or replace'
        className='flex flex-col gap-1 sm:flex-row'
      >
        {options.map((o) => {
          const on = mode === o.id;
          return (
            <button
              key={o.id}
              type='button'
              role='radio'
              aria-checked={on}
              onClick={() => onChoose(o.id)}
              data-skeleton-mode={o.id}
              className={cn(
                'flex flex-1 flex-col items-start gap-0.5 border px-2 py-1 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
                on
                  ? 'border-textColor bg-textColor text-bgColor'
                  : 'border-borderColor hover:border-textColor',
              )}
            >
              <Text size='micro' variant='uppercase' component='span' className='font-bold'>
                {on ? '● ' : '○ '}
                {o.title}
              </Text>
              <Text
                size='micro'
                component='span'
                className={on ? 'text-bgColor' : 'text-labelColor'}
              >
                {o.detail}
              </Text>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── one step ────────────────────────────────────────────────────────────────────────────────────

/**
 * ONE LINE: `[✓] № · inputs → unit · [pictogram] · confidence · [apply this step]`, then the words:
 * what it does on what, why the pattern thinks so, «check», «?» readings, and any rule it breaks.
 */
function SkeletonLine({
  index,
  raw,
  step,
  pick,
  number,
  ctx,
  nameOf,
  isPiece,
  shapes,
  cloth,
  violations,
  singleRefusal,
  unitSlot,
  unitInput,
  unitSize,
  follows,
  readingsLocked,
  ai,
  onAccept,
  onVariant,
  onApplyOne,
  rebuilding,
}: {
  index: number;
  raw: SkeletonStep;
  step: SkeletonStep;
  pick: StepPick;
  number: number | null;
  ctx: SkeletonRowContext;
  nameOf: (k: string) => string;
  isPiece: (k: string) => boolean;
  shapes: PieceShapes;
  cloth: ReadonlyMap<string, PieceCloth> | null;
  violations: string[];
  singleRefusal: string;
  unitSlot: ReactNode;
  /** An earlier unit taken as an input, drawn as its pictogram; null → the plain «▣ key» tile. */
  unitInput?: (unitKey: string) => ReactNode;
  /** How many pieces an earlier unit holds (a unit above the pictogram cap is said, not blank). */
  unitSize?: (unitKey: string) => number;
  /** The number of the join this step rides on («30»), or null for a step of its own. */
  follows: string | null;
  /** A step of this proposal is already in the order: the readings can no longer change. */
  readingsLocked: boolean;
  /** The AI's second opinion on this step, or null when none was asked. */
  ai: SkeletonLineAI | null;
  onAccept: (v: boolean) => void;
  onVariant: (v: number) => void;
  onApplyOne: () => void;
  /** A chosen reading is being read in: this line is the old reading's, not to be applied. */
  rebuilding: boolean;
}) {
  const ambiguous = isAmbiguous(raw);
  const variants = variantsOf(raw);
  const op = operationWords(step, ctx);
  const evidence = step.seams.map(seamWords).filter(Boolean);
  const why = [
    ...evidence,
    step.reason,
    evidence.length === 0 ? SOURCE_WORD[step.source] : '',
  ].filter(Boolean);
  const word = confidenceWord(step.confidence);

  return (
    <div
      data-skeleton-step={index}
      data-skeleton-accepted={pick.accepted ? '1' : '0'}
      data-skeleton-step-applied={pick.applied ? '1' : undefined}
      className={cn(
        'flex flex-wrap items-center gap-x-2 gap-y-1 px-1 py-1.5',
        (pick.applied || !pick.accepted) && 'text-labelColor',
      )}
    >
      <CheckboxCommon
        name={`skeleton-accept-${index}`}
        aria-label={`keep step ${index + 1}`}
        checked={pick.accepted && !pick.applied}
        disabled={pick.applied}
        onChange={(v) => onAccept(v === true)}
        className='focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
        data-skeleton-check={index}
      />
      <Text size='control' component='span' className='w-6 shrink-0 font-bold tabular-nums'>
        {pick.applied ? '✓' : number ?? '—'}
      </Text>

      <span className='flex shrink-0 items-center gap-1'>
        {step.inputs.map((k, j) => (
          <span key={`${k}-${j}`} className='flex items-center gap-1'>
            {j > 0 && (
              <Text size='micro' variant='label' component='span'>
                +
              </Text>
            )}
            {/* A piece is drawn from the pattern; a unit made earlier by its pictogram — its pieces
                laid along their seams — or, with none, as an empty tile with its code. */}
            {isPiece(k) ? (
              <PieceTile
                found={shapes.shapeByKey?.get(pieceRefKey(k)) ?? null}
                name={nameOf(k)}
                cloth={cloth?.get(k) ?? null}
              />
            ) : unitInput?.(k) ? (
              <span className='contents' data-skeleton-unit-input={k}>
                {unitInput(k)}
              </span>
            ) : (unitSize?.(k) ?? 0) > UNIT_PICTO_MAX ? (
              // Too many pieces for a glyph (the pictograms stop at 16): said, not left blank.
              <span
                className='relative flex size-14 shrink-0 flex-col items-center justify-center border border-dashed border-borderColor bg-bgColor pb-3'
                title={`${nameOf(k)} (${k}): ${unitSize!(k)} pieces, too many for a pictogram`}
                data-skeleton-unit-big={k}
              >
                <Text size='control' component='span' className='font-bold tabular-nums'>
                  {unitSize!(k)}
                </Text>
                <Text size='nano' variant='label' component='span' className='uppercase'>
                  pieces
                </Text>
                <span className='absolute inset-x-0 bottom-0 truncate px-0.5 text-center text-nano leading-[1.35] tracking-pill uppercase'>
                  ▣ {k}
                </span>
              </span>
            ) : (
              // Unit codes are short and the schematic prints them with «▣» — the same mark here.
              <PieceTile
                found={null}
                name={`▣ ${k}`}
                className='bg-bgColor outline outline-1 -outline-offset-1 outline-borderColor'
              />
            )}
          </span>
        ))}
      </span>

      <Text size='control' component='span' className='min-w-[9rem] flex-1'>
        {step.outputUnitKey ? (
          <>
            → <b>{step.outputUnitName || step.outputUnitKey}</b>{' '}
            <span className='text-labelColor'>{step.outputUnitKey}</span>
          </>
        ) : (
          <span className='text-labelColor'>processing — stays on the table</span>
        )}
      </Text>

      {unitSlot ? (
        <span className='shrink-0' data-skeleton-unit={index}>
          {unitSlot}
        </span>
      ) : null}

      {follows != null ? (
        // A rider is not a decision: it says which join it goes with instead of how sure it is.
        <Text
          size='micro'
          variant='label'
          component='span'
          className='shrink-0 uppercase'
          data-skeleton-follows={index}
          title='rides on that join: ticked and unticked with it'
        >
          ↳ with {follows}
        </Text>
      ) : (
        <Text
          size='micro'
          variant='label'
          component='span'
          className={cn('shrink-0 uppercase', word === 'sure' && 'text-textColor')}
          data-skeleton-confidence={index}
        >
          {word}
        </Text>
      )}
      {ai?.place != null && (
        <Pill
          tone={ai.place !== ai.now ? 'attention' : 'mut'}
          className='shrink-0'
          data-skeleton-ai-place={`${index}:${ai.place}`}
          title={`${
            ai.place !== ai.now
              ? `the AI sews this ${ordinal(ai.place)} (now ${ordinal(ai.now ?? 0)})`
              : 'the AI keeps it here'
          }${ai.reason ? `: ${ai.reason}` : ''}`}
        >
          AI {ai.place !== ai.now ? `→ ${ai.place}` : '='}
        </Pill>
      )}
      {ambiguous && (
        <Text
          size='control'
          component='span'
          className='shrink-0 font-bold'
          title='two readings — the first is preselected'
        >
          ?
        </Text>
      )}
      {pick.auto && pick.accepted && !pick.applied && (
        <Pill
          tone='mut'
          className='shrink-0'
          data-skeleton-step-auto={index}
          title='picked by auto mode at the engine’s reading — untick or flip a reading to change'
        >
          auto
        </Pill>
      )}
      <Button
        type='button'
        variant='secondary'
        size='xs'
        disabled={pick.applied || !!singleRefusal || rebuilding}
        title={
          rebuilding
            ? 'rebuilding around the chosen reading…'
            : singleRefusal || 'add only this step at the end of the order'
        }
        onClick={onApplyOne}
        data-skeleton-apply-one={index}
      >
        {pick.applied ? 'applied' : 'apply this step'}
      </Button>

      <Text size='micro' variant='label' component='span' className='w-full pl-[3.25rem]'>
        {op.text}
        {op.check && (
          <>
            {' · '}
            <span
              className='text-warning'
              data-skeleton-checkflag={index}
              title='the server needs a machine or a press on every sewn or pressed step; the pattern does not say which, so the card default (or the obvious tool) stands in until you check it'
            >
              {op.check}
            </span>
          </>
        )}
      </Text>
      {why.length > 0 && (
        <Text
          size='micro'
          variant='label'
          component='span'
          className='w-full pl-[3.25rem]'
          data-skeleton-evidence={index}
        >
          {why.join(' · ')}
        </Text>
      )}
      {ambiguous && variants.length > 1 && (
        <div className='w-full pl-[3.25rem]' data-skeleton-variants={index}>
          <ChipRow>
            <Text size='micro' variant='label' component='span'>
              ? which join —
            </Text>
            {variants.map((v, vi) => (
              <Chip
                key={vi}
                nonForm
                tone={ai?.pick?.reading === vi ? 'attention' : undefined}
                selected={(raw.decision?.chosen ?? 0) === vi}
                disabled={!raw.decision || readingsLocked}
                onClick={() => onVariant(vi)}
                title={
                  readingsLocked
                    ? 'a step of this skeleton is already in the order; switch to «replace» to choose again'
                    : `${ai?.pick?.reading === vi ? `the AI picks this: ${ai.pick.reason ?? ''} · ` : ''}${v.reason} · choosing it re-reads the steps after it`
                }
                data-skeleton-variant={`${index}.${vi}`}
                data-skeleton-ai-pick={ai?.pick?.reading === vi ? '1' : undefined}
              >
                {v.inputs.map(nameOf).join(' + ')}
                {ai?.pick?.reading === vi ? ' · AI' : ''}
              </Chip>
            ))}
          </ChipRow>
        </div>
      )}
      {pick.tie && !pick.accepted && !pick.applied && (
        <Text
          size='micro'
          variant='label'
          component='span'
          className='w-full pl-[3.25rem]'
          data-skeleton-step-tie={index}
        >
          a tie, left for you: {raw.decision?.tie ?? 'the readings are alike'} — tick it, or choose
          a reading
        </Text>
      )}
      {pick.accepted &&
        ((pick.auto && !pick.applied) ||
          (step.confidence < SKELETON.accept && (follows == null || autoGuess(pick)))) && (
          <Text
            size='micro'
            variant='label'
            component='span'
            className='w-full pl-[3.25rem]'
            data-skeleton-step-closing={pick.closing ? index : undefined}
            data-skeleton-step-autoguess={autoGuess(pick) ? index : undefined}
          >
            {pick.auto
              ? `auto-picked: ${AUTO_KIND_WORDS[autoKindOf(step)]} — check it`
              : pick.closing
                ? 'a guess, ticked to close the order: check it'
                : pick.withJoin
                  ? 'a guess, ticked with its join: check it'
                  : 'a guess — kept because you ticked it'}
          </Text>
        )}
      {ai?.warnings.map((m, wi) => (
        <Text
          key={`ai${wi}`}
          size='micro'
          component='span'
          className='w-full pl-[3.25rem] text-warning'
          data-skeleton-ai-warning={index}
        >
          AI: {m}
        </Text>
      ))}
      {violations.map((m, vi) => (
        <Text
          key={vi}
          size='micro'
          variant='error'
          component='span'
          className='w-full pl-[3.25rem]'
          data-skeleton-violation={index}
        >
          ! {m}
        </Text>
      ))}
    </div>
  );
}

/** The AI's second opinion on one step line. */
type SkeletonLineAI = {
  /** The AI's place for the step among the steps that stand on their own; null = not placed. */
  place: number | null;
  /** The step's place now, on the same count; null for a rider. */
  now: number | null;
  reason: string;
  warnings: string[];
  pick: { reading?: number; reason?: string } | null;
};

const ordinal = (n: number) => {
  const t = n % 100;
  const suf = t >= 11 && t <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suf}`;
};
