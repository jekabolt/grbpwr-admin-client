// What the written files leave out, said above the download (FLY-final M2): a run that lost the
// back to "not a piece" passed the gate and downloaded without anyone noticing. No new gate: the
// run may well be right to leave a region out (a label box, a page number), but it must be seen.
import { createContext, useContext } from 'react';
import type { SeedId, WizardStep } from 'lib/pattern-import/types';
import { CalloutBox, Text } from 'ui';
import type { HeaderWarning } from 'ui';
import type { ImportSessionApi } from '../use-import-session';

/**
 * How a region read when the operator dropped it ("not a piece" runs before the namer, so the
 * dropped region has no name of its own): its mark and area, so a dropped back (2800 cm²) does
 * not read like a dropped page number. The wizard keeps them for this note.
 */
export const DroppedLabels = createContext<{
  labels: Record<number, string>;
  remember: (seed: SeedId, label: string) => void;
}>({ labels: {}, remember: () => undefined });

type Left = { what: string; why: string; to: WizardStep };

export function leftOut(
  api: ImportSessionApi,
  dropped: Record<number, string> = {},
): { pieces: Left[]; sizes: string[] } {
  const { session, inputs } = api;
  const nameOf = (seed: SeedId) => {
    const n = session.names.find((x) => x.seed === seed);
    const code = n ? [n.code, ...n.mods].filter(Boolean).join('_') : '';
    const text = session.pieces?.seeds.find((x) => x.id === seed)?.text?.text?.trim();
    const was = dropped[seed];
    return n?.displayName || code || (text ? `«${text}»` : was ?? 'a clicked region');
  };
  const pieces: Left[] = [];
  const seen = new Set<SeedId>();
  for (const e of inputs.edits) {
    if (e.kind !== 'not-a-piece' || seen.has(e.seed)) continue;
    seen.add(e.seed);
    pieces.push({ what: nameOf(e.seed), why: 'marked not a piece', to: 'pieces' });
  }
  for (const b of session.semantics?.blocked ?? []) {
    if (seen.has(b.seed)) continue;
    seen.add(b.seed);
    pieces.push({ what: nameOf(b.seed), why: `blocked: ${b.detail}`, to: 'meaning' });
  }
  // a built piece that no fabric file carries (no fabric proposed, or fused only)
  const inFiles = new Set(session.draft?.scopes.flatMap((s) => s.identities) ?? []);
  if (session.draft)
    for (const p of session.semantics?.pieces ?? []) {
      if (inFiles.has(p.identity) || seen.has(p.seed)) continue;
      seen.add(p.seed);
      pieces.push({ what: p.displayName || p.identity, why: 'in no fabric file', to: 'fabrics' });
    }
  const sizes = (session.sizes?.map.unmapped ?? []).map((c) => c.name);
  return { pieces, sizes };
}

const STEP_WORD: Partial<Record<WizardStep, string>> = {
  pieces: 'pieces',
  meaning: 'details',
  fabrics: 'fabrics',
  sizes: 'sizes',
};

/**
 * The same list as `HeaderWarnings` items: each one names what is left out and is its own door
 * back to the step that brings it in (a header `! N warnings` on check / apply).
 */
export function notInFileWarnings(
  api: ImportSessionApi,
  dropped: Record<number, string> = {},
): HeaderWarning[] {
  const { pieces, sizes } = leftOut(api, dropped);
  const back = (to: WizardStep) => ({
    label: `back to ${STEP_WORD[to] ?? to}`,
    onClick: () => void api.dispatch({ type: 'back', to }),
    disabled: !!api.session.busy,
  });
  return [
    ...pieces.map((p) => ({
      text: `not in this file: ${p.what} (${p.why}) ← ${STEP_WORD[p.to] ?? p.to}`,
      action: back(p.to),
    })),
    ...(sizes.length
      ? [
          {
            text: `not in this file: card ${sizes.length === 1 ? 'size' : 'sizes'} ${sizes.join(', ')} (no source) ← sizes`,
            action: back('sizes'),
          },
        ]
      : []),
  ];
}

/** `notInFileWarnings` with the regions the operator dropped (read from the wizard's context). */
export function useNotInFileWarnings(api: ImportSessionApi): HeaderWarning[] {
  const { labels } = useContext(DroppedLabels);
  return notInFileWarnings(api, labels);
}

export function NotInFile({ api, className }: { api: ImportSessionApi; className?: string }) {
  const { labels } = useContext(DroppedLabels);
  const { pieces, sizes } = leftOut(api, labels);
  if (!pieces.length && !sizes.length) return null;
  const busy = !!api.session.busy;
  const door = (key: string, text: string, to: WizardStep) => (
    <button
      key={key}
      type='button'
      disabled={busy}
      title={`back to ${STEP_WORD[to] ?? to}`}
      onClick={() => void api.dispatch({ type: 'back', to })}
      className='text-left underline-offset-2 hover:underline focus-visible:underline disabled:no-underline'
    >
      {text}
    </button>
  );
  return (
    <CalloutBox tone='warning' className={className}>
      <Text size='micro' component='p' className='flex flex-wrap gap-x-2'>
        <b>! not in this file:</b>
        {pieces.map((p, i) => door(`p${i}`, `${p.what} (${p.why})`, p.to))}
        {sizes.length > 0 &&
          door(
            's',
            `card ${sizes.length === 1 ? 'size' : 'sizes'} ${sizes.join(', ')} (no source)`,
            'sizes',
          )}
      </Text>
    </CalloutBox>
  );
}
