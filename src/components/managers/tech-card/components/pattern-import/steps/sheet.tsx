// Stage 2 · SHEET — the tiles put back together. Residuals are VISIBLE (Codex C6) on the drawing:
// a tile that does not close is outlined blue with its number, a weak registration is a blue seam.
// The panel is one line ("44/44 tiles placed"); it asks only when tiles are missing, refused or
// do not close — accept, or set the grid by hand. Seams, votes and loop numbers are diagnostics.
import { useMemo, useState } from 'react';
import type { GridOverride, PagePose } from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip } from 'ui/components/chip';
import { DataTable } from 'ui/components/data-table';
import { GroupLabel } from 'ui/components/group-label';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import type { CardContext } from '../client';
import { SHEET_INK, SheetViewport, vy } from '../sheet-viewport';
import type { ImportSessionApi } from '../use-import-session';
import {
  DebugFold,
  Field,
  Fold,
  NativeSelect,
  NumberField,
  Panel,
  SplitStage,
  ask,
  fmtMm,
} from '../ui-bits';
import { SheetCleanRows } from './files-clean';

/** The coach's how (THE ASK CONTRACT, ui-bits) when the grid by hand is the answer. */
const GRID_HINT = 'set rows, columns and step, then apply';

const keyOf = (p: { file: string; page: number }) => `${p.file}:${p.page}`;

/** "p3–17" (pages are 0-based; several files: "2/p3–17 …"). */
function pageSpan(pages: readonly { file: string; page: number }[]): string {
  const byFile = new Map<string, number[]>();
  for (const p of pages) byFile.set(p.file, [...(byFile.get(p.file) ?? []), p.page + 1]);
  return [...byFile]
    .map(([f, ps]) => {
      const lo = Math.min(...ps);
      const hi = Math.max(...ps);
      return `${byFile.size > 1 ? `${Number(f) + 1}/` : ''}p${lo}${hi > lo ? `–${hi}` : ''}`;
    })
    .join(' ');
}

/** One SVG path for the whole preview: thousands of <polyline>s would make pan and zoom crawl. */
function pathData(arrays: readonly Float32Array[]): string {
  const parts: string[] = [];
  for (const a of arrays) {
    if (a.length < 4) continue;
    let d = `M${a[0].toFixed(1)} ${(-a[1]).toFixed(1)}`;
    for (let i = 2; i < a.length; i += 2) d += `L${a[i].toFixed(1)} ${(-a[i + 1]).toFixed(1)}`;
    parts.push(d);
  }
  return parts.join('');
}

export function SheetStep({ api }: { api: ImportSessionApi; card?: CardContext }) {
  const { session, inputs, patchInputs } = api;
  const out = session.sheet;
  const [picked, setPicked] = useState<string | null>(null);
  const multiFile = new Set(out?.sheet.poses.map((p) => p.file) ?? []).size > 1;
  const fileName = (id: string) => session.files.find((f) => f.id === id)?.name ?? `file ${id}`;
  /** A1, B3 … in the tile grid; with a file-per-size set the file says which drawing. */
  // D6: several tile sheets each number their tiles from A1 — the sheet says which
  const partOf = (p: PagePose) =>
    (out?.sheet.parts?.length ?? 0) > 1
      ? out?.sheet.parts?.find((q) => q.pages.some((x) => x.file === p.file && x.page === p.page))
      : undefined;
  const tileName = (p?: PagePose) =>
    !p
      ? '?'
      : `${partOf(p) ? `s${partOf(p)!.sheet + 1}·` : ''}${multiFile ? `${Number(p.file) + 1}/` : ''}${
          p.row == null || p.col == null
            ? `p${p.page + 1}`
            : `${String.fromCharCode(65 + p.row)}${p.col + 1}`
        }`;
  const first = out?.sheet.poses[0];
  const [grid, setGrid] = useState<GridOverride>(
    inputs.gridOverride ?? {
      rows: Math.max(1, ...(out?.sheet.poses.map((p) => (p.row ?? 0) + 1) ?? [1])),
      cols: Math.max(1, ...(out?.sheet.poses.map((p) => (p.col ?? 0) + 1) ?? [1])),
      stepXMm: Math.round(first?.widthMm ?? 200),
      stepYMm: Math.round(first?.heightMm ?? 287),
      order: 'row-major',
      originPage: { file: first?.file ?? '0', page: first?.page ?? 0 },
    },
  );
  const preview = useMemo(() => (out ? pathData(out.previewPaths) : ''), [out]);
  // A8: what the clean stage set aside, drawn under the line work in the sheet's light grey
  const masked = useMemo(
    () => (out?.clean ? pathData(out.clean.masked.flatMap((m) => m.lines)) : ''),
    [out],
  );
  // Tile sheets of the files (a Burda file carries two; r4454 a main sheet + interfacing) — D6:
  // every one is in the drawing; the hand grid is set on one of them.
  const [gridSheet, setGridSheet] = useState<number>(inputs.sheetIndex);
  /** The hand-grid fold; null = its own rule (open while the grid is the answer). */
  const [gridOpen, setGridOpen] = useState<boolean | null>(null);
  const sheets = useMemo(
    () =>
      [
        ...new Set(
          session.pages.flatMap((p) => (p.cls === 'tile' && p.sheet != null ? [p.sheet] : [])),
        ),
      ].sort((a, b) => a - b),
    [session.pages],
  );
  if (!out) return null;
  const { sheet } = out;
  const worst = Math.max(0, ...sheet.poses.map((p) => p.residualMm));
  const overLimit = worst > PATIMPORT.registrationMaxResidualMm;
  // F2 reports secondBestRatio as second-best / best votes (0 = one clear peak). A seam whose
  // runner-up has more than 1/3 of the winner's votes is ambiguous: drawn blue, needs a look.
  const isWeak = (p: { score: number; secondBestRatio: number }) =>
    p.score > 0 && p.secondBestRatio > 1 / PATIMPORT.registrationMinPeakRatio;
  const weak = sheet.pairs.filter(isWeak);
  const poseOf = (q: { file: string; page: number }) =>
    sheet.poses.find((p) => p.file === q.file && p.page === q.page);
  const tilesIn = (n: number) =>
    session.pages.filter((p) => p.cls === 'tile' && p.sheet === n).length;
  const refused = sheet.refused ?? [];
  const missing = sheet.missing.length;
  /** The grid by hand is the answer: pages left off the grid, or a placement refused. */
  const gridAsks = missing > 0 || refused.length > 0;
  const acceptAsks = overLimit && !inputs.residualsAccepted && !gridAsks;
  const gridFold = {
    open: gridOpen ?? (gridAsks || !!inputs.gridOverride),
    onOpenChange: setGridOpen,
  };
  const fileLegend = multiFile
    ? [...new Set(sheet.poses.map((p) => p.file))]
        .map((f) => `${Number(f) + 1} = ${fileName(f)}`)
        .join(' · ')
    : '';

  return (
    <SplitStage
      canvas={
        <Panel
          title='assembled sheet'
          aside={
            <Text
              size='micro'
              variant='label'
              component='span'
              title={[
                'wheel zoom · drag pan',
                fileLegend && `tiles are named file/cell: ${fileLegend}`,
              ]
                .filter(Boolean)
                .join(' — ')}
            >
              {((sheet.bbox.maxX - sheet.bbox.minX) / 10).toFixed(1)} ×{' '}
              {((sheet.bbox.maxY - sheet.bbox.minY) / 10).toFixed(1)} cm
            </Text>
          }
          bodyClassName='p-0'
        >
          <SheetViewport bbox={sheet.bbox} onPick={(k) => setPicked(k || null)}>
            {({ unit }) => (
              <>
                {sheet.poses.map((p) => {
                  const x = p.toSheet.e;
                  const y = p.toSheet.f;
                  const w = p.widthMm;
                  const h = p.heightMm;
                  const on = picked === keyOf(p);
                  const bad = p.residualMm > PATIMPORT.registrationMaxResidualMm * 0.66;
                  return (
                    <g key={keyOf(p)} data-key={keyOf(p)}>
                      <rect
                        x={x}
                        y={vy(y + h)}
                        width={w}
                        height={h}
                        fill={on ? SHEET_INK.pick : '#ffffff'}
                        fillOpacity={on ? 0.7 : 0}
                        stroke={bad ? SHEET_INK.blue : '#d5d5d5'}
                        strokeWidth={on ? 2 : 1}
                        vectorEffect='non-scaling-stroke'
                      />
                      <text
                        x={x + 6}
                        y={vy(y + h - 6) + Math.min(unit * 12, w / 10)}
                        fontSize={Math.min(unit * 12, w / 10)}
                        fill={bad ? SHEET_INK.blue : SHEET_INK.mut}
                      >
                        {tileName(p)}
                        {bad ? ` · ${p.residualMm.toFixed(2)}` : ''}
                      </text>
                    </g>
                  );
                })}
                {masked && (
                  <path
                    d={masked}
                    pointerEvents='none'
                    fill='none'
                    stroke={SHEET_INK.source}
                    strokeOpacity={0.6}
                    strokeWidth={0.5}
                    vectorEffect='non-scaling-stroke'
                  />
                )}
                <path
                  d={preview}
                  pointerEvents='none'
                  fill='none'
                  stroke={SHEET_INK.ink}
                  strokeOpacity={0.7}
                  // Hairlines at every zoom: a stroke in sheet mm turns a 9-metre file-per-size
                  // strip into solid grey at fit.
                  strokeWidth={0.75}
                  vectorEffect='non-scaling-stroke'
                  strokeLinejoin='round'
                />
                {weak.map((w, i) => {
                  const a = poseOf(w.from);
                  const b = poseOf(w.to);
                  if (!a || !b) return null;
                  const ax = a.toSheet.e + a.widthMm / 2;
                  const ay = a.toSheet.f + a.heightMm / 2;
                  const bx = b.toSheet.e + b.widthMm / 2;
                  const by = b.toSheet.f + b.heightMm / 2;
                  return (
                    <line
                      key={i}
                      x1={ax}
                      y1={vy(ay)}
                      x2={bx}
                      y2={vy(by)}
                      stroke={SHEET_INK.blue}
                      strokeWidth={Math.min(unit * 3, 3 * (a.widthMm / 200))}
                      strokeDasharray={`${unit * 10} ${unit * 6}`}
                      pointerEvents='none'
                    />
                  );
                })}
              </>
            )}
          </SheetViewport>
        </Panel>
      }
      side={
        <Panel title='registration'>
          <div className='flex flex-col gap-2'>
            {/* the state in one line */}
            <Text size='micro' component='p' className='tabular-nums'>
              {sheet.poses.length}/{sheet.poses.length + missing} tiles placed
              {sheets.length > 1 ? ` · ${sheets.length} sheets` : ''}
              {sheet.overview ? ` · overview p${sheet.overview.page + 1}` : ''}
            </Text>

            {/* D3: a refused placement has no "accept" — every reason stays in view */}
            {refused.length > 0 && (
              <CalloutBox tone='error' className='py-1'>
                {refused.map((w) => (
                  <Text key={w} size='micro' component='p'>
                    {w}
                  </Text>
                ))}
              </CalloutBox>
            )}
            {missing > 0 && (
              <Text size='micro' component='p' className='text-warning'>
                ! {missing} {missing === 1 ? 'page' : 'pages'} missing
              </Text>
            )}
            {overLimit && (
              <div data-ask-zone='' className='flex flex-wrap items-center gap-2'>
                <Text
                  size='micro'
                  component='span'
                  className={inputs.residualsAccepted ? 'text-labelColor' : 'text-warning'}
                >
                  {inputs.residualsAccepted ? '' : '! '}
                  {weak.length
                    ? `${weak.length} blue ${weak.length === 1 ? 'seam' : 'seams'} · `
                    : ''}
                  {fmtMm(worst)} (limit {PATIMPORT.registrationMaxResidualMm})
                </Text>
                <Chip
                  tone={inputs.residualsAccepted ? undefined : 'attention'}
                  selected={inputs.residualsAccepted}
                  pressed={inputs.residualsAccepted}
                  onClick={() => patchInputs({ residualsAccepted: !inputs.residualsAccepted })}
                  title='I looked at the blue seams — the drawing runs on across them'
                  {...ask('sheet-accept', acceptAsks, 'check the blue seams, then accept')}
                >
                  accept {fmtMm(worst)}
                </Chip>
              </div>
            )}

            {out.clean && <SheetCleanRows api={api} clean={out.clean} />}
          </div>

          {/* the hand grid: the coach's zone when pages are missing or the placement is refused */}
          <div data-ask-zone='' data-ask-hint={GRID_HINT}>
            <Fold label='grid by hand' ask={gridAsks ? 'sheet-grid' : undefined} {...gridFold}>
              <div className='grid grid-cols-2 gap-2'>
                {sheets.length > 1 && (
                  <Field label='grid of sheet' className='col-span-2'>
                    <NativeSelect
                      value={String(gridSheet)}
                      onChange={(v) => setGridSheet(Number(v))}
                      options={sheets.map((n) => ({
                        value: String(n),
                        label: `sheet ${n + 1} · ${tilesIn(n)} tiles`,
                      }))}
                    />
                  </Field>
                )}
                <Field label='rows'>
                  <NumberField
                    {...ask('sheet-grid', gridAsks, GRID_HINT)}
                    value={grid.rows}
                    min={1}
                    step='1'
                    onCommit={(v) =>
                      setGrid((g) => ({ ...g, rows: Math.max(1, Math.round(v ?? 1)) }))
                    }
                  />
                </Field>
                <Field label='columns'>
                  <NumberField
                    value={grid.cols}
                    min={1}
                    step='1'
                    onCommit={(v) =>
                      setGrid((g) => ({ ...g, cols: Math.max(1, Math.round(v ?? 1)) }))
                    }
                  />
                </Field>
                <Field label='step across, mm'>
                  <NumberField
                    value={grid.stepXMm}
                    min={1}
                    onCommit={(v) => setGrid((g) => ({ ...g, stepXMm: v ?? g.stepXMm }))}
                  />
                </Field>
                <Field label='step down, mm'>
                  <NumberField
                    value={grid.stepYMm}
                    min={1}
                    onCommit={(v) => setGrid((g) => ({ ...g, stepYMm: v ?? g.stepYMm }))}
                  />
                </Field>
                <Field label='page order' className='col-span-2'>
                  <NativeSelect
                    value={grid.order}
                    onChange={(v) => setGrid((g) => ({ ...g, order: v as GridOverride['order'] }))}
                    options={[
                      { value: 'row-major', label: 'by rows (A1 A2 A3 … B1)' },
                      { value: 'col-major', label: 'by columns (A1 B1 C1 … A2)' },
                    ]}
                  />
                </Field>
              </div>
              <div className='mt-2 flex flex-wrap gap-2'>
                <Button
                  variant='secondary'
                  size='sm'
                  disabled={!!session.busy}
                  {...ask('sheet-grid', gridAsks, 'apply the grid to place the pages')}
                  onClick={() =>
                    void api.dispatch({
                      type: 'sheet',
                      sheet: gridSheet,
                      override: {
                        ...grid,
                        // The hand grid starts at the first tile page of THAT sheet, in file order.
                        originPage: (() => {
                          const t = session.pages.find(
                            (p) => p.cls === 'tile' && (p.sheet ?? 0) === gridSheet,
                          );
                          return {
                            file: t?.file ?? first?.file ?? '0',
                            page: t?.page ?? first?.page ?? 0,
                          };
                        })(),
                      },
                    })
                  }
                >
                  apply {grid.rows}×{grid.cols} grid
                </Button>
                {inputs.gridOverride && (
                  <Button
                    variant='underline'
                    size='xs'
                    className='text-labelColor hover:text-textColor'
                    onClick={() => void api.dispatch({ type: 'sheet', sheet: 0 })}
                  >
                    back to detected
                  </Button>
                )}
              </div>
            </Fold>
          </div>

          <DebugFold>
            {sheets.length > 1 && (
              <DataTable>
                <thead>
                  <tr>
                    <th data-align='left'>sheet</th>
                    <th>tiles</th>
                    <th>pages</th>
                    <th>worst</th>
                  </tr>
                </thead>
                <tbody>
                  {(sheet.parts ?? []).map((p) => (
                    <tr key={p.sheet}>
                      <td data-align='left'>sheet {p.sheet + 1}</td>
                      <td>{p.pages.length}</td>
                      <td>{pageSpan(p.pages)}</td>
                      <td
                        className={
                          p.maxResidualMm > PATIMPORT.registrationMaxResidualMm || p.missing
                            ? 'text-error'
                            : undefined
                        }
                      >
                        {fmtMm(p.maxResidualMm)}
                        {p.missing ? ` · ${p.missing} missing` : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
            <Row label='tiles placed' value={sheet.poses.length} />
            <Row label='missing tiles' value={missing || '—'} />
            <Row label='worst loop closure' value={fmtMm(worst)} />
            <Row label='limit' value={fmtMm(PATIMPORT.registrationMaxResidualMm, 1)} />
            {sheet.overview && (
              <Row
                label='overview page'
                value={`p. ${sheet.overview.page + 1} · drawn at 1 : ${sheet.overview.factor.toFixed(2)}`}
              />
            )}
            {sheet.warnings.length > 0 && (
              <div className='mt-1 max-h-40 overflow-y-auto'>
                {sheet.warnings.map((w) => (
                  <Text key={w} size='micro' variant='label' component='p'>
                    {w}
                  </Text>
                ))}
              </div>
            )}
            <GroupLabel>tile seams</GroupLabel>
            <DataTable>
              <thead>
                <tr>
                  <th>seam</th>
                  <th data-align='left'>method</th>
                  <th>votes</th>
                  <th title='votes of the runner-up offset / votes of the winner: 0 = one clear answer'>
                    2nd / best
                  </th>
                </tr>
              </thead>
              <tbody>
                {sheet.pairs
                  .filter(
                    (p) => picked == null || keyOf(p.from) === picked || keyOf(p.to) === picked,
                  )
                  .map((p, i) => {
                    const a = poseOf(p.from);
                    const b = poseOf(p.to);
                    const low = isWeak(p);
                    return (
                      <tr key={i}>
                        <td>
                          {tileName(a)} → {tileName(b)}
                        </td>
                        <td data-align='left'>{p.method}</td>
                        <td>{p.score}</td>
                        <td className={low ? 'text-warning' : undefined}>
                          {low ? '! ' : ''}
                          {p.score > 0 ? p.secondBestRatio.toFixed(2) : '—'}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </DataTable>
          </DebugFold>
        </Panel>
      }
    />
  );
}
