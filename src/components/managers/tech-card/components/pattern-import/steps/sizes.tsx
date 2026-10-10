// Step 4 · SIZES — the legend (which line style is which size / role), each size row mapped onto
// the CARD's run (owner decision 6), and the questions the line reader could not answer alone
// (flags). Guesses are marked as guesses: a recovered dash motif or a size matched by a weak rule
// is blue until the operator looks at it. Two size rows given one label are one size (a size
// drawn in two looks) — the worker merges them.
import { useState } from 'react';
import type {
  BoxMm,
  ChainRole,
  ChainAmbiguity,
  ExpectedSizes,
  SizeMapEntry,
} from 'lib/pattern-import/types';
import { Chip } from 'ui/components/chip';
import { DataTable } from 'ui/components/data-table';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { cn } from 'lib/utility';
import type { CardContext } from '../client';
import { SHEET_INK, SheetViewport, f32Attr, vy } from '../sheet-viewport';
import type { ImportSessionApi, LegendEdit } from '../use-import-session';
import { DashSample, NativeSelect, Panel, SplitStage, fmtPct } from '../ui-bits';

const ROLES: { value: ChainRole; label: string }[] = [
  { value: 'size', label: 'size line' },
  { value: 'common', label: 'common (all sizes)' },
  { value: 'seam', label: 'seam line' },
  { value: 'grain', label: 'grainline' },
  { value: 'notch', label: 'notch' },
  { value: 'internal', label: 'internal' },
  { value: 'ignore', label: 'ignore' },
];

const FLAG: Record<ChainAmbiguity['kind'], string> = {
  'size-count': 'size count',
  'labels-missing': 'no size names',
  'rank-direction': 'order unsure',
  'class-merge': 'two sizes alike',
  'class-split': 'one size, two looks',
  'size-empty': 'size not drawn',
  unassigned: 'lines without a size',
  'bundle-overfull': 'too many lines',
  'grade-ambiguous': 'which size is which',
};

/** A dash rhythm as the eye reads it: 7.78/1.66, not 7.781600531/1.659…. */
const mm = (xs: readonly number[]) => xs.map((x) => +x.toFixed(2)).join('/');

const around = (p: { x: number; y: number }, r = 60): BoxMm => ({
  minX: p.x - r,
  minY: p.y - r,
  maxX: p.x + r,
  maxY: p.y + r,
});

export function SizesStep({ api, card }: { api: ImportSessionApi; card: CardContext }) {
  const { session, inputs, patchInputs } = api;
  const chains = session.chains;
  const sizes = session.sizes;
  const [hover, setHover] = useState<number | null>(null);
  const [flag, setFlag] = useState<number | null>(null);
  if (!chains || !sizes || !session.sheet) return null;

  const flags = chains.ambiguities ?? [];
  const legendOf = (): LegendEdit[] =>
    chains.classes.map((c) => ({ classId: c.id, role: c.role, sizeLabel: c.sizeLabel }));
  const edit = (classId: number, p: Partial<LegendEdit>) =>
    void api.dispatch({
      type: 'legend',
      edits: legendOf().map((e) => (e.classId === classId ? { ...e, ...p } : e)),
    });
  const setCard = (e: SizeMapEntry, sizeId: string) =>
    void api.setSize(e.source.rank, card.sizes.find((c) => String(c.sizeId) === sizeId) ?? null);

  const flagged = flag != null ? flags[flag] : null;
  const hot =
    hover != null
      ? new Set(chains.classes.find((c) => c.id === hover)?.chains ?? [])
      : flagged
        ? new Set(flagged.chains.length ? flagged.chains : flaggedClassChains(flagged))
        : null;
  function flaggedClassChains(a: ChainAmbiguity) {
    return chains!.classes.filter((c) => a.classes.includes(c.id)).flatMap((c) => c.chains);
  }
  const motifOf = (id: number) => {
    const ev = chains.classes.find((c) => c.id === id)?.evidence ?? [];
    for (const e of ev) {
      if (e.kind === 'declared-dash') return e.dash;
      if (e.kind === 'recovered-motif') return e.motif;
    }
    return null;
  };
  const evidenceText = (id: number) =>
    (chains.classes.find((c) => c.id === id)?.evidence ?? [])
      .map((e) => {
        switch (e.kind) {
          case 'ocg':
            return `layer “${e.name}”`;
          case 'declared-dash':
            return `dash ${mm(e.dash)}`;
          case 'recovered-motif':
            return `motif ${mm(e.motif)} (recovered)`;
          case 'color':
            return `colour rgb(${e.rgb.join(',')})`;
          case 'file':
            return `file ${e.label}`;
          case 'text-label':
            return `text “${e.text}” ${e.distanceMm} mm away`;
          case 'nesting-order':
            return `nesting rank ${e.rank}`;
          case 'colour-only':
            return `light grey only (rgb ${e.rgb.join(',')}) — background or a cut line?`;
          case 'seam-offset':
            return `${e.offsetMm} mm inside the cut line`;
        }
      })
      .join(' · ');
  const entryOfClass = (id: number) => sizes.map.entries.find((e) => e.source.classId === id);
  const classIds = new Set(chains.classes.map((c) => c.id));
  // Sizes not drawn as a legend row of their own (one-size files, DXF block names, a size whose
  // line the reader did not find) are mapped in a table of their own.
  const loose = sizes.map.entries.filter(
    (e) => e.source.classId == null || !classIds.has(e.source.classId),
  );
  const dupe = (sizeId: number | undefined) =>
    sizeId != null && sizes.map.entries.filter((e) => e.card?.sizeId === sizeId).length > 1;
  const labels = chains.classes
    .filter((c) => c.role === 'size')
    .map((c) => c.sizeLabel?.trim().toLowerCase());
  const repeats = labels.some((l, i) => l && labels.indexOf(l) !== i);

  return (
    <SplitStage
      sideWidth={640}
      canvas={
        <Panel
          title='lines by class'
          aside={
            <Text size='micro' variant='label' component='span'>
              hover a legend row or show a flag to see its lines
            </Text>
          }
          bodyClassName='p-0'
        >
          <SheetViewport
            bbox={session.sheet.sheet.bbox}
            focus={flagged?.at ? around(flagged.at) : null}
          >
            {({ unit }) => (
              <>
                <g fill='none' pointerEvents='none'>
                  {chains.chainPreview.map((a, i) =>
                    a.length < 4 ? null : (
                      <polyline
                        key={i}
                        points={f32Attr(a)}
                        stroke={hot ? (hot.has(i) ? SHEET_INK.ink : '#dddddd') : SHEET_INK.mut}
                        strokeWidth={unit * (hot?.has(i) ? 1.6 : 0.8)}
                      />
                    ),
                  )}
                </g>
                {flagged?.at && (
                  <circle
                    cx={flagged.at.x}
                    cy={vy(flagged.at.y)}
                    r={unit * 12}
                    fill='none'
                    stroke={SHEET_INK.blue}
                    strokeWidth={unit * 1.6}
                    pointerEvents='none'
                  />
                )}
              </>
            )}
          </SheetViewport>
        </Panel>
      }
      side={
        <Panel title='legend and sizes'>
          {sizes.expected?.from !== 'source' && (
            <DrawnSizes expected={sizes.expected} onCommit={(n) => void api.setDrawnSizes(n)} />
          )}
          {flags.length > 0 && (
            <>
              <GroupLabel flush>
                flags · {flags.length} {flags.length === 1 ? 'question' : 'questions'} the reader
                could not settle
              </GroupLabel>
              <ul className='mb-2 divide-y divide-hairline'>
                {flags.map((a, i) => (
                  <li
                    key={i}
                    className={cn('flex items-start gap-2 py-1', flag === i && 'bg-bgZebra')}
                  >
                    <Pill tone='attention' className='shrink-0'>
                      ! {FLAG[a.kind] ?? a.kind}
                    </Pill>
                    <Text size='micro' component='span' className='min-w-0 flex-1'>
                      {a.message}
                    </Text>
                    {(a.at || a.chains.length > 0 || a.classes.length > 0) && (
                      <Chip
                        quiet
                        selected={flag === i}
                        pressed={flag === i}
                        onClick={() => setFlag(flag === i ? null : i)}
                        title='light its lines on the sheet'
                      >
                        {flag === i ? 'shown' : 'show'}
                      </Chip>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          <GroupLabel flush={!flags.length}>legend · line style → meaning → card size</GroupLabel>
          <DataTable>
            <thead>
              <tr>
                <th data-align='left'>line</th>
                <th data-align='left'>meaning</th>
                <th data-align='left'>size in file</th>
                <th data-align='left'>card size</th>
                <th>sure</th>
              </tr>
            </thead>
            <tbody>
              {chains.classes.map((c) => {
                const low = c.confidence < 0.6;
                const confirmed = inputs.legendConfirmed.includes(c.id);
                const e = c.role === 'size' ? entryOfClass(c.id) : undefined;
                return (
                  <tr
                    key={c.id}
                    onMouseEnter={() => setHover(c.id)}
                    onMouseLeave={() => setHover(null)}
                    className={hover === c.id ? 'bg-bgZebra' : undefined}
                  >
                    <td data-align='left' title={evidenceText(c.id)}>
                      <DashSample dash={motifOf(c.id)} width={48} />
                      <Text
                        size='nano'
                        variant='label'
                        component='span'
                        className='block max-w-32 truncate'
                      >
                        {evidenceText(c.id) || `${c.chains.length} lines`}
                      </Text>
                    </td>
                    <td data-align='left'>
                      <NativeSelect
                        value={c.role}
                        onChange={(v) =>
                          edit(c.id, {
                            role: v as ChainRole,
                            sizeLabel: v === 'size' ? c.sizeLabel ?? '' : null,
                          })
                        }
                        options={ROLES}
                        aria-label={`meaning of line class ${c.id}`}
                        className='w-28'
                      />
                    </td>
                    <td data-align='left'>
                      {c.role === 'size' ? (
                        <Input
                          defaultValue={c.sizeLabel ?? ''}
                          key={c.sizeLabel ?? ''}
                          className='h-[22px] w-16'
                          aria-label={`size label of line class ${c.id}`}
                          title='type the label of another row to merge the two into one size'
                          onBlur={(ev: React.FocusEvent<HTMLInputElement>) => {
                            const v = ev.currentTarget.value.trim();
                            if (v !== (c.sizeLabel ?? '')) edit(c.id, { sizeLabel: v || null });
                          }}
                          onKeyDown={(ev: React.KeyboardEvent<HTMLInputElement>) => {
                            if (ev.key === 'Enter') ev.currentTarget.blur();
                          }}
                        />
                      ) : (
                        <span className='text-labelColor'>—</span>
                      )}
                    </td>
                    <td data-align='left'>
                      {e ? (
                        <CardSizeCell
                          e={e}
                          card={card}
                          invalid={dupe(e.card?.sizeId)}
                          onChange={(v) => setCard(e, v)}
                          onConfirm={() => void api.confirmSize(e.source.rank)}
                        />
                      ) : (
                        <span className='text-labelColor'>—</span>
                      )}
                    </td>
                    <td>
                      {low && !confirmed ? (
                        <Chip
                          tone='attention'
                          onClick={() =>
                            patchInputs((i) => ({ legendConfirmed: [...i.legendConfirmed, c.id] }))
                          }
                          title={
                            c.evidence.some((x) => x.kind === 'colour-only')
                              ? `${fmtPct(c.confidence, 0)} sure — set aside for its grey colour only; make it a line role if it is the cut line`
                              : `${fmtPct(c.confidence, 0)} sure — recognised from a recovered motif only`
                          }
                        >
                          ! confirm
                        </Chip>
                      ) : (
                        <span className={low ? 'text-labelColor' : undefined}>
                          {fmtPct(c.confidence, 0)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
          <Text size='micro' variant='label' component='p' className='mt-1'>
            {repeats
              ? '! two size rows carry one label — they are read as one size when you next change the legend'
              : 'two size rows with the same label are one size: type the label of the other row to merge them.'}
          </Text>
          {chains.warnings.map((w) => (
            <Text key={w} size='micro' variant='label' component='p'>
              {w}
            </Text>
          ))}

          {loose.length > 0 && (
            <>
              <GroupLabel>sizes · source → card</GroupLabel>
              <DataTable>
                <thead>
                  <tr>
                    <th data-align='left'>in the file</th>
                    <th data-align='left'>card size</th>
                  </tr>
                </thead>
                <tbody>
                  {loose.map((e) => (
                    <tr key={`${e.source.rank}-${e.source.label}`}>
                      <td data-align='left' className='font-bold'>
                        {e.source.label || '(no label)'}
                      </td>
                      <td data-align='left'>
                        <CardSizeCell
                          e={e}
                          card={card}
                          invalid={dupe(e.card?.sizeId)}
                          onChange={(v) => setCard(e, v)}
                          onConfirm={() => void api.confirmSize(e.source.rank)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </>
          )}
          <Text size='micro' variant='label' component='p' className='mt-1'>
            run read from {sizes.run.encoding.replace('-', ' ')}
            {sizes.run.evidence.length ? ` · ${sizes.run.evidence.join(' · ')}` : ''}
          </Text>
          {sizes.map.unmapped.length > 0 && (
            <Text size='micro' component='p' className='mt-1 text-warning'>
              ! card sizes with no source: {sizes.map.unmapped.map((c) => c.name).join(', ')} — the
              card will show them missing
            </Text>
          )}
          {card.sizes.length === 0 && (
            <Text size='micro' component='p' className='mt-1 text-error'>
              ! the card has no size range — block names need card sizes. set the range on the card
              first.
            </Text>
          )}
        </Panel>
      }
    />
  );
}

/**
 * H1: how many sizes the sheet draws, when the file itself does not say (every size drawn alike).
 * The card's size range is the default; the fill ranks each piece into that many sizes and holds
 * back (never guesses) a piece it cannot rank. Empty = back to the card's range.
 */
function DrawnSizes({
  expected,
  onCommit,
}: {
  expected: ExpectedSizes | null;
  onCommit: (n: number | null) => void;
}) {
  const note = !expected
    ? 'the lines do not say how many sizes are drawn and the card has no size range. type the number.'
    : expected.from === 'card'
      ? `from the card's size range. each piece is ranked into ${expected.n} sizes; a piece that cannot be ranked is held back, not guessed. change it if the sheet draws fewer.`
      : expected.n === 1
        ? 'one size: each piece closes as a single outline.'
        : `set by you. a piece that cannot be ranked into ${expected.n} sizes is held back, not guessed.`;
  return (
    <div className='mb-3'>
      <GroupLabel flush>sizes drawn on this sheet</GroupLabel>
      <span className='flex items-center gap-1.5'>
        <Input
          type='number'
          min={1}
          max={30}
          step={1}
          inputMode='numeric'
          key={`${expected?.from}-${expected?.n ?? 'none'}`}
          defaultValue={expected?.n ?? ''}
          aria-label='sizes drawn on this sheet'
          aria-describedby='drawn-sizes-note'
          aria-invalid={!expected || undefined}
          className='h-[22px] w-16 tabular-nums'
          onBlur={(ev: React.FocusEvent<HTMLInputElement>) => {
            const raw = ev.currentTarget.value.trim();
            const n = raw === '' ? null : Math.round(Number(raw));
            if (n !== null && (!Number.isFinite(n) || n < 1 || n > 30)) {
              ev.currentTarget.value = expected ? String(expected.n) : '';
              return;
            }
            if (n !== (expected?.from === 'operator' ? expected.n : null)) onCommit(n);
          }}
          onKeyDown={(ev: React.KeyboardEvent<HTMLInputElement>) => {
            if (ev.key === 'Enter') ev.currentTarget.blur();
          }}
        />
        {expected?.from === 'operator' ? (
          <Pill tone='ink'>set</Pill>
        ) : expected ? (
          <Pill tone='attention' title="taken from the card's size range">
            card
          </Pill>
        ) : (
          <Pill tone='attention'>! needed</Pill>
        )}
      </span>
      <Text
        id='drawn-sizes-note'
        size='micro'
        component='p'
        className={cn('mt-1', expected ? 'text-labelColor' : 'text-error')}
      >
        {note}
      </Text>
    </div>
  );
}

/** Card size of one source size: a select, how sure the match is, and a confirm for a guess. */
function CardSizeCell({
  e,
  card,
  invalid,
  onChange,
  onConfirm,
}: {
  e: SizeMapEntry;
  card: CardContext;
  invalid: boolean;
  onChange: (sizeId: string) => void;
  onConfirm: () => void;
}) {
  const guess = e.origin === 'auto' && !!e.card && (e.confidence ?? 1) < 0.9;
  const why = e.evidence?.join(' · ');
  return (
    <span className='flex items-center gap-1.5'>
      <NativeSelect
        value={e.card ? String(e.card.sizeId) : ''}
        onChange={onChange}
        invalid={invalid}
        aria-label={`card size for source size ${e.source.label}`}
        className='w-28'
        title={why}
        options={[
          { value: '', label: 'not exported' },
          ...card.sizes.map((c) => ({ value: String(c.sizeId), label: c.name })),
        ]}
      />
      {e.origin === 'operator' ? (
        <Pill tone='ink'>set</Pill>
      ) : guess ? (
        <Chip tone='attention' onClick={onConfirm} title={why}>
          ! {fmtPct(e.confidence ?? 0, 0)} · confirm
        </Chip>
      ) : e.card ? (
        <Pill tone='attention' title={why ?? 'proposed automatically — change it if it is wrong'}>
          auto
        </Pill>
      ) : (
        <Pill tone='mut' title={why}>
          off
        </Pill>
      )}
    </span>
  );
}
