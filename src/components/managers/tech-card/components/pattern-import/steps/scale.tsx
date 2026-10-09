// Step 2 · SCALE — a printed pattern is only as true as its test square. Shows what was found
// (the square, the grid, the declared size), measured against nominal, and lets the operator
// type what a ruler says when the detection is not sure (contract: manual mm when
// confidence < 0.9 or the deviation exceeds 0.3 %).
import { PATIMPORT } from 'lib/pattern-import/types';
import { cn } from 'lib/utility';
import CheckboxCommon from 'ui/components/checkbox';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import type { ImportSessionApi } from '../use-import-session';
import { Field, NumberField, Panel, SplitStage, fmtMm, fmtPct } from '../ui-bits';

const METHOD: Record<string, string> = {
  'test-square': 'test square',
  grid: 'tile grid',
  declared: 'declared on the sheet',
  manual: 'measured by hand',
  none: 'take as 1 : 1',
};

export function ScaleStep({ api }: { api: ImportSessionApi }) {
  const { session, inputs, patchInputs } = api;
  const cands = session.scale.candidates;
  const chosen = cands[inputs.scaleIndex];
  const decision = api.scaleDecision();
  const dev = decision ? decision.factor - 1 : 0;
  const needsHuman =
    !!chosen && (chosen.confidence < 0.9 || Math.abs(dev) > PATIMPORT.scaleWarnRatio);

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
            declared={chosen?.declaredMm ?? null}
            label={chosen?.evidence?.text}
          />
        </Panel>
      }
      side={
        <Panel title='how the scale is known'>
          <div role='radiogroup' aria-label='scale source' className='divide-y divide-hairline'>
            {cands.map((c, i) => {
              const on = i === inputs.scaleIndex;
              return (
                <button
                  key={i}
                  type='button'
                  role='radio'
                  aria-checked={on}
                  onClick={() =>
                    patchInputs({ scaleIndex: i, manualMeasuredMm: null, scaleConfirmed: false })
                  }
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
                    <Text
                      size='micro'
                      variant='label'
                      component='span'
                      className='block tabular-nums'
                    >
                      {c.measuredMm != null && c.declaredMm != null
                        ? `measured ${fmtMm(c.measuredMm)} · nominal ${fmtMm(c.declaredMm, 0)}`
                        : 'no evidence on the sheet'}
                      {c.evidence?.text ? ` · “${c.evidence.text}”` : ''}
                    </Text>
                  </span>
                  <Pill tone={c.confidence >= 0.9 ? 'ok' : c.confidence > 0 ? 'attention' : 'mut'}>
                    {c.confidence > 0 ? fmtPct(c.confidence, 0) : '—'}
                  </Pill>
                </button>
              );
            })}
          </div>

          <GroupLabel>result</GroupLabel>
          <Row label='factor' value={decision ? decision.factor.toFixed(5) : '—'} />
          <Row
            label='deviation from 1 : 1'
            value={
              <span
                className={Math.abs(dev) > PATIMPORT.scaleWarnRatio ? 'text-warning' : undefined}
              >
                {decision ? `${dev >= 0 ? '+' : ''}${(dev * 100).toFixed(3)} %` : '—'}
              </span>
            }
          />
          <Row
            label='limit without a check'
            value={`± ${(PATIMPORT.scaleWarnRatio * 100).toFixed(1)} %`}
          />

          <GroupLabel>measured by hand</GroupLabel>
          <div className='grid grid-cols-2 gap-2'>
            <Field label='square on paper, mm'>
              <NumberField
                value={inputs.manualMeasuredMm}
                min={1}
                placeholder={chosen?.measuredMm?.toFixed(2) ?? ''}
                onCommit={(v) => patchInputs({ manualMeasuredMm: v && v > 0 ? v : null })}
                disabled={!chosen?.declaredMm}
              />
            </Field>
            <Field label='nominal, mm'>
              <NumberField value={chosen?.declaredMm ?? null} onCommit={() => undefined} disabled />
            </Field>
          </div>
          <Text size='micro' variant='label' component='p' className='mt-1'>
            print page {chosen?.evidence ? chosen.evidence.page + 1 : '—'} at 100 %, measure the
            square with a ruler and type it here — it overrides the detection.
          </Text>

          {needsHuman && !inputs.manualMeasuredMm && (
            <label className='mt-2 flex items-center gap-2'>
              <CheckboxCommon
                name='scale-confirm'
                checked={inputs.scaleConfirmed}
                onChange={(v) => patchInputs({ scaleConfirmed: v })}
              />
              <Text size='micro' component='span' className='text-warning'>
                the detection is not certain — I checked the square on paper
              </Text>
            </label>
          )}
        </Panel>
      }
    />
  );
}

/** Nominal square dashed, measured square in ink, both from one corner — the gap IS the error. */
function SquareDrawing({
  measured,
  declared,
  label,
}: {
  measured: number | null;
  declared: number | null;
  label?: string;
}) {
  if (!declared || !measured)
    return (
      <div className='flex h-full items-center justify-center'>
        <Text size='micro' variant='label'>
          no test square on the sheet — the file is taken as true size
        </Text>
      </div>
    );
  // Exaggerate the difference ×20 so a 0.1 % error is visible at all; the numbers stay true.
  const k = 20;
  const shown = declared + (measured - declared) * k;
  const pad = declared * 0.35;
  const size = Math.max(declared, shown);
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
        width={shown}
        height={shown}
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
        y2={shown}
        stroke='#111111'
        strokeWidth={0.3}
      />
      <text
        x={-pad * 0.5}
        y={shown / 2}
        fontSize={pad * 0.09}
        textAnchor='middle'
        fill='#111111'
        transform={`rotate(-90 ${-pad * 0.5} ${shown / 2})`}
      >
        measured {measured.toFixed(2)} mm
      </text>
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
