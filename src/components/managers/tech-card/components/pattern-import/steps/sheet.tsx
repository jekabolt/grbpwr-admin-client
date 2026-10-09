// Step 3 · SHEET — the tiles put back together. Residuals are VISIBLE (Codex C6): every tile says
// how far its loop closure is off, a weak registration is drawn as a blue seam, and when the
// automatic registration cannot be trusted the operator sets the grid by hand.
import { useState } from 'react';
import type { GridOverride } from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { DataTable } from 'ui/components/data-table';
import { GroupLabel } from 'ui/components/group-label';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import { SHEET_INK, SheetViewport, f32Attr, vy } from '../sheet-viewport';
import type { ImportSessionApi } from '../use-import-session';
import { Field, NativeSelect, NumberField, Panel, SplitStage, fmtMm } from '../ui-bits';

const tileName = (row?: number, col?: number) =>
  row == null || col == null ? '?' : `${String.fromCharCode(65 + row)}${col + 1}`;

export function SheetStep({ api }: { api: ImportSessionApi }) {
  const { session, inputs } = api;
  const out = session.sheet;
  const [picked, setPicked] = useState<number | null>(null);
  const [grid, setGrid] = useState<GridOverride>(
    inputs.gridOverride ?? {
      rows: Math.max(1, ...(out?.sheet.poses.map((p) => (p.row ?? 0) + 1) ?? [1])),
      cols: Math.max(1, ...(out?.sheet.poses.map((p) => (p.col ?? 0) + 1) ?? [1])),
      stepXMm: 200,
      stepYMm: 287,
      order: 'row-major',
      originPage: { file: '0', page: out?.sheet.poses[0]?.page ?? 0 },
    },
  );
  if (!out) return null;
  const { sheet } = out;
  const worst = Math.max(0, ...sheet.poses.map((p) => p.residualMm));
  const weak = sheet.pairs.filter((p) => p.secondBestRatio < PATIMPORT.registrationMinPeakRatio);
  const poseOf = (page: number) => sheet.poses.find((p) => p.page === page);

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
          <SheetViewport bbox={sheet.bbox} onPick={(k) => setPicked(k ? Number(k) : null)}>
            {({ unit }) => (
              <>
                {sheet.poses.map((p) => {
                  const x = p.toSheet.e;
                  const y = p.toSheet.f;
                  const w = p.widthMm;
                  const h = p.heightMm;
                  const on = picked === p.page;
                  const bad = p.residualMm > PATIMPORT.registrationMaxResidualMm * 0.66;
                  return (
                    <g key={p.page} data-key={p.page}>
                      <rect
                        x={x}
                        y={vy(y + h)}
                        width={w}
                        height={h}
                        fill={on ? SHEET_INK.pick : '#ffffff'}
                        fillOpacity={on ? 0.7 : 0}
                        stroke={bad ? SHEET_INK.blue : '#d5d5d5'}
                        strokeWidth={unit * (on ? 2 : 1)}
                      />
                      <text
                        x={x + 6}
                        y={vy(y + h - 14)}
                        fontSize={unit * 14}
                        fill={bad ? SHEET_INK.blue : SHEET_INK.mut}
                      >
                        {tileName(p.row, p.col)} · {p.residualMm.toFixed(2)}
                      </text>
                    </g>
                  );
                })}
                <g pointerEvents='none' fill='none' stroke={SHEET_INK.ink} strokeWidth={unit * 0.8}>
                  {out.previewPaths.map((a, i) => (
                    <polyline key={i} points={f32Attr(a)} strokeOpacity={0.55} />
                  ))}
                </g>
                {weak.map((w, i) => {
                  const a = poseOf(w.from.page);
                  const b = poseOf(w.to.page);
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
                      strokeWidth={unit * 3}
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
          {sheet.overview && (
            <Row
              label='overview page'
              value={`p. ${sheet.overview.page + 1} · 1 : ${Math.round(1 / sheet.overview.factor)}`}
            />
          )}

          {sheet.warnings.length > 0 && (
            <CalloutBox tone='warning' className='mt-2'>
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
                <th>peak ratio</th>
              </tr>
            </thead>
            <tbody>
              {sheet.pairs
                .filter((p) => picked == null || p.from.page === picked || p.to.page === picked)
                .map((p, i) => {
                  const a = poseOf(p.from.page);
                  const b = poseOf(p.to.page);
                  const low = p.secondBestRatio < PATIMPORT.registrationMinPeakRatio;
                  return (
                    <tr key={i}>
                      <td>
                        {tileName(a?.row, a?.col)} → {tileName(b?.row, b?.col)}
                      </td>
                      <td data-align='left'>{p.method}</td>
                      <td>{p.score}</td>
                      <td className={low ? 'text-warning' : undefined}>
                        {low ? '! ' : ''}
                        {p.secondBestRatio.toFixed(1)}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </DataTable>

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
              onClick={() => void api.dispatch({ type: 'sheet', sheet: sheet.id, override: grid })}
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
