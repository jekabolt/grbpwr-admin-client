// A10 · AUTOPILOT — what the autopilot assumed, as the operator reads it: strong ones first, each
// a row (step · what · the answer) with, in the wizard, a door back to its step. The card's
// Patterns tab shows the same list read-only, off the sheet's manifest. DESIGN.md: rows on hairline
// rules under a GroupLabel, tone only in a Pill — no box inside the block.
import { useState } from 'react';
import type { AutopilotAssumption, WizardStep } from 'lib/pattern-import/types';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';

const STEP_WORD: Record<string, string> = {
  files: 'files',
  scale: 'scale',
  sheet: 'sheet',
  sizes: 'sizes',
  pieces: 'pieces',
  meaning: 'details',
  fabrics: 'fabrics',
  check: 'check',
  apply: 'apply',
};

/** "autopilot · 12 assumptions (3 strong)". */
export function autopilotSummary(list: readonly Pick<AutopilotAssumption, 'strong'>[]): string {
  const k = list.filter((a) => a.strong).length;
  return `autopilot · ${list.length} ${list.length === 1 ? 'assumption' : 'assumptions'}${k ? ` (${k} strong)` : ''}`;
}

/** Strong first, then by step order as they were given. */
const ordered = <A extends Pick<AutopilotAssumption, 'strong'>>(xs: readonly A[]) =>
  xs
    .map((a, k) => ({ a, k }))
    .sort((x, y) => Number(y.a.strong) - Number(x.a.strong) || x.k - y.k)
    .map((x) => x.a);

export function AssumptionList({
  assumptions,
  onDoor,
  limit = 12,
  flush = true,
}: {
  assumptions: readonly AutopilotAssumption[];
  /** The wizard: a door back to the step the answer was given on. Absent = read-only. */
  onDoor?: (step: WizardStep) => void;
  limit?: number;
  flush?: boolean;
}) {
  const [all, setAll] = useState(false);
  if (!assumptions.length) return null;
  const xs = ordered(assumptions);
  const shown = all ? xs : xs.slice(0, limit);
  return (
    <div data-autopilot-assumptions=''>
      <GroupLabel flush={flush}>{autopilotSummary(assumptions)}</GroupLabel>
      {shown.map((a, k) => (
        <Row
          key={`${a.kind}|${a.subject}|${k}`}
          label={
            <span className='flex flex-wrap items-center gap-1.5'>
              {a.strong && (
                <Pill tone='attention' title='a default the drawing gives no evidence for'>
                  strong
                </Pill>
              )}
              <Text size='micro' component='span' title={`${a.rule} — ${a.evidence.join(' · ')}`}>
                {STEP_WORD[a.step] ?? a.step} · {a.subject} {a.answer.startsWith('→') ? '' : '→ '}
                {a.answer}
              </Text>
            </span>
          }
          value={
            onDoor && STEP_WORD[a.step] ? (
              <Button
                type='button'
                variant='underline'
                size='xs'
                onClick={() => onDoor(a.step as WizardStep)}
                title={`back to ${STEP_WORD[a.step]} — change this answer there`}
              >
                {STEP_WORD[a.step]}
              </Button>
            ) : undefined
          }
        />
      ))}
      {xs.length > limit && (
        <Button type='button' variant='underline' size='xs' onClick={() => setAll((v) => !v)}>
          {all ? 'show fewer' : `show all ${xs.length}`}
        </Button>
      )}
    </div>
  );
}

/** The card's Patterns tab: the pill on a sheet the autopilot wrote, the list behind it. */
export function AutopilotPill({ assumptions }: { assumptions: readonly AutopilotAssumption[] }) {
  const [open, setOpen] = useState(false);
  if (!assumptions.length) return null;
  const strong = assumptions.some((a) => a.strong);
  return (
    <>
      <button
        type='button'
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title='what the importer assumed in the operator’s place — open to read'
        className='focus-visible:outline focus-visible:outline-2 focus-visible:outline-textColor'
      >
        <Pill tone={strong ? 'attention' : 'mut'}>{autopilotSummary(assumptions)}</Pill>
      </button>
      {open && (
        <span className='mt-1 block basis-full'>
          <AssumptionList assumptions={assumptions} limit={20} />
        </span>
      )}
    </>
  );
}

/** Per viewer: the files step's "autopilot" switch (localStorage, never required). */
const PREF_KEY = 'patimport.autopilot';
export function readAutopilotPref(): boolean {
  try {
    const v = window.localStorage.getItem(PREF_KEY);
    return v == null ? true : v === '1';
  } catch {
    return true;
  }
}
export function writeAutopilotPref(on: boolean) {
  try {
    window.localStorage.setItem(PREF_KEY, on ? '1' : '0');
  } catch {
    /* private window, blocked storage: the switch still works for this run */
  }
}
