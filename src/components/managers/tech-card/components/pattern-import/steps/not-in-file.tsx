// What the written files leave out, said above the download (FLY-final M2): a run that lost the
// back to "not a piece" passed the gate and downloaded without anyone noticing. No new gate: the
// run may well be right to leave a region out (a label box, a page number), but it must be seen.
import { createContext, useContext } from 'react';
import type { SeedId } from 'lib/pattern-import/types';
import { CalloutBox } from 'ui/components/callout-box';
import Text from 'ui/components/text';
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

type Left = { what: string; why: string };

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
    pieces.push({ what: nameOf(e.seed), why: 'marked not a piece' });
  }
  for (const b of session.semantics?.blocked ?? []) {
    if (seen.has(b.seed)) continue;
    seen.add(b.seed);
    pieces.push({ what: nameOf(b.seed), why: `blocked: ${b.detail}` });
  }
  // a built piece that no fabric file carries (no fabric proposed, or fused only)
  const inFiles = new Set(session.draft?.scopes.flatMap((s) => s.identities) ?? []);
  if (session.draft)
    for (const p of session.semantics?.pieces ?? []) {
      if (inFiles.has(p.identity) || seen.has(p.seed)) continue;
      seen.add(p.seed);
      pieces.push({ what: p.displayName || p.identity, why: 'in no fabric file' });
    }
  const sizes = (session.sizes?.map.unmapped ?? []).map((c) => c.name);
  return { pieces, sizes };
}

export function NotInFile({ api, className }: { api: ImportSessionApi; className?: string }) {
  const { labels } = useContext(DroppedLabels);
  const { pieces, sizes } = leftOut(api, labels);
  if (!pieces.length && !sizes.length) return null;
  return (
    <CalloutBox tone='warning' className={className}>
      <Text size='micro' component='p'>
        <b>! not in this file:</b>{' '}
        {[
          ...pieces.map((p) => `${p.what} (${p.why})`),
          ...(sizes.length
            ? [`card ${sizes.length === 1 ? 'size' : 'sizes'} ${sizes.join(', ')} (no source)`]
            : []),
        ].join(' · ')}
      </Text>
      <Text size='micro' variant='label' component='p'>
        check this is meant before you download. ← back to pieces or sizes to bring one in.
      </Text>
    </CalloutBox>
  );
}
