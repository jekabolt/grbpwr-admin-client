import { sheetHint, type DxfLinearUnit, type Extents } from 'lib/nesting/dxf/insunits';
import { useLayoutEffect, useState } from 'react';
import { Chip, ChipRow, ConfirmationModal, Text } from 'ui';

/** One DXF whose header carries no $INSUNITS. */
export type UnitsItem = { key: string; name: string; extents: Extents | null };

const UNITS: DxfLinearUnit[] = ['mm', 'cm', 'in'];

// Units of DXFs that do not declare them: one row per file, mm by default, the sheet's physical
// size under the picked unit next to it so the wrong choice reads as a wrong garment.
export function DxfUnitsDialog({
  items,
  busy,
  onConfirm,
  onCancel,
}: {
  items: UnitsItem[] | null; // null = closed
  busy?: boolean;
  onConfirm: (units: Record<string, DxfLinearUnit>) => void;
  onCancel: () => void;
}) {
  const [picked, setPicked] = useState<Record<string, DxfLinearUnit>>({});
  useLayoutEffect(() => {
    setPicked(Object.fromEntries((items ?? []).map((i) => [i.key, 'mm' as DxfLinearUnit])));
  }, [items]);

  return (
    <ConfirmationModal
      open={!!items && items.length > 0}
      width='sm'
      title='upload with units'
      confirmLabel={busy ? 'uploading…' : 'upload'}
      confirmDisabled={busy}
      hideCancel
      closeOnConfirm={false}
      onOpenChange={(o) => {
        if (!o && !busy) onCancel();
      }}
      onCancel={() => {
        if (!busy) onCancel();
      }}
      onConfirm={() => {
        if (!items) return;
        onConfirm(Object.fromEntries(items.map((i) => [i.key, picked[i.key] ?? 'mm'])));
      }}
    >
      <div className='divide-y divide-hairline'>
        {(items ?? []).map((it) => {
          const unit = picked[it.key] ?? 'mm';
          return (
            <div key={it.key} className='space-y-1 py-1.5'>
              <Text size='micro' component='p' className='truncate' title={it.name}>
                {it.name}
              </Text>
              <div className='flex items-center gap-2'>
                <ChipRow className='shrink-0 flex-nowrap'>
                  {UNITS.map((u) => (
                    <Chip
                      key={u}
                      selected={u === unit}
                      disabled={busy}
                      className='w-10 justify-center normal-case'
                      onClick={() => setPicked((p) => ({ ...p, [it.key]: u }))}
                    >
                      {u}
                    </Chip>
                  ))}
                </ChipRow>
                {it.extents && (
                  <Text size='nano' variant='label' component='span' className='tabular-nums'>
                    {sheetHint(it.extents, unit)}
                  </Text>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </ConfirmationModal>
  );
}
