// Step 6 · DETAILS before piece semantics exists (F5 not landed): what the importer DID find,
// said plainly — the numbered render the AI is shown (render-som, from the worker), and one row per
// piece with its sizes, size and the features the source already declares (a DXF carries notches,
// drills, grain). Nothing here is guessed; the editable details table arrives with semantics.
import { useEffect, useMemo, useState } from 'react';
import type { Feature, PieceFamily } from 'lib/pattern-import/types';
import { CalloutBox } from 'ui/components/callout-box';
import { DataTable, EmptyCell } from 'ui/components/data-table';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { SHEET_INK, SheetViewport, ptsAttr } from '../sheet-viewport';
import type { ImportSessionApi } from '../use-import-session';
import { Panel, SplitStage, fmtPct } from '../ui-bits';

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
    <SplitStage
      sideWidth={520}
      canvas={
        <Panel
          title={url ? 'what the AI is shown' : 'pieces on the sheet'}
          aside={
            som ? (
              <Text size='micro' variant='label' component='span'>
                {som.marks.length} marks · {som.crops.length} close-ups ·{' '}
                {Math.round(som.sheetPng.size / 1024)} KB
              </Text>
            ) : null
          }
          bodyClassName='p-0'
        >
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
        </Panel>
      }
      side={
        <Panel
          title='pieces found'
          aside={
            <Text size='micro' variant='label' component='span'>
              {families.length}
              {sizes != null ? ` × ${sizes} sizes` : ''}
            </Text>
          }
        >
          <CalloutBox tone='note' className='mb-2'>
            <Text size='micro' component='p'>
              the details table — code, pair, fold, grainline, allowance per piece — is built by the
              piece-semantics stage, which is not built yet. below is what the file already gives.
            </Text>
          </CalloutBox>
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
                const grain = count(c?.features, 'grain');
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
                    <td>
                      {!c?.features ? (
                        <EmptyCell />
                      ) : grain ? (
                        <Pill tone='ok'>found</Pill>
                      ) : (
                        <Pill tone='warn'>! none</Pill>
                      )}
                    </td>
                    <td data-align='left'>
                      {n ? (
                        <>
                          {n.code}
                          {n.mods.length ? `_${n.mods.join('_')}` : ''}{' '}
                          <Text size='micro' variant='label' component='span'>
                            {fmtPct(n.confidence, 0)}
                          </Text>
                        </>
                      ) : (
                        <EmptyCell />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
          {!session.names.length && (
            <Text size='micro' variant='label' component='p' className='mt-1'>
              no AI names: the AI is asked once the render is uploaded — it needs a signed-in admin
              and the pattern-pieces purpose on the backend.
            </Text>
          )}
        </Panel>
      }
    />
  );
}
