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
  SKELETON,
  type SeamCandidate,
  type SkeletonDeps,
  type SkeletonFacts,
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
import { HeaderNote } from 'ui/components/section-header';
import Text from 'ui/components/text';

import { assemblySweep, classifyAssemblyInputs, type AssemblyStep } from './assembly-frontier';
import { makeSkeletonDeps } from './assembly-skeleton-deps';
import {
  buildSkeletonFacts,
  skeletonCategoryOf,
  skeletonGate,
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
} from './operations-field';
import { pieceRefKey } from './piece-block-refs';
import type { PieceCloth } from './piece-cloth';
import { PieceTile } from './piece-silhouette';
import type { TechCardFormData } from './schema';
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

const variantsOf = (s: SkeletonStep): Variant[] => [
  { inputs: s.inputs, seams: s.seams, reason: s.reason },
  ...(s.alternatives ?? []),
];

const isAmbiguous = (s: SkeletonStep): boolean =>
  (s.alternatives?.length ?? 0) > 0 || s.seams.some((c) => (c.ambiguousWith?.length ?? 0) > 0);

/** The step as it will be written: the chosen reading's inputs and seams. */
const resolveStep = (s: SkeletonStep, variant: number): SkeletonStep => {
  if (variant <= 0) return s;
  const v = variantsOf(s)[variant];
  return v ? { ...s, inputs: v.inputs, seams: v.seams, reason: v.reason } : s;
};

type StepPick = { accepted: boolean; variant: number; applied: boolean };

const defaultPick = (s: SkeletonStep): StepPick => ({
  // A guess is shown, not applied: it stays unticked until a person ticks it.
  accepted: s.confidence >= SKELETON.accept,
  variant: 0,
  applied: false,
});

/**
 * Default picks for a whole proposal: a sure step whose input is a unit made by an UNTICKED step
 * (the final press on «Shirt» when «Set sleeves» is a guess) is unticked too — ticked, it would
 * refer to a unit the batch never makes, and «apply all accepted» would refuse the whole batch.
 */
const defaultPicks = (steps: readonly SkeletonStep[]): StepPick[] => {
  const madeBy = new Map<string, number>();
  const picks: StepPick[] = [];
  steps.forEach((s, i) => {
    const pick = defaultPick(s);
    if (pick.accepted)
      pick.accepted = s.inputs.every((k) => {
        const j = madeBy.get(k);
        return j === undefined || picks[j].accepted;
      });
    picks.push(pick);
    if (s.outputUnitKey) madeBy.set(s.outputUnitKey, i);
  });
  return picks;
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
}: {
  frozen: boolean;
  shapes: PieceShapes;
  /** Cloth of each piece (first colourway), keyed by the piece's lineKey. */
  cloth: ReadonlyMap<string, PieceCloth> | null;
  /** The card's category chain, leaf first — picks the order template. */
  categoryNames: ReadonlyArray<string>;
  renderUnit?: RenderUnit;
}): {
  headerAction: ReactNode;
  emptyAction: ReactNode;
  panel: ReactNode;
  applyRequest: SkeletonApplyRequest | null;
  onSkeletonApplied: (r: SkeletonApplyResult) => void;
} {
  const proposal = useSkeletonProposal();
  const gate = skeletonGate({
    frozen,
    hasDxf: shapes.hasDxf,
    shapes: shapes.shapeByKey,
    available: proposal.available,
  });
  const [open, setOpen] = useState(false);
  const [applyRequest, setApplyRequest] = useState<SkeletonApplyRequest | null>(null);
  const [result, setResult] = useState<SkeletonApplyResult | null>(null);
  const [picks, setPicks] = useState<StepPick[]>([]);

  // A fresh proposal gets fresh picks; the same proposal keeps them across close/open.
  const ready = proposal.state.status === 'ready' ? proposal.state.proposal : null;
  useEffect(() => {
    setPicks(ready ? defaultPicks(ready.steps) : []);
  }, [ready]);

  // Which proposal steps each request carried, so its answer marks exactly those as applied.
  const [carried, setCarried] = useState<{ nonce: number; idx: number[]; replace: boolean } | null>(
    null,
  );
  const nonceRef = useRef(0);
  const request = useCallback(
    (
      steps: SkeletonStep[],
      idx: number[],
      mode: 'append' | 'replace',
      confirmedReplace = false,
    ) => {
      setResult(null);
      const nonce = (nonceRef.current += 1);
      setCarried({ nonce, idx, replace: mode === 'replace' });
      setApplyRequest({ steps, mode, confirmedReplace, nonce });
    },
    [],
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
          shapes={shapes}
          cloth={cloth}
          categoryNames={categoryNames}
          picks={picks}
          onPicks={setPicks}
          onApply={request}
          result={result}
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
      setPicks((prev) =>
        prev.map((p, i) =>
          done.has(i) ? { ...p, applied: true } : carried.replace ? { ...p, applied: false } : p,
        ),
      );
    },
  };
}

// ── the panel ───────────────────────────────────────────────────────────────────────────────────

function AssemblySkeletonPanel({
  run,
  onRun,
  shapes,
  cloth,
  categoryNames,
  picks,
  onPicks,
  onApply,
  result,
  renderUnit,
  onClose,
}: {
  run: SkeletonRun;
  onRun: (facts: SkeletonFacts, deps?: SkeletonDeps) => void;
  shapes: PieceShapes;
  cloth: ReadonlyMap<string, PieceCloth> | null;
  categoryNames: ReadonlyArray<string>;
  picks: StepPick[];
  onPicks: (next: StepPick[] | ((prev: StepPick[]) => StepPick[])) => void;
  onApply: (
    steps: SkeletonStep[],
    idx: number[],
    mode: 'append' | 'replace',
    confirmedReplace?: boolean,
  ) => void;
  result: SkeletonApplyResult | null;
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

  const built = useMemo(() => {
    const hasLining = [...(cloth?.values() ?? [])].some((c) => c.state === 'lining');
    return buildSkeletonFacts({
      pieces: formPieces ?? [],
      shapes: shapes.shapeByKey,
      cloth,
      bomLines: (bomItems ?? []) as Parameters<typeof buildSkeletonFacts>[0]['bomLines'],
      category: skeletonCategoryOf(categoryNames, hasLining),
      defaultMachineType:
        (park?.machines ?? []).find(
          (m) => m.machineType && m.machineType !== 'TECH_CARD_MACHINE_TYPE_UNKNOWN',
        )?.machineType ?? null,
    });
  }, [formPieces, bomItems, shapes.shapeByKey, cloth, categoryNames, park]);

  // The card's own deps: zones read its BOM and piece↔block links (lining steps → LINING zone).
  const deps = useMemo(
    () =>
      makeSkeletonDeps({
        bomLines: (bomItems ?? []) as InferenceBomLine[],
        aliases,
      }),
    [bomItems, aliases],
  );

  // Opening the panel the first time reads the pattern; reopening shows what was read.
  useEffect(() => {
    if (run.status === 'idle') onRun(built.facts, deps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pieceName = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of formPieces ?? []) if (p.lineKey) m.set(p.lineKey, p.name?.trim() || p.lineKey);
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

  const proposal = run.status === 'ready' ? run.proposal : null;
  const [pressOpen, setPressOpen] = useState(true);
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [confirmReplace, setConfirmReplace] = useState(false);
  const existing = operations.length;
  const effectiveMode = existing === 0 ? 'append' : mode;
  const replacing = effectiveMode === 'replace';

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
    return { idx, steps: idx.map((i) => resolveStep(proposal.steps[i], picks[i].variant)) };
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
      byStep.set(i, [...(byStep.get(i) ?? []), v.message]);
    }
    return byStep;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch, formSteps, sweepPieces, effectiveMode]);

  /** Why «apply this step» alone would break the order now, or '' when it would not. */
  const singleRefusal = (i: number): string => {
    if (!proposal) return '';
    const s = resolveStep(proposal.steps[i], picks[i]?.variant ?? 0);
    const res = assemblySweep(sweepPieces, [...formSteps, asAssembly(s)]);
    const v = res.violations.find((x) => x.rule !== 4 && x.step === formSteps.length);
    return v ? v.message : '';
  };

  const usedPieces = useMemo(() => {
    const used = new Set<string>();
    proposal?.steps.forEach((s, i) =>
      resolveStep(s, picks[i]?.variant ?? 0).inputs.forEach((k) => used.add(k)),
    );
    return used;
  }, [proposal, picks]);
  const leftOut = built.facts.pieces.map((p) => p.pieceKey).filter((k) => !usedPieces.has(k));

  const setPick = (i: number, patch: Partial<StepPick>) =>
    onPicks((prev) => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  const applyAll = () => {
    if (batch.steps.length === 0) return;
    if (effectiveMode === 'replace' && !confirmReplace) {
      setConfirmReplace(true);
      return;
    }
    onApply(batch.steps, batch.idx, effectiveMode, effectiveMode === 'replace');
    setConfirmReplace(false);
  };

  const steps = proposal?.steps ?? [];
  const toCheck = steps.filter(
    (s, i) => shown(s) && (isAmbiguous(s) || (picks[i] && !picks[i].accepted)),
  ).length;
  let nextNumber = base;

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
              >
                {steps.length} {steps.length === 1 ? 'step' : 'steps'}
                {toCheck > 0 ? ` · ${toCheck} to decide` : ''} · read off the pattern, nothing
                written yet
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
            {run.status === 'running' && (
              <Text size='micro' variant='label' component='p' data-skeleton-state='running'>
                reading the pattern — edges, notches, mirror pairs…
              </Text>
            )}
            {run.status === 'error' && (
              <div className='flex items-center gap-2' data-skeleton-state='error'>
                <Text size='micro' variant='error' component='span'>
                  the pattern could not be read: {run.message}
                </Text>
                <Button
                  type='button'
                  variant='secondary'
                  size='xs'
                  onClick={() => onRun(built.facts, deps)}
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
                  <Chip
                    nonForm
                    selected={pressOpen}
                    onClick={() => setPressOpen((v) => !v)}
                    title='insert «press open» after each join, as most cards press seams before crossing them'
                    data-skeleton-press={pressOpen ? 'on' : 'off'}
                  >
                    {pressOpen ? '✓ ' : ''}press open after joins
                  </Chip>
                  {existing > 0 && (
                    <>
                      <Chip
                        nonForm
                        selected={mode === 'append'}
                        onClick={() => {
                          setMode('append');
                          setConfirmReplace(false);
                        }}
                        data-skeleton-mode='append'
                      >
                        add after step {existing * 10}
                      </Chip>
                      <Chip
                        nonForm
                        selected={mode === 'replace'}
                        onClick={() => setMode('replace')}
                        data-skeleton-mode='replace'
                      >
                        replace the {existing} {existing === 1 ? 'step' : 'steps'}
                      </Chip>
                    </>
                  )}
                </ChipRow>
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

                <div className='flex flex-col divide-y divide-hairline'>
                  {steps.map((raw, i) => {
                    if (!shown(raw)) return null;
                    const stored = picks[i] ?? defaultPick(raw);
                    // Under «replace» an applied step is rewritten with the rest: it reads as open.
                    const pick = replacing ? { ...stored, applied: false } : stored;
                    const s = resolveStep(raw, pick.variant);
                    const counted = pick.accepted && (!pick.applied || replacing);
                    const number = counted ? (nextNumber += 1) * 10 : null;
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
                        onAccept={(v) => setPick(i, { accepted: v })}
                        onVariant={(v) => setPick(i, { variant: v })}
                        onApplyOne={() => onApply([s], [i], 'append')}
                      />
                    );
                  })}
                </div>

                {/* THE HONEST GAP. What the pattern did not give evidence for is named, not filled. */}
                {(leftOut.length > 0 ||
                  built.withoutContour.length > 0 ||
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
              {result?.refused ? (
                <span className='text-error' data-skeleton-refused='1'>
                  not applied — {result.refused}
                </span>
              ) : result && result.applied > 0 ? (
                <span data-skeleton-applied={result.applied}>
                  {result.applied} {result.applied === 1 ? 'step' : 'steps'} added — ordinary steps
                  now; the rail marks them “draft” until you change them
                </span>
              ) : (
                'seam types, work and minutes stay empty — they are yours to fill · esc — close'
              )}
            </Text>
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
              disabled={!proposal || batch.steps.length === 0 || batchViolations.size > 0}
              onClick={applyAll}
              data-skeleton-apply-all={batch.steps.length}
            >
              {confirmReplace
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
  onAccept,
  onVariant,
  onApplyOne,
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
  onAccept: (v: boolean) => void;
  onVariant: (v: number) => void;
  onApplyOne: () => void;
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

      <Text
        size='micro'
        variant='label'
        component='span'
        className={cn('shrink-0 uppercase', word === 'sure' && 'text-textColor')}
        data-skeleton-confidence={index}
      >
        {word}
      </Text>
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
      <Button
        type='button'
        variant='secondary'
        size='xs'
        disabled={pick.applied || !!singleRefusal}
        title={singleRefusal || 'add only this step at the end of the order'}
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
                selected={pick.variant === vi}
                onClick={() => onVariant(vi)}
                title={v.reason}
                data-skeleton-variant={`${index}.${vi}`}
              >
                {v.inputs.map(nameOf).join(' + ')}
              </Chip>
            ))}
          </ChipRow>
        </div>
      )}
      {pick.accepted && step.confidence < SKELETON.accept && (
        <Text size='micro' variant='label' component='span' className='w-full pl-[3.25rem]'>
          a guess — kept because you ticked it
        </Text>
      )}
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
