// The wizard as the operator names it: FIVE stages over the nine internal steps (import-ux
// 02-FABLE §3.1). The internal STEPS stay (dropAfter, passed, ANSWERS, replay keys key on them);
// this file only says which stage a step belongs to, what the stepper draws for it, and what the
// footer's one primary button says.
import { createContext, useContext, useEffect, useRef } from 'react';
import type { StageName, WizardStep } from 'lib/pattern-import/types';

export type StageKey = 'file' | 'scale' | 'sizes' | 'pieces' | 'card';

export const STAGES: { key: StageKey; label: string; steps: WizardStep[] }[] = [
  { key: 'file', label: 'file', steps: ['files'] },
  { key: 'scale', label: 'scale & sheet', steps: ['scale', 'sheet'] },
  { key: 'sizes', label: 'sizes', steps: ['sizes'] },
  { key: 'pieces', label: 'pieces', steps: ['pieces', 'meaning', 'fabrics'] },
  { key: 'card', label: 'card', steps: ['check', 'apply'] },
];

export const STAGE_OF_STEP = Object.fromEntries(
  STAGES.flatMap((st) => st.steps.map((s) => [s, st])),
) as Record<WizardStep, (typeof STAGES)[number]>;

/** One glyph per state: ✓ done, grey ✓ passed by itself, ! needs you, … working; none = free / ahead. */
export type StageState = 'done' | 'auto' | 'asks' | 'working' | 'current' | 'ahead';
export const STAGE_GLYPH: Record<StageState, string> = {
  done: '✓',
  auto: '✓',
  asks: '!',
  working: '…',
  current: '',
  ahead: '',
};

/**
 * The parsing state's words: four phases a person can follow (Codex #6), the engine's stage as the
 * detail under it. No percentage across phases — each stage reports its own done / total.
 */
export const PHASE_OF: Record<StageName, string> = {
  extract: 'reading the files',
  clean: 'reading the files',
  'render-pages': 'reading the files',
  scale: 'building the sheet',
  assemble: 'building the sheet',
  chains: 'tracing lines and pieces',
  sizes: 'tracing lines and pieces',
  pieces: 'tracing lines and pieces',
  'render-som': 'naming and writing',
  semantics: 'naming and writing',
  fabrics: 'naming and writing',
  write: 'naming and writing',
} as Record<StageName, string>;

export const STAGE_WORD: Record<string, string> = {
  extract: 'reading files',
  clean: 'setting aside page furniture',
  scale: 'applying scale',
  assemble: 'assembling the sheet',
  chains: 'tracing lines',
  sizes: 'reading sizes',
  pieces: 'finding pieces',
  'render-som': 'naming pieces',
  'render-pages': 'drawing the pages for the AI',
  semantics: 'building pieces',
  fabrics: 'proposing fabrics',
  write: 'writing DXF + gate',
};

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ═══ PRIMARY OVERRIDE ═════════════════════════════════════════════════════════════════════════════
//
// The footer's primary is derived from the session (see `primaryLabel` in import-wizard.tsx). A
// step that holds state the session does not have yet — the files step's STAGED files, before they
// are read — may take the primary over while it is mounted:
//
//   useWizardPrimary(staged.length && !read ? { label: `read ${plural(staged.length, 'file')}`,
//     onClick: () => api.dispatch({ type: 'files', files: staged }) } : null);
//
// `null` hands it back. The override is ignored while a stage runs (the shell shows the parsing
// state's word instead).
export type PrimaryOverride = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
};

export const WizardPrimaryContext = createContext<(p: PrimaryOverride | null) => void>(() => {});

export function useWizardPrimary(p: PrimaryOverride | null) {
  const set = useContext(WizardPrimaryContext);
  // the click is read at click time: a new closure per render must not re-publish the override
  // (that would re-render the shell, re-render the step, … for ever)
  const click = useRef(p?.onClick);
  click.current = p?.onClick;
  const on = !!p;
  const label = p?.label;
  const disabled = p?.disabled;
  const title = p?.title;
  useEffect(() => {
    set(on && label != null ? { label, onClick: () => click.current?.(), disabled, title } : null);
  }, [set, on, label, disabled, title]);
  useEffect(() => () => set(null), [set]);
}
