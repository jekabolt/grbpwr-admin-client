import { useLayoutEffect, useState } from 'react';
import { CheckboxCommon, Chip, ChipRow, ConfirmationModal, Text } from 'ui';
import { sizeConflicts, type CardSize, type SizePick } from './dxf-size-plan';

/** The file's sizes against the card's; `sizes` empty = the file is unsized. */
export type SizesAsk = {
  name: string;
  sizes: string[];
  cards: CardSize[];
  initial: Record<string, SizePick>;
};

// The unsized file's single row.
export const UNSIZED = '';

// DXF size → card size, one row per size of the file: include box, the size as the file writes
// it, the card's sizes as chips. Two rows on one card size block the confirm.
export function DxfSizesDialog({
  ask,
  busy,
  onConfirm,
  onCancel,
}: {
  ask: SizesAsk | null; // null = closed
  busy?: boolean;
  onConfirm: (picks: Record<string, SizePick>) => void;
  onCancel: () => void;
}) {
  const [picks, setPicks] = useState<Record<string, SizePick>>({});
  useLayoutEffect(() => setPicks(ask?.initial ?? {}), [ask]);

  const rows = ask ? (ask.sizes.length > 0 ? ask.sizes : [UNSIZED]) : [];
  const conflicts = sizeConflicts(picks);
  const included = rows.filter((r) => picks[r]?.on);
  const ready =
    included.length > 0 && included.every((r) => picks[r].to > 0) && conflicts.size === 0;
  const set = (row: string, p: Partial<SizePick>) =>
    setPicks((all) => ({ ...all, [row]: { ...(all[row] ?? { on: false, to: 0 }), ...p } }));

  return (
    <ConfirmationModal
      open={!!ask}
      width='sm'
      title='map file sizes to card sizes'
      confirmLabel={busy ? 'uploading…' : 'map sizes'}
      confirmDisabled={busy || !ready}
      footerHint={
        busy
          ? undefined
          : conflicts.size > 0
            ? 'two file sizes on one card size'
            : included.length === 0
              ? 'tick a size to upload'
              : undefined
      }
      hideCancel
      closeOnConfirm={false}
      onOpenChange={(o) => {
        if (!o && !busy) onCancel();
      }}
      onCancel={() => {
        if (!busy) onCancel();
      }}
      onConfirm={() => {
        if (ready) onConfirm(picks);
      }}
    >
      <Text size='micro' component='p' className='truncate pb-1' title={ask?.name}>
        {ask?.name}
      </Text>
      <div className='divide-y divide-hairline'>
        {rows.map((row) => {
          const p = picks[row] ?? { on: false, to: 0 };
          const clash = conflicts.has(row);
          return (
            <div key={row || 'unsized'} className='flex items-center gap-2 py-1.5'>
              {row === UNSIZED ? (
                <span className='h-3 w-3 flex-none' />
              ) : (
                <CheckboxCommon
                  name={`dxf-size-${row}`}
                  checked={p.on}
                  disabled={busy}
                  aria-label={`use ${row}`}
                  onChange={(on) => {
                    // Ticked with no target: the first card size no other row holds.
                    const taken = new Set(rows.filter((r) => picks[r]?.on).map((r) => picks[r].to));
                    const free = ask?.cards.find((c) => !taken.has(c.id))?.id ?? 0;
                    set(row, on && !p.to ? { on, to: free } : { on });
                  }}
                />
              )}
              <Text
                size='micro'
                component='span'
                className={`w-14 flex-none truncate uppercase ${p.on ? '' : 'text-labelColor'}`}
                title={row || 'unsized'}
              >
                {row || 'unsized'}
              </Text>
              <ChipRow>
                {(ask?.cards ?? []).map((c) => (
                  <Chip
                    key={c.id}
                    selected={p.on && p.to === c.id}
                    tone={p.on && p.to === c.id && clash ? 'error' : 'default'}
                    disabled={busy}
                    pressed={p.on && p.to === c.id}
                    className='min-w-8 justify-center'
                    onClick={() => set(row, { on: true, to: c.id })}
                  >
                    {c.label}
                  </Chip>
                ))}
              </ChipRow>
            </div>
          );
        })}
      </div>
    </ConfirmationModal>
  );
}
