// КОЛИЧЕСТВА — сетка колорвей × размер в зоне настроек (дизайн §8, план §9.4). Источник: вручную
// или прогон; запас %; итоги строк и столбцов; итог лент A и B (в simplex ×2). Из прогона ячейки
// только читаются — число в прогоне правят в прогоне, а не здесь, иначе два источника разойдутся.
import { useState } from 'react';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import type { CareLabelRun, CareLabelSize } from './adapter';
import { allEqual, toQty, type Quantities, type QtyGrid } from './quantities';
import type { CareLabelPrefs } from './use-care-label-prefs';

export function QuantitiesGrid({
  colorways,
  sizes,
  runs,
  prefs,
  onPrefs,
  base,
  onBase,
  quantities,
}: {
  colorways: readonly { id: number; label: string }[];
  sizes: readonly CareLabelSize[];
  runs: readonly CareLabelRun[];
  prefs: Pick<CareLabelPrefs, 'source' | 'overagePct' | 'mode'>;
  onPrefs: (patch: Partial<CareLabelPrefs>) => void;
  /** Сетка до запаса (ручная или из прогона). */
  base: QtyGrid;
  /** Правка ручной сетки; в режиме прогона не зовётся. */
  onBase: (next: QtyGrid) => void;
  quantities: Quantities;
}) {
  const manual = prefs.source === 'manual';
  const runId = typeof prefs.source === 'object' ? prefs.source.runId : null;
  const [allN, setAllN] = useState('');
  const cwIds = colorways.map((c) => c.id);
  const sizeIds = sizes.map((s) => s.id);
  const k = prefs.mode === 'simplex' ? 2 : 1;

  return (
    <div className='flex flex-col gap-2' data-care-zone='quantities'>
      <ChipRow>
        <Chip
          nonForm
          pressed={manual}
          selected={manual}
          onClick={() => onPrefs({ source: 'manual' })}
          data-qty-source='manual'
        >
          manual
        </Chip>
        {runs.map((r) => (
          <Chip
            key={r.id}
            nonForm
            pressed={runId === r.id}
            selected={runId === r.id}
            onClick={() => onPrefs({ source: { runId: r.id } })}
            data-qty-source={r.id}
            title='planned quantities of this production run'
          >
            {r.label}
          </Chip>
        ))}
      </ChipRow>
      {runId != null && !runs.some((r) => r.id === runId) && (
        <Text size='micro' variant='errorLabel'>
          run #{runId} is not among this card’s runs — pick another source
        </Text>
      )}
      <div className='flex flex-wrap items-center gap-2'>
        <Text size='micro' variant='label'>
          overage %
        </Text>
        <Input
          name='care-overage'
          type='number'
          min={0}
          max={100}
          className='w-16'
          aria-label='overage percent'
          data-care-overage=''
          value={prefs.overagePct}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && n >= 0 && n <= 100) onPrefs({ overagePct: Math.round(n) });
          }}
        />
        {manual && (
          <>
            <Text size='micro' variant='label'>
              all =
            </Text>
            <Input
              name='care-all-n'
              type='number'
              min={0}
              className='w-16'
              aria-label='set every cell to'
              data-care-all-n=''
              value={allN}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAllN(e.target.value)}
            />
            <Button
              type='button'
              variant='secondary'
              size='xs'
              data-care-all-apply=''
              onClick={() => onBase(allEqual(cwIds, sizeIds, toQty(allN)))}
            >
              apply
            </Button>
          </>
        )}
      </div>
      <div className='overflow-x-auto'>
        <table className='w-full border-collapse text-micro tabular-nums'>
          <thead>
            <tr className='border-b border-textColor text-labelColor uppercase'>
              <th className='py-1 pr-2 text-left font-normal'>colourway</th>
              {sizes.map((s) => (
                <th key={s.id} className='px-1 py-1 text-right font-normal'>
                  {s.label}
                </th>
              ))}
              <th className='py-1 pl-2 text-right font-normal'>Σ</th>
            </tr>
          </thead>
          <tbody>
            {colorways.map((c) => (
              <tr key={c.id} className='border-b border-hairline' data-qty-row={c.id}>
                <td className='py-1 pr-2 whitespace-nowrap'>{c.label}</td>
                {sizes.map((s) => {
                  const v = base[c.id]?.[s.id] ?? 0;
                  const out = quantities.cells[c.id]?.[s.id] ?? 0;
                  return (
                    <td
                      key={s.id}
                      className='px-1 py-1 text-right'
                      data-qty-cell={`${c.id}:${s.id}`}
                      data-qty-final={out}
                    >
                      {manual ? (
                        <Input
                          name={`care-qty-${c.id}-${s.id}`}
                          type='number'
                          min={0}
                          className='w-14 text-right'
                          aria-label={`${c.label} ${s.label}`}
                          value={v || ''}
                          placeholder='0'
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            onBase({
                              ...base,
                              [c.id]: { ...(base[c.id] ?? {}), [s.id]: toQty(e.target.value) },
                            })
                          }
                        />
                      ) : (
                        <span>{v}</span>
                      )}
                      {out !== v && <span className='block text-labelColor'>→ {out}</span>}
                    </td>
                  );
                })}
                <td className='py-1 pl-2 text-right font-bold' data-qty-row-total={c.id}>
                  {quantities.rowTotals[c.id] ?? 0}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className='border-t border-textColor font-bold'>
              <td className='py-1 pr-2'>Σ</td>
              {sizes.map((s) => (
                <td key={s.id} className='px-1 py-1 text-right' data-qty-col-total={s.id}>
                  {quantities.colTotals[s.id] ?? 0}
                </td>
              ))}
              <td className='py-1 pl-2 text-right' />
            </tr>
          </tfoot>
        </table>
      </div>
      <Text size='micro' data-care-totals={`${quantities.labelsA}/${quantities.labelsB}`}>
        labels A {quantities.labelsA} · labels B {quantities.labelsB}
        {k === 2 ? ' (simplex: face and back are separate labels, ×2)' : ''}
      </Text>
    </div>
  );
}
