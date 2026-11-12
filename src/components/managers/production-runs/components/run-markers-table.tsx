import { cn } from 'lib/utility';
import { DataTable, EmptyCell, Text } from 'ui';
import type { RunMarkerPart, RunMarkerRow } from './run-markers';

// Маркеры прогона по материалам: таблица на десктопе, карточки на телефоне (макет «By table»).
// Материал, разбитый по столу, — строка-группа и маркеры A, B, … под ней.
const meters = (cm: number | null) => (cm == null ? null : `${(cm / 100).toFixed(2)} m`);
const cmText = (cm: number | null) => (cm == null ? null : `${Math.round(cm)} cm`);
const pctText = (p: number | null) => (p == null ? null : `${Math.round(p)} %`);
const pliesText = (p: number | null) => (p == null ? null : `×${p}`);
const sizesText = (s: { label: string; qty: number }[]) =>
  s.map((x) => `${x.label}×${x.qty}`).join(' ');
const nameOf = (r: RunMarkerRow) => (r.colorway ? `${r.material} · ${r.colorway}` : r.material);
const issueText = (r: RunMarkerRow) =>
  r.kind === 'skipped' || r.kind === 'failed'
    ? `${r.kind === 'failed' ? 'FAILED' : 'SKIPPED'} · ${r.word}`
    : '';
const cell = (v: string | null) => v ?? <EmptyCell />;

function PartCells({ p, width }: { p: RunMarkerPart; width: boolean }) {
  return (
    <>
      <td className='whitespace-nowrap'>{width ? cell(cmText(p.widthCm)) : null}</td>
      <td className={cn('whitespace-nowrap', p.over && 'text-error')}>
        {cell(meters(p.lengthCm))}
      </td>
      <td className='whitespace-nowrap'>{cell(pctText(p.effPct))}</td>
      <td>{cell(pliesText(p.plies))}</td>
      <td data-align='left' className='whitespace-nowrap'>
        {sizesText(p.sizes)}
      </td>
      <td data-align='left' className='text-labelColor'>
        {p.source}
      </td>
    </>
  );
}

function DesktopRows({ r }: { r: RunMarkerRow }) {
  if (r.kind === 'marker')
    return (
      <tr>
        <td>{nameOf(r)}</td>
        <PartCells p={r} width />
      </tr>
    );
  if (r.kind === 'split')
    return (
      <>
        <tr>
          <td colSpan={7} data-align='left'>
            {[nameOf(r), cmText(r.widthCm)].filter(Boolean).join(' · ')}
          </td>
        </tr>
        {r.parts.map((p) => (
          <tr key={p.key}>
            <td className='pl-4 text-labelColor'>marker {p.letter}</td>
            <PartCells p={p} width={false} />
          </tr>
        ))}
      </>
    );
  return (
    <tr>
      <td>{nameOf(r)}</td>
      <td colSpan={6} data-align='left' className='text-error'>
        {issueText(r)}
      </td>
    </tr>
  );
}

function PhoneRows({ r }: { r: RunMarkerRow }) {
  if (r.kind === 'split')
    return (
      <>
        <div className='flex flex-wrap items-baseline gap-2.5'>
          <Text size='small' component='span' className='mr-auto'>
            {nameOf(r)}
          </Text>
          <Text size='small' variant='label' component='span' className='tabular-nums'>
            {cmText(r.widthCm)}
          </Text>
        </div>
        {r.parts.map((p) => (
          <div key={p.key} className='flex flex-wrap items-baseline gap-2.5 tabular-nums'>
            <Text size='small' component='span' className='mr-auto'>
              {p.letter} · {sizesText(p.sizes)}
            </Text>
            <Text size='small' component='span' className={cn(p.over && 'text-error')}>
              {cell(meters(p.lengthCm))}
            </Text>
            <Text size='small' variant='label' component='span'>
              {[pctText(p.effPct), pliesText(p.plies)].filter(Boolean).join(' ')}
            </Text>
          </div>
        ))}
      </>
    );
  return (
    <>
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
            <Text
              size='small'
              component='span'
              className={cn('tabular-nums', r.over && 'text-error')}
            >
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
    </>
  );
}

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
            {rows.map((r) => (
              <DesktopRows key={r.key} r={r} />
            ))}
          </tbody>
        </DataTable>
      </div>

      <div className='flex flex-col md:hidden'>
        {rows.map((r) => (
          <div
            key={r.key}
            className='flex flex-col gap-1 border-t border-hairline py-2.5 first:border-t-0'
          >
            <PhoneRows r={r} />
          </div>
        ))}
      </div>
    </>
  );
}
