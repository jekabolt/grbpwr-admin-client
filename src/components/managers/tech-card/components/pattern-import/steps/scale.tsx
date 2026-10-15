// Stage 2 · SCALE — a printed pattern is only as true as its test square. When the detection is
// sure the step is one line ("scale 1:1 · test square 100 mm"); when it is not, one question and
// its two answers: the square on paper typed in, or "it is 100 mm" (contract: a human look when
// confidence < 0.9, the deviation exceeds 0.3 %, the square is not square, or a page has no
// certain scale of its own). Candidates, factor and calibrations live in folds.
import { useState } from 'react';
import { PATIMPORT } from 'lib/pattern-import/types';
import type { ScaleCandidate } from 'lib/pattern-import/types';
import { cn } from 'lib/utility';
import { Chip } from 'ui/components/chip';
import { DataTable } from 'ui/components/data-table';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import { CALIBRATION_SURE, scaleUncertain } from '../auto-advance';
import { anisotropyOf, squareSidesOf } from '../formats';
import type { ImportSessionApi } from '../use-import-session';
import { DebugFold, Fold, NumberField, Panel, SplitStage, ask, fmtMm, fmtPct } from '../ui-bits';

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

  // the one question, worded like the footer's ask line (the % is the question's own evidence)
  const question = !needsHuman
    ? null
    : nonSquare && sides
      ? `square is ${sides.w.toFixed(2)} × ${sides.h.toFixed(2)} mm — measure the long side`
      : chosen && chosen.confidence < 0.9
        ? `${METHOD[chosen.method] ?? chosen.method} not certain (${fmtPct(chosen.confidence, 0)})`
        : Math.abs(chosen!.factor - 1) > PATIMPORT.scaleWarnRatio
          ? `${METHOD[chosen!.method] ?? chosen!.method} is off 1:1 by ${((chosen!.factor - 1) * 100).toFixed(2)} %`
          : 'a page has no scale of its own';

  const confirmChip = needsHuman && !inputs.manualMeasuredMm && (
    <Chip
      tone={inputs.scaleConfirmed ? undefined : 'attention'}
      selected={inputs.scaleConfirmed}
      pressed={inputs.scaleConfirmed}
      onClick={() => patchInputs({ scaleConfirmed: !inputs.scaleConfirmed })}
      title='I checked the square on paper — the detection stands'
      {...ask('scale-confirm', asks)}
    >
      {nominal ? `it is ${nominal} mm` : 'the scale is right'}
    </Chip>
  );
  const measure = !!nominal && (
    <Fold
      label='on paper'
      open={measureOpen ?? ((asks && nonSquare) || !!inputs.manualMeasuredMm)}
      onOpenChange={setMeasureOpen}
      ask={asks ? 'scale-measured' : undefined}
      className='mt-0'
    >
      <label className='flex items-center gap-2'>
        <Text size='micro' variant='label' component='span' className='uppercase tracking-label'>
          square
        </Text>
        <NumberField
          value={inputs.manualMeasuredMm}
          min={1}
          className='w-24'
          placeholder={chosen?.measuredMm?.toFixed(2) ?? ''}
          onCommit={(v) => patchInputs({ manualMeasuredMm: v && v > 0 ? v : null })}
          title={`print page ${chosen?.evidence ? chosen.evidence.page + 1 : '—'} at 100 %, measure the square with a ruler — it overrides the detection`}
          aria-label='square on paper, mm'
          {...ask('scale-measured', asks)}
        />
        <Text size='micro' variant='label' component='span'>
          mm · nominal {nominal} mm
        </Text>
      </label>
    </Fold>
  );

  return (
    <SplitStage
      canvas={
        <Panel
          title='test square'
          aside={
            chosen?.evidence ? (
              <Text size='micro' variant='label' component='span'>
                page {chosen.evidence.page + 1}
              </Text>
            ) : null
          }
          bodyClassName='p-0'
        >
          <SquareDrawing
            measured={inputs.manualMeasuredMm ?? chosen?.measuredMm ?? null}
            sides={inputs.manualMeasuredMm ? null : sides}
            declared={chosen?.declaredMm ?? null}
            label={chosen?.evidence?.text
              ?.replace(/\s*\[measured[^\]]*\]/, '')
              .replace(/\s*\(traced[^)]*\)/, '')}
          />
        </Panel>
      }
      side={
        <Panel title='scale'>
          <div className='flex flex-col gap-2'>
            {/* the state in one line: what the scale is and how it is known */}
            <Text size='micro' component='p' className='tabular-nums'>
              {decision ? scaleWord(decision.factor) : '—'}
              {chosen && (
                <>
                  {' · '}
                  {inputs.manualMeasuredMm
                    ? `measured by hand ${fmtMm(inputs.manualMeasuredMm)}`
                    : `${METHOD[chosen.method] ?? chosen.method}${nominal ? ` ${nominal} mm` : ''}`}
                </>
              )}
            </Text>

            {question && (
              <Text
                size='micro'
                component='p'
                className={answered ? 'text-labelColor' : 'text-warning'}
              >
                {answered ? '' : '! '}
                {question}
              </Text>
            )}
            {/* a page whose own calibration is weak: the rows the question is about */}
            {needsHuman && weakCalibs.length > 0 && (
              <Text size='micro' variant='label' component='p'>
                {weakCalibs
                  .map(
                    (c) =>
                      `${session.files.length > 1 ? `${fileName(c.file)} · ` : ''}p${c.page + 1} ${
                        c.calibration.method === 'inherited' ? 'inherited' : 'none'
                      }`,
                  )
                  .join(' · ')}
              </Text>
            )}

            {nonSquare ? (
              <>
                {measure}
                {confirmChip && <div>{confirmChip}</div>}
              </>
            ) : (
              <>
                {confirmChip && <div>{confirmChip}</div>}
                {measure}
              </>
            )}
            {inputs.manualMeasuredMm != null && (
              <Chip
                quiet
                onClick={() => patchInputs({ manualMeasuredMm: null })}
                title='drop the hand measure — the detection is used again'
              >
                use the detection
              </Chip>
            )}

            {unique.length > 1 && (
              <Fold label={`sources (${unique.length})`} className='mt-0'>
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
                            {c.confidence > 0 ? 'check' : '—'}
                          </Pill>
                        )}
                      </button>
                    );
                  })}
                </div>
              </Fold>
            )}
          </div>

          <DebugFold>
            <Row label='factor' value={decision ? decision.factor.toFixed(5) : '—'} />
            <Row
              label='deviation from 1 : 1'
              value={decision ? `${dev >= 0 ? '+' : ''}${(dev * 100).toFixed(3)} %` : '—'}
            />
            <Row
              label='limit without a check'
              value={`± ${(PATIMPORT.scaleWarnRatio * 100).toFixed(1)} %`}
            />
            {chosen && <Row label='confidence' value={fmtPct(chosen.confidence, 0)} />}
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
                            {sq
                              ? `${sq.measuredWMm.toFixed(2)} × ${sq.measuredHMm.toFixed(2)}`
                              : '—'}
                          </td>
                          <td className='tabular-nums'>{sq ? sq.residualMm.toFixed(3) : '—'}</td>
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

/** Nominal square dashed, measured square in ink, both from one corner — the gap IS the error. */
function SquareDrawing({
  measured,
  sides,
  declared,
  label,
}: {
  measured: number | null;
  /** Both sides when the file measures them apart (a non-square square). */
  sides: { w: number; h: number } | null;
  declared: number | null;
  label?: string;
}) {
  if (!declared || !measured)
    return (
      <div className='flex h-full items-center justify-center'>
        <Text size='micro' variant='label'>
          no test square — taken as true size
        </Text>
      </div>
    );
  // Exaggerate the difference ×20 so a 0.1 % error is visible at all; the numbers stay true.
  const k = 20;
  const shownW = declared + ((sides?.w ?? measured) - declared) * k;
  const shownH = declared + ((sides?.h ?? measured) - declared) * k;
  const pad = declared * 0.35;
  const size = Math.max(declared, shownW, shownH);
  return (
    <svg
      viewBox={`${-pad} ${-pad} ${size + pad * 2} ${size + pad * 2}`}
      className='h-full w-full'
      fontFamily='monospace'
    >
      <rect
        x={0}
        y={0}
        width={declared}
        height={declared}
        fill='none'
        stroke='#8a8a8a'
        strokeWidth={0.4}
        strokeDasharray='2 1.2'
      />
      <rect
        x={0}
        y={0}
        width={shownW}
        height={shownH}
        fill='#f2f2f2'
        fillOpacity={0.6}
        stroke='#111111'
        strokeWidth={0.5}
      />
      <line
        x1={0}
        y1={-pad * 0.35}
        x2={declared}
        y2={-pad * 0.35}
        stroke='#8a8a8a'
        strokeWidth={0.3}
      />
      <text
        x={declared / 2}
        y={-pad * 0.5}
        fontSize={pad * 0.09}
        textAnchor='middle'
        fill='#666666'
      >
        nominal {declared} mm
      </text>
      <line
        x1={-pad * 0.35}
        y1={0}
        x2={-pad * 0.35}
        y2={shownH}
        stroke='#111111'
        strokeWidth={0.3}
      />
      <text
        x={-pad * 0.5}
        y={shownH / 2}
        fontSize={pad * 0.09}
        textAnchor='middle'
        fill='#111111'
        transform={`rotate(-90 ${-pad * 0.5} ${shownH / 2})`}
      >
        measured {(sides?.h ?? measured).toFixed(2)} mm
      </text>
      {sides && (
        <text
          x={shownW / 2}
          y={shownH + pad * 0.3}
          fontSize={pad * 0.09}
          textAnchor='middle'
          fill='#111111'
        >
          measured {sides.w.toFixed(2)} mm
        </text>
      )}
      {label && (
        <text
          x={declared / 2}
          y={declared / 2}
          fontSize={pad * 0.11}
          textAnchor='middle'
          dominantBaseline='middle'
          fill='#111111'
        >
          {label}
        </text>
      )}
      <text
        x={size / 2}
        y={size + pad * 0.6}
        fontSize={pad * 0.08}
        textAnchor='middle'
        fill='#666666'
      >
        difference drawn × {k}
      </text>
    </svg>
  );
}
