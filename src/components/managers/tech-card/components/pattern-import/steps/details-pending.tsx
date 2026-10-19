// Step 6 · DETAILS while the pieces are still being named (no semantics yet): a plain progress
// view — the numbered sheet the namer is shown (render-som), else the outlines found, and the
// count. The shell's own parsing state says what runs; the per-piece reading is `?debug=1` only.
import { useEffect, useMemo, useState } from 'react';
import type { Feature, PieceFamily } from 'lib/pattern-import/types';
import { DataTable, EmptyCell, Text } from 'ui';
import { SHEET_INK, SheetViewport, ptsAttr } from '../sheet-viewport';
import type { ImportSessionApi } from '../use-import-session';
import { DebugFold, Panel, fmtPct } from '../ui-bits';
import { plural } from '../stages';

const count = (fs: readonly Feature[] | undefined, k: Feature['kind']) =>
  (fs ?? []).filter((f) => f.kind === k).length;

/** The largest candidate of a family: the outline every size nests inside. */
const outerOf = (f: PieceFamily) =>
  f.candidates.reduce((a, b) => (b.areaMm2 > a.areaMm2 ? b : a), f.candidates[0]);

export function PendingDetails({ api }: { api: ImportSessionApi }) {
  const { session, som } = api;
  const families = useMemo(() => session.pieces?.families ?? [], [session.pieces]);
  const sizes = session.sizes?.run.sizes.length ?? null;
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!som?.sheetPng.size) return setUrl(null);
    const u = URL.createObjectURL(som.sheetPng);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [som]);
  const markOf = (seed: number) => som?.marks.find((m) => m.seed === seed);
  const nameOf = (seed: number) => session.names.find((n) => n.seed === seed);

  return (
    <Panel
      className='h-full'
      title='pieces'
      aside={
        <Text size='micro' variant='label' component='span' className='uppercase tracking-label'>
          {plural(families.length, 'piece')}
          {sizes != null ? ` × ${plural(sizes, 'size')}` : ''}
        </Text>
      }
      bodyClassName='p-0 flex flex-col'
    >
      <div className='min-h-0 flex-1'>
        {url ? (
          <img
            src={url}
            alt='the assembled sheet with every piece numbered, as sent to the AI'
            className='block h-full w-full object-contain'
          />
        ) : session.sheet ? (
          <SheetViewport bbox={session.sheet.sheet.bbox}>
            {({ unit }) =>
              families.map((f) => {
                const c = outerOf(f);
                return c?.outer.length ? (
                  <polygon
                    key={f.seed}
                    points={ptsAttr(c.outer)}
                    fill={SHEET_INK.fill}
                    stroke={SHEET_INK.ink}
                    strokeWidth={unit}
                  />
                ) : null;
              })
            }
          </SheetViewport>
        ) : null}
      </div>
      <DebugFold className='shrink-0 px-2 pb-2'>
        {som && (
          <Text size='micro' variant='label' component='p'>
            {som.marks.length} marks · {som.crops.length} close-ups ·{' '}
            {Math.round(som.sheetPng.size / 1024)} KB
          </Text>
        )}
        <DataTable>
          <thead>
            <tr>
              <th>#</th>
              <th data-align='left'>label in the file</th>
              <th>sizes</th>
              <th>area, cm²</th>
              <th>notches</th>
              <th>grain</th>
              <th data-align='left'>AI name</th>
            </tr>
          </thead>
          <tbody>
            {families.map((f) => {
              const c = outerOf(f);
              const m = markOf(f.seed);
              const n = nameOf(f.seed);
              const seed = session.pieces?.seeds.find((s) => s.id === f.seed);
              const label = seed?.text?.text ?? m?.textInside[0];
              return (
                <tr key={f.seed}>
                  <td className='tabular-nums'>{m?.mark ?? f.seed + 1}</td>
                  <td data-align='left' className='max-w-0 truncate'>
                    {label ?? <EmptyCell />}
                  </td>
                  <td className='tabular-nums'>{f.candidates.length}</td>
                  <td className='tabular-nums'>
                    {c ? (c.areaMm2 / 100).toFixed(0) : <EmptyCell />}
                  </td>
                  <td className='tabular-nums'>
                    {c?.features ? count(c.features, 'notch') : <EmptyCell />}
                  </td>
                  <td className='tabular-nums'>
                    {c?.features ? count(c.features, 'grain') : <EmptyCell />}
                  </td>
                  <td data-align='left'>
                    {n ? (
                      `${n.code}${n.mods.length ? `_${n.mods.join('_')}` : ''} · ${fmtPct(n.confidence, 0)}`
                    ) : (
                      <EmptyCell />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </DebugFold>
    </Panel>
  );
}
