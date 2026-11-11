import { DataTable, EmptyCell, Text } from 'ui';
import type { RunMarkerRow } from './run-markers';

// Маркеры прогона по материалам: таблица на десктопе, карточки на телефоне (макет «One marker»).
const meters = (cm: number | null) => (cm == null ? null : `${(cm / 100).toFixed(2)} m`);
const cmText = (cm: number | null) => (cm == null ? null : `${Math.round(cm)} cm`);
const pctText = (p: number | null) => (p == null ? null : `${Math.round(p)} %`);
const pliesText = (p: number | null) => (p == null ? null : `×${p}`);
const sizesText = (s: { label: string; qty: number }[]) =>
  s.map((x) => `${x.label}×${x.qty}`).join(' ');
const nameOf = (r: RunMarkerRow) => (r.colorway ? `${r.material} · ${r.colorway}` : r.material);
const issueText = (r: RunMarkerRow) =>
  r.kind === 'marker' ? '' : `${r.kind === 'failed' ? 'FAILED' : 'SKIPPED'} · ${r.word}`;
const cell = (v: string | null) => v ?? <EmptyCell />;

export function RunMarkersTable({ rows }: { rows: RunMarkerRow[] }) {
  if (rows.length === 0) return null;
  return (
    <>
      <div className='hidden md:block'>
        <DataTable>
          <thead>
            <tr>
              <th>material</th>
              <th>width</th>
              <th>length</th>
              <th>eff</th>
              <th>plies</th>
              <th data-align='left'>sizes</th>
              <th data-align='left' />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) =>
              r.kind === 'marker' ? (
                <tr key={r.key}>
                  <td>{nameOf(r)}</td>
                  <td className='whitespace-nowrap'>{cell(cmText(r.widthCm))}</td>
                  <td className='whitespace-nowrap'>{cell(meters(r.lengthCm))}</td>
                  <td className='whitespace-nowrap'>{cell(pctText(r.effPct))}</td>
                  <td>{cell(pliesText(r.plies))}</td>
                  <td data-align='left' className='whitespace-nowrap'>
                    {sizesText(r.sizes)}
                  </td>
                  <td data-align='left' className='text-labelColor'>
                    {r.source}
                  </td>
                </tr>
              ) : (
                <tr key={r.key}>
                  <td>{nameOf(r)}</td>
                  <td colSpan={6} data-align='left' className='text-error'>
                    {issueText(r)}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </DataTable>
      </div>

      <div className='flex flex-col md:hidden'>
        {rows.map((r) => (
          <div
            key={r.key}
            className='flex flex-col gap-1 border-t border-hairline py-2.5 first:border-t-0'
          >
            <div className='flex flex-wrap items-baseline gap-2.5'>
              <Text size='small' component='span' className='mr-auto'>
                {nameOf(r)}
              </Text>
              {r.kind === 'marker' ? (
                <>
                  {r.source !== 'auto' ? (
                    <Text size='small' variant='label' component='span'>
                      {r.source}
                    </Text>
                  ) : null}
                  <Text size='small' component='span' className='tabular-nums'>
                    {cell(meters(r.lengthCm))}
                  </Text>
                </>
              ) : (
                <Text size='small' component='span' className='text-error'>
                  {issueText(r)}
                </Text>
              )}
            </div>
            {r.kind === 'marker' ? (
              <div className='flex flex-wrap items-baseline gap-2.5 tabular-nums'>
                {[cmText(r.widthCm), pctText(r.effPct), pliesText(r.plies), sizesText(r.sizes)]
                  .filter((v): v is string => !!v)
                  .map((v, i) => (
                    <Text key={i} size='small' variant='label' component='span'>
                      {v}
                    </Text>
                  ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}
