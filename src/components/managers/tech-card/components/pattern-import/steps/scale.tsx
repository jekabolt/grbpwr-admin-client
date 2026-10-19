// Stage 2 · SCALE — a printed pattern is only as true as its test square. When the detection is
// sure the step is one line ("scale 1:1 · test square 100 mm"); when it is not, one question and
// its two answers: the square on paper typed in, or "it is 100 mm" (contract: a human look when
// confidence < 0.9, the deviation exceeds 0.3 %, the square is not square, or a page has no
// certain scale of its own). Candidates, factor and calibrations live in folds.
import { useMemo, useState } from 'react';
import { PATIMPORT } from 'lib/pattern-import/types';
import type { BoxMm, CleanPreview, ScaleCandidate } from 'lib/pattern-import/types';
import { cn } from 'lib/utility';
import { Button, Chip, DataTable, GroupLabel, Pill, Row, Text, EmptyCell } from 'ui';
import { CALIBRATION_SURE, scaleUncertain } from '../auto-advance';
import { anisotropyOf, squareSidesOf } from '../formats';
import { SHEET_INK, vy } from '../sheet-viewport';
import type { ImportSessionApi } from '../use-import-session';
import { DebugFold, Fold, NumberField, Panel, SplitStage, ask, fmtMm, fmtPct } from '../ui-bits';
import { pathData } from './files-clean';

const METHOD: Record<string, string> = {
  'test-square': 'test square',
  grid: 'tile grid',
  declared: 'declared on the sheet',
  manual: 'measured by hand',
  none: 'take as 1 : 1',
};

/**
 * The candidates with the same method / measured / nominal drawn once (the merge of extract's and
 * the clean stage's candidates can carry one square twice). Each keeps the index of its first
 * copy: `inputs.scaleIndex` still points into the session's own list.
 */
export function uniqueCandidates(cands: readonly ScaleCandidate[]) {
  const seen = new Map<string, number[]>();
  for (const [i, c] of cands.entries()) {
    const k = `${c.method}|${c.measuredMm ?? ''}|${c.declaredMm ?? ''}`;
    seen.set(k, [...(seen.get(k) ?? []), i]);
  }
  return [...seen.values()].map((ix) => ({ c: cands[ix[0]], index: ix[0], all: ix }));
}

const scaleWord = (f: number) => (Math.abs(f - 1) < 5e-4 ? 'scale 1:1' : `scale ×${f.toFixed(3)}`);

export function ScaleStep({ api }: { api: ImportSessionApi }) {
  const { session, inputs, patchInputs } = api;
  const cands = session.scale.candidates;
  const chosen = cands[inputs.scaleIndex];
  const decision = api.scaleDecision();
  const dev = decision ? decision.factor - 1 : 0;
  // A square that is not square in the file (Burda: 100.27 × 99.89) — one factor fixes the mean
  // only; the operator decides on paper.
  const sides = squareSidesOf(chosen?.evidence?.text);
  const skew = sides ? anisotropyOf(sides) : 0;
  const nonSquare = skew > PATIMPORT.scaleWarnRatio;
  const calibs = api.extracted.calibrations ?? [];
  const weakCalibs = calibs.filter((c) => c.calibration.confidence < CALIBRATION_SURE);
  // the hook's own rule (its blocker), calibrations included
  const needsHuman = !!chosen && scaleUncertain(chosen, chosen.factor, calibs);
  const answered = inputs.scaleConfirmed || !!inputs.manualMeasuredMm;
  const asks = needsHuman && !answered;
  const fileName = (id: string) => session.files.find((f) => f.id === id)?.name ?? id;
  const unique = uniqueCandidates(cands);
  const [measureOpen, setMeasureOpen] = useState<boolean | null>(null);
  const nominal = chosen?.declaredMm;

  const page = chosen?.evidence ? chosen.evidence.page + 1 : null;
  const square = chosen?.evidence && nominal ? chosen.evidence.bbox : null;
  // the page the square is on, drawn from the clean stage's page lines (the files step's strip)
  const pagePreview = chosen?.evidence
    ? session.clean?.previews.find((p) => p.page === chosen.evidence!.page)
    : undefined;
  const cm = nominal ? +(nominal / 10).toFixed(1) : null;

  // why a look is needed, in plain words (≤ 12): the operator measures, the reason only frames it
  const why = !needsHuman
    ? null
    : !nominal
      ? 'no test square found in the file'
      : nonSquare
        ? 'the square in the file is not quite square'
        : chosen && chosen.confidence < 0.9
          ? 'not sure this is the test square'
          : Math.abs(chosen!.factor - 1) > PATIMPORT.scaleWarnRatio
            ? `the file looks ${Math.abs((chosen!.factor - 1) * 100).toFixed(1)} % ${
                chosen!.factor > 1 ? 'smaller' : 'bigger'
              } than true size`
            : `${weakCalibs.length === 1 ? 'a page has' : 'some pages have'} no square of their own`;
  // the one-click fix of the footer's warning only when the file's own evidence says 1:1
  const fileSaysTrue = !!decision && Math.abs(decision.factor - 1) < 5e-4 && !nonSquare;
  const keepWord =
    decision && Math.abs(decision.factor - 1) >= 5e-4
      ? `keep ${scaleWord(decision.factor)}`
      : 'the file is 1:1';

  // the measure: a number prefilled with the nominal side, sent only by [use it]
  const [draft, setDraft] = useState<number | null>(null);
  const draftMm = draft ?? inputs.manualMeasuredMm ?? nominal ?? null;
  const measureForm = (live: boolean) => (
    <div className='flex flex-wrap items-center gap-2'>
      <NumberField
        value={draftMm}
        min={1}
        className='w-20'
        onCommit={(v) => setDraft(v && v > 0 ? v : null)}
        aria-label='the square on paper, mm'
        {...ask('scale-measured', live, 'type what your ruler shows, then use it')}
      />
      <Text size='micro' variant='label' component='span'>
        mm
      </Text>
      <Button
        variant='secondary'
        size='sm'
        disabled={!draftMm}
        onClick={() => {
          if (draftMm && draftMm > 0) patchInputs({ manualMeasuredMm: draftMm });
          setDraft(null);
        }}
      >
        use it
      </Button>
    </div>
  );

  return (
    <SplitStage
      canvas={
        <Panel
          title='test square'
          aside={
            page ? (
              <Text size='micro' variant='label' component='span'>
                page {page}
              </Text>
            ) : null
          }
          bodyClassName='p-0 flex flex-col'
        >
          <SquareOnPage preview={pagePreview} square={square} ruler={asks} nominal={nominal} />
          <Text size='micro' variant='label' component='p' className='shrink-0 px-2 pb-2'>
            {!square
              ? 'no test square — taken as true size'
              : asks
                ? `print page ${page} at 100 % — lay a ruler along the square`
                : `test square ${cm} × ${cm} cm found`}
          </Text>
        </Panel>
      }
      side={
        <Panel title='scale'>
          <div className='flex flex-col gap-2'>
            {asks ? (
              /* the one question with a reference: the square on the page, a ruler, a number */
              <div
                data-ask-zone=''
                data-ask-label='how many mm is the square?'
                className='flex flex-col gap-2'
              >
                {why && (
                  <Text size='micro' variant='label' component='p'>
                    {why}
                  </Text>
                )}
                {nominal ? (
                  <>
                    <Text size='micro' component='p' className='text-warning'>
                      ! print page {page} at 100 % and measure this square — how many mm?
                    </Text>
                    {measureForm(true)}
                  </>
                ) : (
                  <Text size='micro' component='p' className='text-warning'>
                    ! is the file true size?
                  </Text>
                )}
                {weakCalibs.length > 0 && (
                  <Text size='micro' variant='label' component='p'>
                    {weakCalibs
                      .map(
                        (c) =>
                          `${session.files.length > 1 ? `${fileName(c.file)} · ` : ''}page ${c.page + 1}`,
                      )
                      .join(' · ')}
                  </Text>
                )}
                <div>
                  <Chip
                    tone='attention'
                    onClick={() => patchInputs({ scaleConfirmed: true })}
                    title='the file prints true size — keep the scale as found'
                    {...ask('scale-confirm', true, 'or keep the file as it is')}
                    {...(fileSaysTrue ? { 'data-ask-fix': '' } : {})}
                  >
                    {keepWord}
                  </Chip>
                </div>
              </div>
            ) : (
              <>
                {/* nothing to do: the scale in one line, one quiet door to double-check */}
                <Text size='micro' component='p' className='tabular-nums'>
                  {decision ? scaleWord(decision.factor) : 'scale 1:1'} ✓
                  {inputs.manualMeasuredMm
                    ? ` · measured ${fmtMm(inputs.manualMeasuredMm)}`
                    : inputs.scaleConfirmed
                      ? ' · confirmed'
                      : ''}
                </Text>
                {(inputs.manualMeasuredMm != null || inputs.scaleConfirmed) && (
                  <div>
                    <Chip
                      quiet
                      onClick={() => patchInputs({ manualMeasuredMm: null, scaleConfirmed: false })}
                      title='drop the answer — the scale found in the file is used again'
                    >
                      {inputs.manualMeasuredMm != null ? 'use the file’s scale' : 'undo'}
                    </Chip>
                  </div>
                )}
                {!!nominal && (
                  <Fold
                    label='printed it? measure to double-check'
                    open={measureOpen ?? false}
                    onOpenChange={setMeasureOpen}
                    className='mt-0'
                  >
                    <Text size='micro' variant='label' component='p' className='mb-1'>
                      print page {page} at 100 %, measure the square
                    </Text>
                    {measureForm(false)}
                  </Fold>
                )}
              </>
            )}

            {unique.length > 1 && (
              <div data-ask-zone=''>
                <Fold
                  label={`sources (${unique.length})`}
                  className='mt-0'
                  ask={chosen ? undefined : 'scale-source'}
                >
                  <div
                    role='radiogroup'
                    aria-label='scale source'
                    className='divide-y divide-hairline'
                  >
                    {unique.map(({ c, index, all }) => {
                      const on = all.includes(inputs.scaleIndex);
                      return (
                        <button
                          key={index}
                          type='button'
                          role='radio'
                          aria-checked={on}
                          {...ask('scale-source', !chosen, 'pick the source of the scale')}
                          onClick={() =>
                            patchInputs({
                              scaleIndex: index,
                              manualMeasuredMm: null,
                              scaleConfirmed: false,
                            })
                          }
                          title={c.evidence?.text ? `“${c.evidence.text}”` : undefined}
                          className={cn(
                            'flex w-full items-start gap-2 px-1 py-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-textColor',
                            on ? 'bg-bgZebra' : 'hover:bg-bgZebra',
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              'mt-0.5 size-3 shrink-0 border',
                              on ? 'border-textColor bg-textColor' : 'border-borderColor',
                            )}
                          />
                          <span className='min-w-0 flex-1'>
                            <Text
                              size='control'
                              variant='uppercase'
                              tracking='label'
                              component='span'
                              className={cn('block', on && 'font-bold')}
                            >
                              {METHOD[c.method] ?? c.method}
                            </Text>
                            {c.measuredMm != null && c.declaredMm != null && (
                              <Text
                                size='micro'
                                variant='label'
                                component='span'
                                className='block tabular-nums'
                              >
                                {fmtMm(c.measuredMm)} · nominal {fmtMm(c.declaredMm, 0)}
                              </Text>
                            )}
                          </span>
                          {c.confidence < 0.9 && (
                            <Pill
                              tone={c.confidence > 0 ? 'attention' : 'mut'}
                              title={c.confidence > 0 ? fmtPct(c.confidence, 0) : undefined}
                            >
                              {c.confidence > 0 ? 'check' : <EmptyCell />}
                            </Pill>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </Fold>
              </div>
            )}
          </div>

          <DebugFold>
            <Row label='factor' value={decision ? decision.factor.toFixed(5) : <EmptyCell />} />
            <Row
              label='deviation from 1 : 1'
              value={decision ? `${dev >= 0 ? '+' : ''}${(dev * 100).toFixed(3)} %` : <EmptyCell />}
            />
            <Row
              label='limit without a check'
              value={`± ${(PATIMPORT.scaleWarnRatio * 100).toFixed(1)} %`}
            />
            {chosen && <Row label='confidence' value={fmtPct(chosen.confidence, 0)} />}
            {chosen && (
              <Row
                label='source'
                value={`${METHOD[chosen.method] ?? chosen.method}${chosen.measuredMm != null ? ` · ${fmtMm(chosen.measuredMm)} in the file` : ''}`}
              />
            )}
            {chosen?.evidence?.text && (
              <Text size='micro' variant='label' component='p' className='break-words'>
                {chosen.evidence.text}
              </Text>
            )}
            {sides && (
              <Row
                label='square in the file'
                value={`${sides.w.toFixed(2)} × ${sides.h.toFixed(2)} mm · ${(skew * 100).toFixed(2)} % apart`}
              />
            )}
            {cands.length !== unique.length && (
              <Row label='candidates' value={`${cands.length} (${unique.length} distinct)`} />
            )}
            {calibs.length > 0 && (
              <>
                <GroupLabel>scan calibration, per page</GroupLabel>
                <DataTable>
                  <thead>
                    <tr>
                      <th>page</th>
                      <th data-align='left'>from</th>
                      <th>traced, mm</th>
                      <th title='corner fit after the correction, mm'>fit</th>
                      <th>sure</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calibs.map((c) => {
                      const sq = c.calibration.square;
                      return (
                        <tr key={`${c.file}:${c.page}`}>
                          <td>
                            {session.files.length > 1 ? `${fileName(c.file)} · ` : ''}
                            {c.page + 1}
                          </td>
                          <td data-align='left'>
                            {c.calibration.method === 'test-square'
                              ? 'own square'
                              : c.calibration.method === 'inherited'
                                ? 'inherited'
                                : 'none'}
                          </td>
                          <td className='whitespace-nowrap tabular-nums'>
                            {sq ? (
                              `${sq.measuredWMm.toFixed(2)} × ${sq.measuredHMm.toFixed(2)}`
                            ) : (
                              <EmptyCell />
                            )}
                          </td>
                          <td className='tabular-nums'>
                            {sq ? sq.residualMm.toFixed(3) : <EmptyCell />}
                          </td>
                          <td
                            className={cn(
                              'whitespace-nowrap',
                              c.calibration.confidence < 0.7 && 'text-warning',
                            )}
                          >
                            {fmtPct(c.calibration.confidence, 0)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </DataTable>
              </>
            )}
          </DebugFold>
        </Panel>
      }
    />
  );
}

/**
 * The page the test square is on, its lines as the file draws them, the square outlined blue. With
 * `ruler` (the question) the view closes in on the square and a ruler lies along its lower side —
 * the reference for "how many mm on paper". No measurement prose inside the drawing.
 */
function SquareOnPage({
  preview,
  square,
  ruler,
  nominal,
}: {
  preview: CleanPreview | undefined;
  square: BoxMm | null;
  ruler: boolean;
  nominal: number | null | undefined;
}) {
  const live = useMemo(() => (preview ? pathData(preview.live) : ''), [preview]);
  const masked = useMemo(
    () => (preview ? pathData(preview.masked.flatMap((m) => m.lines)) : ''),
    [preview],
  );
  if (!square) return <div className='min-h-0 flex-1' aria-hidden />;
  const side = Math.max(square.maxX - square.minX, square.maxY - square.minY);
  // the whole page when nothing is asked; the square and its ruler when the operator measures
  const view =
    preview && !ruler
      ? { x: 0, y: -preview.heightMm, w: preview.widthMm, h: preview.heightMm }
      : {
          x: square.minX - side * 0.45,
          y: vy(square.maxY) - side * 0.35,
          w: side * 1.9,
          h: side * 1.85,
        };
  const pad = Math.max(view.w, view.h) * 0.03;
  // ruler: 0 at the square's left corner, a tick per mm, longer at 5 and 10, cm numbers
  const rx = square.minX;
  const ry = vy(square.minY) + side * 0.04;
  const rh = side * 0.14;
  const len = Math.ceil((nominal ?? side) / 10) * 10;
  const ticks = ruler ? Array.from({ length: len + 1 }, (_, i) => i) : [];
  const k = side / (nominal ?? side);
  return (
    <svg
      viewBox={`${view.x - pad} ${view.y - pad} ${view.w + pad * 2} ${view.h + pad * 2}`}
      className='min-h-0 w-full flex-1'
      fontFamily='monospace'
      role='img'
      aria-label={
        ruler ? 'the test square with a ruler along its side' : 'the test square on its page'
      }
    >
      {preview && (
        <>
          <rect
            x={0}
            y={-preview.heightMm}
            width={preview.widthMm}
            height={preview.heightMm}
            fill='#ffffff'
            stroke='#d5d5d5'
            vectorEffect='non-scaling-stroke'
          />
          <path
            d={masked}
            fill='none'
            stroke={SHEET_INK.source}
            strokeWidth={0.75}
            vectorEffect='non-scaling-stroke'
          />
          <path
            d={live}
            fill='none'
            stroke={SHEET_INK.ink}
            strokeOpacity={0.6}
            strokeWidth={0.75}
            vectorEffect='non-scaling-stroke'
          />
        </>
      )}
      <rect
        x={square.minX}
        y={vy(square.maxY)}
        width={square.maxX - square.minX}
        height={square.maxY - square.minY}
        fill={SHEET_INK.blue}
        fillOpacity={0.06}
        stroke={SHEET_INK.blue}
        strokeWidth={2}
        vectorEffect='non-scaling-stroke'
      />
      {ruler && (
        <g>
          <rect
            x={rx - side * 0.04}
            y={ry}
            width={len * k + side * 0.08}
            height={rh}
            fill='#ffffff'
            stroke={SHEET_INK.ink}
            strokeWidth={1}
            vectorEffect='non-scaling-stroke'
          />
          {ticks.map((i) => (
            <line
              key={i}
              x1={rx + i * k}
              x2={rx + i * k}
              y1={ry}
              y2={ry + rh * (i % 10 === 0 ? 0.5 : i % 5 === 0 ? 0.35 : 0.2)}
              stroke={SHEET_INK.ink}
              strokeWidth={i % 10 === 0 ? 1 : 0.6}
              vectorEffect='non-scaling-stroke'
            />
          ))}
          {ticks
            .filter((i) => i % 10 === 0)
            .map((i) => (
              <text
                key={i}
                x={rx + i * k}
                y={ry + rh * 0.85}
                fontSize={rh * 0.3}
                textAnchor='middle'
                fill={SHEET_INK.ink}
              >
                {i / 10}
              </text>
            ))}
          {/* the side being measured: corner to corner along the ruler's edge */}
          <line
            x1={square.minX}
            x2={square.maxX}
            y1={ry}
            y2={ry}
            stroke={SHEET_INK.blue}
            strokeWidth={3}
            vectorEffect='non-scaling-stroke'
          />
          <text
            x={square.maxX + side * 0.05}
            y={ry + rh * 0.12}
            fontSize={rh * 0.3}
            textAnchor='start'
            dominantBaseline='hanging'
            fill={SHEET_INK.blue}
          >
            ?
          </text>
        </g>
      )}
    </svg>
  );
}
