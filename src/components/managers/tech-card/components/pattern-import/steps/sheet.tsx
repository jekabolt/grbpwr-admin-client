// Step 3 · SHEET — the tiles put back together. Residuals are VISIBLE (Codex C6): every tile says
// how far its loop closure is off, a weak registration is drawn as a blue seam, and when the
// automatic registration cannot be trusted the operator sets the grid by hand.
import { useMemo, useState } from 'react';
import type { GridOverride, PagePose } from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import CheckboxCommon from 'ui/components/checkbox';
import { DataTable } from 'ui/components/data-table';
import { GroupLabel } from 'ui/components/group-label';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import { SHEET_INK, SheetViewport, vy } from '../sheet-viewport';
import type { ImportSessionApi } from '../use-import-session';
import { Field, NativeSelect, NumberField, Panel, SplitStage, fmtMm } from '../ui-bits';

const keyOf = (p: { file: string; page: number }) => `${p.file}:${p.page}`;

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

export function SheetStep({ api }: { api: ImportSessionApi }) {
  const { session, inputs, patchInputs } = api;
  const out = session.sheet;
  const [picked, setPicked] = useState<string | null>(null);
  const multiFile = new Set(out?.sheet.poses.map((p) => p.file) ?? []).size > 1;
  const fileName = (id: string) => session.files.find((f) => f.id === id)?.name ?? `file ${id}`;
  /** A1, B3 … in the tile grid; with a file-per-size set the file says which drawing. */
  const tileName = (p?: PagePose) =>
    !p
      ? '?'
      : `${multiFile ? `${Number(p.file) + 1}/` : ''}${
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
  // Tile sheets of the files (a Burda file carries two; r4454 a main sheet + interfacing).
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

  return (
    <SplitStage
      canvas={
        <Panel
          title='assembled sheet'
          aside={
            <Text size='micro' variant='label' component='span'>
              {((sheet.bbox.maxX - sheet.bbox.minX) / 10).toFixed(1)} ×{' '}
              {((sheet.bbox.maxY - sheet.bbox.minY) / 10).toFixed(1)} cm · wheel zoom · drag pan
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
                        {tileName(p)} · {p.residualMm.toFixed(2)}
                      </text>
                    </g>
                  );
                })}
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
          {sheets.length > 1 && (
            <Field label='sheet' className='mb-2'>
              <NativeSelect
                value={String(sheet.id)}
                disabled={!!session.busy}
                onChange={(v) =>
                  void api.dispatch({ type: 'sheet', sheet: Number(v), override: undefined })
                }
                options={sheets.map((n) => ({
                  value: String(n),
                  label: `sheet ${n + 1} · ${tilesIn(n)} tiles`,
                }))}
              />
            </Field>
          )}
          <Row label='tiles placed' value={sheet.poses.length} />
          <Row
            label='missing tiles'
            value={
              <span className={sheet.missing.length ? 'text-error' : undefined}>
                {sheet.missing.length || '—'}
              </span>
            }
          />
          <Row
            label='worst loop closure'
            value={
              <span
                className={worst > PATIMPORT.registrationMaxResidualMm ? 'text-error' : undefined}
              >
                {fmtMm(worst)}
              </span>
            }
          />
          <Row label='limit' value={fmtMm(PATIMPORT.registrationMaxResidualMm, 1)} />
          {overLimit && (
            <label className='mt-1 flex items-start gap-2'>
              <CheckboxCommon
                name='residuals-accept'
                checked={inputs.residualsAccepted}
                onChange={(v) => patchInputs({ residualsAccepted: v })}
              />
              <Text size='micro' component='span' className='text-warning'>
                I looked at the blue seams — the drawing runs on across them; accept {fmtMm(worst)}
              </Text>
            </label>
          )}
          {sheet.overview && (
            <Row
              label='overview page'
              value={`p. ${sheet.overview.page + 1} · drawn at 1 : ${sheet.overview.factor.toFixed(2)}`}
            />
          )}

          {sheet.warnings.length > 0 && (
            <CalloutBox tone='warning' className='mt-2 max-h-40 overflow-y-auto'>
              {sheet.warnings.map((w) => (
                <Text key={w} size='micro' component='p'>
                  {w}
                </Text>
              ))}
            </CalloutBox>
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
                .filter((p) => picked == null || keyOf(p.from) === picked || keyOf(p.to) === picked)
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

          {multiFile && (
            <Text size='micro' variant='label' component='p' className='mt-1'>
              tiles are named file/cell:{' '}
              {[...new Set(sheet.poses.map((p) => p.file))]
                .map((f) => `${Number(f) + 1} = ${fileName(f)}`)
                .join(' · ')}
            </Text>
          )}

          <GroupLabel>grid by hand</GroupLabel>
          <Text size='micro' variant='label' component='p' className='mb-1'>
            when the tiles do not register (no recurrence, a missing page), say how they were
            printed.
          </Text>
          <div className='grid grid-cols-2 gap-2'>
            <Field label='rows'>
              <NumberField
                value={grid.rows}
                min={1}
                step='1'
                onCommit={(v) => setGrid((g) => ({ ...g, rows: Math.max(1, Math.round(v ?? 1)) }))}
              />
            </Field>
            <Field label='columns'>
              <NumberField
                value={grid.cols}
                min={1}
                step='1'
                onCommit={(v) => setGrid((g) => ({ ...g, cols: Math.max(1, Math.round(v ?? 1)) }))}
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
              onClick={() =>
                void api.dispatch({
                  type: 'sheet',
                  sheet: sheet.id,
                  override: {
                    ...grid,
                    // The hand grid starts at the first tile page of THIS sheet, in file order.
                    originPage: (() => {
                      const t = session.pages.find((p) => p.cls === 'tile' && p.sheet === sheet.id);
                      return {
                        file: t?.file ?? first?.file ?? '0',
                        page: t?.page ?? first?.page ?? 0,
                      };
                    })(),
                  },
                })
              }
            >
              apply grid
            </Button>
            {inputs.gridOverride && (
              <Button
                variant='underline'
                size='xs'
                className='text-labelColor hover:text-textColor'
                onClick={() => void api.dispatch({ type: 'sheet', sheet: sheet.id })}
              >
                back to detected
              </Button>
            )}
          </div>
        </Panel>
      }
    />
  );
}
