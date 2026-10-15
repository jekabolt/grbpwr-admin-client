// Step 4 · SIZES — a mapping list: each size the file draws → a card size, or left out (owner
// decision 6). Only size rows are shown; the other legend lines (seam, grain, common…) fold into a
// count. An automatic answer that needs a look carries a quiet `check`; a legend row the reader is
// unsure of carries `! confirm`. Evidence, confidence and reader notes live in `?debug=1`.
// Two size rows given one label are one size (a size drawn in two looks) — the worker merges them.
import { useRef, useState } from 'react';
import type {
  BoxMm,
  ChainRole,
  ChainAmbiguity,
  ClassEvidence,
  ExpectedSizes,
  LineClass,
  LineSwatch,
  SizeCountAsk,
  SizeMapEntry,
} from 'lib/pattern-import/types';
import { Chip } from 'ui/components/chip';
import { DataTable } from 'ui/components/data-table';
import { HeaderWarnings, type HeaderWarning } from 'ui/components/header-warnings';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { evidenceKinds } from 'lib/pattern-import/sizes/count-evidence';
import { drawnUnmapped } from 'lib/pattern-import/sizes/map';
import { sheetLegendQuestion } from 'lib/pattern-import/pieces/sheets';
import { cn } from 'lib/utility';
import type { CardContext } from '../client';
import { SHEET_INK, SheetViewport, f32Attr, vy } from '../sheet-viewport';
import type { ImportSessionApi, LegendEdit } from '../use-import-session';
import { legendKey } from '../use-import-session';
import { guessedSizes } from '../use-import-session';
import { DebugFold, Fold, NativeSelect, Panel, SplitStage, ask, fmtPct } from '../ui-bits';
import { LineSwatchView } from '../line-swatch';

const ROLES: { value: ChainRole; label: string }[] = [
  { value: 'size', label: 'size line' },
  { value: 'common', label: 'common (all sizes)' },
  { value: 'seam', label: 'seam line' },
  { value: 'grain', label: 'grainline' },
  { value: 'notch', label: 'notch' },
  { value: 'internal', label: 'internal' },
  { value: 'ignore', label: 'ignore' },
];
const ROLE_WORD = Object.fromEntries(ROLES.map((r) => [r.value, r.label])) as Record<
  ChainRole,
  string
>;

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

/** The legend's swatch column: a short stretch, 1:1 — enough to tell the rhythms apart. */
const SWATCH_MM = 16;
/** The row detail: a longer stretch, still cropped to the narrow column. */
const DETAIL_MM = 60;

export function SizesStep({ api, card }: { api: ImportSessionApi; card: CardContext }) {
  const { session, inputs, patchInputs } = api;
  const chains = session.chains;
  const sizes = session.sizes;
  // D6: the tile sheets must draw the same size pens (one legend for the document)
  const legendQ = sheetLegendQuestion(sizes?.sheetLegend, inputs.sheetLegendOk);
  const [hover, setHover] = useState<number | null>(null);
  const [flag, setFlag] = useState<number | null>(null);
  // MOOD-F1: the row clicked open — its lines lit, its key sample marked, its detail below
  const [picked, setPicked] = useState<number | null>(null);
  const [toKey, setToKey] = useState(false);
  // the `other lines` fold: null = follow the step (open while one of them waits for a confirm)
  const [otherOpen, setOtherOpen] = useState<boolean | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  if (!chains || !sizes || !session.sheet) return null;

  // One size drawn (the operator's answer): nothing to merge, so "two sizes alike" is no question
  // any more; shown, it invited answering 2 on a one-size sheet (blazer).
  const oneSize = sizes.expected?.n === 1;
  const flags = (chains.ambiguities ?? []).filter((a) => !(oneSize && a.kind === 'class-merge'));
  // Only the rows the operator changed travel (Codex round 4 T3): the legend is re-applied to a
  // fresh build, and a row sent back as built would be taken as answered — an untouched
  // low-confidence row (a grey "ignore") must stay a question.
  const edit = (classId: number, p: Partial<LegendEdit>) => {
    const row = chains.classes.find((c) => c.id === classId);
    if (!row) return;
    const mine = (e: LegendEdit) => (e.sig ? e.sig === row.sig : e.classId === classId);
    const prev: LegendEdit = inputs.legend.find(mine) ?? {
      classId,
      role: row.role,
      sizeLabel: row.sizeLabel,
      ...(row.sig ? { sig: row.sig } : {}),
    };
    void api.dispatch({
      type: 'legend',
      edits: [...inputs.legend.filter((e) => !mine(e)), { ...prev, ...p, classId }],
    });
  };
  const setCard = (e: SizeMapEntry, sizeId: string) =>
    void api.setSize(e.source.rank, card.sizes.find((c) => String(c.sizeId) === sizeId) ?? null);
  const setRole = (c: LineClass, v: string) =>
    edit(c.id, { role: v as ChainRole, sizeLabel: v === 'size' ? c.sizeLabel ?? '' : null });
  const confirmRow = (c: LineClass) =>
    void api.dispatch({ type: 'legend-confirm', key: legendKey(c) });

  const flagged = flag != null ? flags[flag] : null;
  const pickedRow = picked != null ? chains.classes.find((c) => c.id === picked) ?? null : null;
  const sample = pickedRow ? keySampleOf(pickedRow) : null;
  const hotRow = hover ?? pickedRow?.id ?? null;
  const hot =
    hotRow != null
      ? new Set(chains.classes.find((c) => c.id === hotRow)?.chains ?? [])
      : flagged
        ? new Set(flagged.chains.length ? flagged.chains : flaggedClassChains(flagged))
        : null;
  const focusBox =
    toKey && sample
      ? around(
          { x: (sample.at.x + sample.textAt.x) / 2, y: (sample.at.y + sample.textAt.y) / 2 },
          40,
        )
      : flagged?.at
        ? around(flagged.at)
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
          case 'faces':
            return `closes ${e.pieces} outline${e.pieces === 1 ? '' : 's'}${e.cues.length > 1 ? ` · ${e.cues.slice(1).join(' · ')}` : ''}`;
          case 'inside-faces':
            return `inside the outlines`;
          case 'face-stray':
            return `not an outline: ${e.why}`;
          case 'face-graded':
            return e.sourceOne
              ? `${e.why} — confirm if the sheet draws only ${e.sourceOne}, else answer the sizes drawn`
              : `outside the outlines — another size's lines? left to the size checks (${e.why})`;
          case 'layer':
            return `layer “${e.layer}”: ${e.meaning}`;
          case 'legend-sample':
            return `key sample “${e.label}” ${e.distanceMm} mm from its label, match ${e.score.toFixed(2)}`;
        }
      })
      .join(' · ');
  // provenance is a tooltip (copy rule 6): where the row's identity comes from
  const rowTitle = (c: LineClass) =>
    [identityLine(c), evidenceText(c.id), `${c.chains.length} lines`].filter(Boolean).join(' · ');
  const entryOfClass = (id: number) => sizes.map.entries.find((e) => e.source.classId === id);
  const classIds = new Set(chains.classes.map((c) => c.id));
  const sizeRows = chains.classes.filter((c) => c.role === 'size');
  const otherRows = chains.classes.filter((c) => c.role !== 'size');
  // Sizes not drawn as a legend row of their own (one-size files, DXF block names, a size whose
  // line the reader did not find) are rows of the same list, without a swatch.
  const loose = sizes.map.entries.filter(
    (e) => e.source.classId == null || !classIds.has(e.source.classId),
  );
  const dupe = (sizeId: number | undefined) =>
    sizeId != null && sizes.map.entries.filter((e) => e.card?.sizeId === sizeId).length > 1;
  const labels = sizeRows.map((c) => c.sizeLabel?.trim().toLowerCase());
  const repeats = labels.some((l, i) => l && labels.indexOf(l) !== i);

  // ── which question the step asks now, in the order the footer's blocker asks them
  // (use-import-session `blocker` · case 'sizes'), so only the controls that answer it carry
  // `data-ask` and the footer's link lands on the right one.
  const low = (c: LineClass) =>
    c.confidence < 0.6 && !inputs.legendConfirmed.includes(legendKey(c));
  const pending = (c: LineClass) =>
    low(c) &&
    !(
      sizes.expected?.from === 'operator' &&
      c.evidence.some((x) => x.kind === 'face-graded' && x.sourceOne)
    );
  const countOpen = !!sizes.countAsk && !sizes.expected;
  const otherPending = otherRows.filter(low).length;
  const asking: 'range' | 'count' | 'confirm' | 'legend' | 'map' | 'offer' | null =
    card.sizes.length === 0
      ? 'range'
      : countOpen
        ? 'count'
        : chains.classes.some(pending)
          ? 'confirm'
          : legendQ
            ? 'legend'
            : api.blocker
              ? 'map'
              : api.offer
                ? 'offer'
                : null;
  const noneMapped = !sizes.map.entries.some((e) => e.card);
  const anyDupe = sizes.map.entries.some((e) => dupe(e.card?.sizeId));
  // the map's own order of questions: nothing mapped, one card size twice, a guess, a size left off
  const mapAsk: 'none' | 'dupe' | 'guess' | 'partial' | null =
    asking !== 'map'
      ? null
      : noneMapped
        ? 'none'
        : anyDupe
          ? 'dupe'
          : guessedSizes(sizes.map.entries).length
            ? 'guess'
            : 'partial';
  const firstUnmapped = sizes.map.entries.find((e) => !e.card && !e.notDrawn)?.source.rank;
  // the offer's own order: a size listed but not drawn, a drawn size left off, then the flags
  const offerInRows =
    sizes.map.entries.some((e) => e.notDrawn) || drawnUnmapped(sizes.map).length > 0;

  // NEW (P3): every drawn size unmapped and the card has room — one click maps rank i → card i.
  const drawn = sizes.map.entries
    .filter((e) => !e.notDrawn)
    .sort((a, b) => a.source.rank - b.source.rank);
  const inOrder =
    drawn.length > 0 &&
    drawn.every((e) => !e.card) &&
    drawn.length <= card.sizes.length &&
    card.sizes.length > 0;
  const mapInOrder = () => {
    const cards = [...card.sizes].sort((a, b) => a.rank - b.rank);
    const ranks = new Set(drawn.map((e) => e.source.rank));
    // one `size-map` answer of the shape `setSize` sends, for every drawn size at once
    void api.dispatch({
      type: 'size-map',
      entries: [
        ...(inputs.sizeMap ?? []).filter((e) => !ranks.has(e.source.rank)),
        ...drawn.map((e, i) => ({ ...e, card: cards[i], origin: 'operator' as const })),
      ],
    });
  };
  const focusFirstUnmapped = () => {
    const el = listRef.current?.querySelector<HTMLSelectElement>('select[data-unmapped]');
    el?.scrollIntoView({ block: 'nearest' });
    el?.focus();
  };

  const warnings: HeaderWarning[] = [
    ...flags.map((a, i) => ({
      text: `${FLAG[a.kind] ?? a.kind}: ${a.message}`,
      ...(a.at || a.chains.length > 0 || a.classes.length > 0
        ? { action: { label: 'show its lines', onClick: () => setFlag(i) } }
        : {}),
    })),
    ...(sizes.map.unmapped.length > 0
      ? [
          {
            text: `card sizes with no source: ${sizes.map.unmapped.map((c) => c.name).join(', ')}`,
            ...(firstUnmapped != null
              ? { action: { label: 'map a size', onClick: focusFirstUnmapped } }
              : {}),
          },
        ]
      : []),
    ...(repeats ? ['two size rows carry one label — read as one size'] : []),
    // The reader's own notes (a refused split, «split … name it») answer an operator action, so
    // they stay visible; only the run/encoding statistics live in the debug fold.
    ...chains.warnings,
  ];

  /** The one marker of a mapping row: the open question on it, else nothing. */
  const marker = (c: LineClass | null, e: SizeMapEntry | undefined) => {
    if (c && low(c))
      return (
        <Chip
          quiet
          tone='attention'
          {...ask('sizes-confirm', asking === 'confirm')}
          onClick={() => confirmRow(c)}
          title={confirmTitle(c)}
        >
          ! confirm
        </Chip>
      );
    if (!e) return null;
    if (e.notDrawn)
      return (
        <span className='inline-flex items-center gap-1'>
          <Pill tone='mut' title='the file lists this size, but no line draws it — left out'>
            not drawn
          </Pill>
          <Chip
            quiet
            {...ask('sizes-not-drawn', asking === 'offer')}
            title='this size is drawn on the shared (common) lines — fill it on them; a piece they do not close stays open'
            onClick={() => void api.drawnAnyway(e.source.rank)}
          >
            it is drawn
          </Chip>
        </span>
      );
    // an automatic answer waiting for a look: a guessed card size, or a drawn size left out
    const leftOut = e.origin === 'auto' && !e.card;
    if (!leftOut && !isGuess(e)) return null;
    return (
      <Chip
        quiet
        tone='attention'
        {...ask(
          'sizes-check',
          leftOut ? mapAsk === 'partial' || asking === 'offer' : mapAsk === 'guess',
        )}
        onClick={() => void api.confirmSize(e.source.rank)}
        title={
          leftOut
            ? `drawn, but not on the card — click to leave it out, or pick a card size${e.evidence?.length ? ` (${e.evidence.join(' · ')})` : ''}`
            : `${fmtPct(e.confidence ?? 0, 0)} sure${e.evidence?.length ? ` · ${e.evidence.join(' · ')}` : ''} — click to keep it, or pick another`
        }
      >
        check
      </Chip>
    );
  };

  const cardCell = (e: SizeMapEntry | undefined) =>
    e ? (
      <CardSizeSelect
        e={e}
        card={card}
        invalid={dupe(e.card?.sizeId)}
        askOn={
          mapAsk === 'dupe'
            ? dupe(e.card?.sizeId)
            : mapAsk === 'none' && e.source.rank === firstUnmapped
        }
        onChange={(v) => setCard(e, v)}
      />
    ) : (
      <span className='text-labelColor'>—</span>
    );

  const rowEvents = (id: number) => ({
    onMouseEnter: () => setHover(id),
    onMouseLeave: () => setHover(null),
    'aria-selected': picked === id,
    className: cn((hover === id || picked === id) && 'bg-bgZebra', 'cursor-pointer'),
    onClick: (ev: React.MouseEvent) => {
      // the row's own controls answer; a click elsewhere on it opens its detail
      if ((ev.target as HTMLElement).closest('select,input,button')) return;
      setPicked(picked === id ? null : id);
      setToKey(false);
    },
  });

  return (
    <SplitStage
      sideWidth={420}
      canvas={
        <Panel
          title='lines'
          aside={
            flagged ? (
              <Chip quiet selected onClick={() => setFlag(null)} title='stop lighting this flag'>
                {FLAG[flagged.kind] ?? flagged.kind} ✕
              </Chip>
            ) : undefined
          }
          bodyClassName='p-0'
        >
          <SheetViewport bbox={session.sheet.sheet.bbox} focus={focusBox}>
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
                {sample && (
                  // the key's sample of the picked row and the leader to its label
                  <g pointerEvents='none'>
                    {(chains.chainPreview[sample.chain]?.length ?? 0) >= 4 && (
                      <polyline
                        points={f32Attr(chains.chainPreview[sample.chain])}
                        fill='none'
                        stroke={SHEET_INK.blue}
                        strokeWidth={unit * 2.4}
                      />
                    )}
                    <line
                      x1={sample.at.x}
                      y1={vy(sample.at.y)}
                      x2={sample.textAt.x}
                      y2={vy(sample.textAt.y)}
                      stroke={SHEET_INK.blue}
                      strokeWidth={unit}
                      strokeDasharray={`${unit * 4} ${unit * 3}`}
                    />
                    <circle
                      cx={sample.at.x}
                      cy={vy(sample.at.y)}
                      r={unit * 14}
                      fill='none'
                      stroke={SHEET_INK.blue}
                      strokeWidth={unit * 1.6}
                    />
                  </g>
                )}
              </>
            )}
          </SheetViewport>
        </Panel>
      }
      side={
        <Panel
          title={`sizes · ${drawn.length} drawn`}
          aside={
            <span {...ask('sizes-flags', asking === 'offer' && !offerInRows && flags.length > 0)}>
              <HeaderWarnings items={warnings} />
            </span>
          }
        >
          {card.sizes.length === 0 && (
            <Text size='micro' component='p' className='mb-2 text-error'>
              ! the card has no size range — set it on the card first
            </Text>
          )}
          {sizes.countAsk && (
            <DrawnSizes
              ask={sizes.countAsk}
              expected={sizes.expected}
              cardCount={card.sizes.length}
              asking={asking === 'count'}
              onCommit={(n) => void api.setDrawnSizes(n)}
            />
          )}
          {legendQ && sizes.sheetLegend && (
            <div className='mb-2 flex flex-wrap items-center gap-1.5'>
              <Text size='micro' component='span' className='text-warning'>
                ! {legendQ}
              </Text>
              <Chip
                tone='attention'
                className='h-[22px]'
                {...ask('sizes-legend', asking === 'legend')}
                disabled={!!session.busy}
                title='the sheets share the legend as read'
                onClick={() => patchInputs({ sheetLegendOk: sizes.sheetLegend!.sig })}
              >
                same legend
              </Chip>
            </div>
          )}

          <div ref={listRef}>
            <DataTable>
              <thead>
                <tr>
                  <th data-align='left'>drawn</th>
                  <th data-align='left' />
                  <th data-align='left'>card</th>
                  <th data-align='left' />
                </tr>
              </thead>
              <tbody>
                {sizeRows.map((c) => {
                  const e = entryOfClass(c.id);
                  return (
                    <tr key={c.id} {...rowEvents(c.id)}>
                      <td data-align='left' title={rowTitle(c)}>
                        <span className='flex items-center gap-1.5'>
                          <LineSwatchView
                            swatch={chains.swatches?.[c.id]}
                            widthMm={SWATCH_MM}
                            fallbackDash={motifOf(c.id)}
                            title={`${c.sizeLabel ?? c.role} as drawn on the sheet`}
                          />
                          <Input
                            defaultValue={c.sizeLabel ?? ''}
                            key={c.sizeLabel ?? ''}
                            className='h-[22px] w-14'
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
                        </span>
                      </td>
                      <td data-align='left' className='text-labelColor'>
                        →
                      </td>
                      <td data-align='left'>{cardCell(e)}</td>
                      <td data-align='left'>{marker(c, e)}</td>
                    </tr>
                  );
                })}
                {loose.map((e) => (
                  <tr key={`${e.source.rank}-${e.source.label}`}>
                    <td data-align='left' className='font-bold' title={e.evidence?.join(' · ')}>
                      {e.source.label || '(no label)'}
                    </td>
                    <td data-align='left' className='text-labelColor'>
                      →
                    </td>
                    <td data-align='left'>{cardCell(e)}</td>
                    <td data-align='left'>{marker(null, e)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
          {inOrder && (
            <Chip
              className='mt-2 h-[22px]'
              title='first drawn size → first card size, and so on'
              onClick={mapInOrder}
            >
              map in order
            </Chip>
          )}
          {pickedRow && (
            <RowDetail
              row={pickedRow}
              swatch={chains.swatches?.[pickedRow.id]}
              keySwatch={sample ? chains.keySwatches?.[sample.chain] : undefined}
              others={chains.classes.filter(
                (c) => c.role === 'size' && c.id !== pickedRow.id && !!c.sizeLabel,
              )}
              toKey={toKey}
              onToKey={() => setToKey(!toKey)}
              onRole={(v) => setRole(pickedRow, v)}
              onSplit={(by) => edit(pickedRow.id, { split: by })}
              onMerge={(label) => edit(pickedRow.id, { role: 'size', sizeLabel: label })}
            />
          )}

          {otherRows.length > 0 && (
            <Fold
              label={`${otherRows.length} other ${otherRows.length === 1 ? 'line' : 'lines'}`}
              open={otherOpen ?? otherPending > 0}
              onOpenChange={setOtherOpen}
              ask={asking === 'confirm' && otherPending > 0 ? 'sizes-confirm' : undefined}
            >
              <DataTable>
                <tbody>
                  {otherRows.map((c) => (
                    <tr key={c.id} {...rowEvents(c.id)}>
                      <td data-align='left' title={rowTitle(c)}>
                        <LineSwatchView
                          swatch={chains.swatches?.[c.id]}
                          widthMm={SWATCH_MM}
                          fallbackDash={motifOf(c.id)}
                          title={`${c.sizeLabel ?? c.role} as drawn on the sheet`}
                        />
                      </td>
                      <td data-align='left'>
                        <NativeSelect
                          value={c.role}
                          onChange={(v) => setRole(c, v)}
                          options={ROLES}
                          aria-label={`meaning of line class ${c.id}`}
                          className='w-28'
                        />
                      </td>
                      <td data-align='left'>{marker(c, undefined)}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </Fold>
          )}

          <DebugFold>
            <div className='flex flex-col gap-1'>
              <Text size='micro' variant='label' component='p'>
                run read from {sizes.run.encoding.replace('-', ' ')}
                {sizes.run.evidence.length ? ` · ${sizes.run.evidence.join(' · ')}` : ''}
              </Text>
              <Text size='micro' variant='label' component='p'>
                two size rows with the same label are one size: type the label of the other row to
                merge them.
              </Text>
              <DataTable>
                <thead>
                  <tr>
                    <th>class</th>
                    <th data-align='left'>meaning</th>
                    <th data-align='left'>label</th>
                    <th>sure</th>
                    <th data-align='left'>evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {chains.classes.map((c) => (
                    <tr key={c.id}>
                      <td>{c.id}</td>
                      <td data-align='left'>{ROLE_WORD[c.role] ?? c.role}</td>
                      <td data-align='left'>{c.sizeLabel ?? '—'}</td>
                      <td>{fmtPct(c.confidence, 0)}</td>
                      <td data-align='left'>{rowTitle(c)}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
              {sizes.map.entries.map((e) => (
                <Text key={`ev-${e.source.rank}`} size='micro' variant='label' component='p'>
                  {e.source.label || `rank ${e.source.rank + 1}`} → {e.card?.name ?? '—'} ·{' '}
                  {e.origin} · {fmtPct(e.confidence ?? null, 0)}
                  {e.evidence?.length ? ` · ${e.evidence.join(' · ')}` : ''}
                </Text>
              ))}
            </div>
          </DebugFold>
        </Panel>
      }
    />
  );
}

/** Why a legend row waits for a confirm — the reader's reason, the number only here. */
function confirmTitle(c: LineClass): string {
  const pct = fmtPct(c.confidence, 0);
  if (c.evidence.some((x) => x.kind === 'face-graded'))
    return `${pct} sure — these lines look like other sizes, but the file name says one size; confirm to set them aside if the sheet draws only that size`;
  if (c.evidence.some((x) => x.kind === 'colour-only'))
    return `${pct} sure — set aside for its grey colour only; make it a line role if it is the cut line`;
  if (c.evidence.some((x) => x.kind === 'face-stray'))
    return `${pct} sure — these lines close no outline (strays, lettering, a watermark); set aside unless one is a piece line`;
  if (c.evidence.some((x) => x.kind === 'faces'))
    return `${pct} sure — these lines close the outlines, but only that says so; confirm they are the cut lines`;
  return `${pct} sure — recognised from a recovered motif only`;
}

/**
 * H1 / D1: how many sizes the sheet draws, when the file itself does not say. Required: the step
 * does not continue until it is answered — unless two or more independent evidences of the sheet
 * agree on it (A6: a size named in text, the nesting of the outlines, one file per size): then it
 * is pre-answered (AUTO) and the block shrinks to one quiet line, a click on it reopens the
 * answers. Quick answers, one click each: the sheet's evidence, what the lines show (suggested,
 * not chosen), the card's size count, then any number. The fill ranks each piece into that many
 * sizes and holds back (never guesses) a piece it cannot rank. Clearing the field takes the
 * answer back.
 */
function DrawnSizes({
  ask: countAsk,
  expected,
  cardCount,
  asking,
  onCommit,
}: {
  ask: SizeCountAsk;
  expected: ExpectedSizes | null;
  cardCount: number;
  asking: boolean;
  onCommit: (n: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const answer = expected?.from === 'operator' ? expected.n : null;
  const auto = countAsk.auto;
  const autoOn = expected?.from === 'inferred' && auto?.applied ? expected.n : null;
  // the sheet's evidences agree but the operator took the count back: a quick answer like the rest
  const autoQuick = autoOn == null && auto?.n != null ? auto.n : null;
  const inferred = autoOn == null && countAsk.inferred?.n !== autoQuick ? countAsk.inferred : null;
  const card =
    cardCount > 0 && cardCount !== inferred?.n && cardCount !== autoQuick ? cardCount : null;
  const why = [
    ...(auto?.evidence ?? []).map((e) => `${e.detail}${e.counts ? '' : ' (not counted)'}`),
    ...(auto?.blocked ? [auto.blocked] : []),
  ].join(' · ');
  const set = answer ?? autoOn;
  const commit = (n: number | null) => {
    setOpen(false);
    onCommit(n);
  };

  // answered (by the operator, or read off the sheet): one quiet line, the answers one click away
  if (set != null && !open)
    return (
      <div className='mb-2'>
        <Chip
          quiet
          className='px-0'
          title={
            autoOn != null
              ? `read off the sheet: ${why} — click to change`
              : `set by you — a piece that cannot be ranked into ${set} sizes is held back, not guessed. click to change`
          }
          onClick={() => setOpen(true)}
        >
          {set === 1 ? '1 size drawn' : `${set} sizes drawn`}
          {autoOn != null ? ' · auto' : ''}
        </Chip>
      </div>
    );

  const unanswered = asking && set == null;
  return (
    <div className='mb-3 flex flex-col gap-1'>
      <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
        sizes drawn
      </Text>
      <span className='flex flex-wrap items-center gap-1.5'>
        {autoOn != null && auto && (
          <Chip
            selected
            pressed
            className='h-[22px]'
            title={`read off the sheet: ${why} — click to take it back and answer yourself`}
            onClick={() => commit(0)}
          >
            {autoOn} · AUTO · {evidenceKinds(auto.evidence)}
          </Chip>
        )}
        {autoQuick != null && auto && (
          <Chip
            selected={answer === autoQuick}
            pressed={answer === autoQuick}
            className='h-[22px]'
            {...ask('sizes-count', unanswered)}
            title={`the sheet says so: ${why}`}
            onClick={() => (answer !== autoQuick ? commit(autoQuick) : setOpen(false))}
          >
            {autoQuick} · {evidenceKinds(auto.evidence)}
          </Chip>
        )}
        {inferred && (
          <Chip
            tone={answer === inferred.n ? 'default' : 'attention'}
            selected={answer === inferred.n}
            pressed={answer === inferred.n}
            className='h-[22px]'
            {...ask('sizes-count', unanswered)}
            title={`suggested: ${inferred.why}`}
            onClick={() => (answer !== inferred.n ? commit(inferred.n) : setOpen(false))}
          >
            {inferred.n} · from the lines
          </Chip>
        )}
        {card != null && (
          <Chip
            selected={answer === card}
            pressed={answer === card}
            className='h-[22px]'
            title="the card's size range — the sheet may draw fewer"
            onClick={() => (answer !== card ? commit(card) : setOpen(false))}
          >
            {card} (card)
          </Chip>
        )}
        <Input
          type='number'
          min={1}
          max={30}
          step={1}
          inputMode='numeric'
          key={answer ?? 'none'}
          defaultValue={answer ?? ''}
          placeholder={autoOn != null ? String(autoOn) : 'n'}
          aria-label='sizes drawn on this sheet'
          aria-invalid={(answer == null && autoOn == null) || undefined}
          {...ask('sizes-count', unanswered)}
          title={
            answer == null && autoOn == null
              ? `the file does not say how many sizes it draws — count the outlines of one piece${auto?.evidence.length && auto.n == null ? ` (read off the sheet, not enough to set it: ${why})` : ''}`
              : undefined
          }
          className='h-[22px] w-16 tabular-nums'
          onBlur={(ev: React.FocusEvent<HTMLInputElement>) => {
            const raw = ev.currentTarget.value.trim();
            const n = raw === '' ? null : Math.round(Number(raw));
            if (n !== null && (!Number.isFinite(n) || n < 1 || n > 30)) {
              ev.currentTarget.value = answer != null ? String(answer) : '';
              return;
            }
            if (n !== answer) commit(n);
          }}
          onKeyDown={(ev: React.KeyboardEvent<HTMLInputElement>) => {
            if (ev.key === 'Enter') ev.currentTarget.blur();
          }}
        />
      </span>
    </div>
  );
}

const isGuess = (e: SizeMapEntry) => guessedSizes([e]).length > 0;

/** The card size of one source size; `leave out` is a value of the list, not an error. */
function CardSizeSelect({
  e,
  card,
  invalid,
  askOn,
  onChange,
}: {
  e: SizeMapEntry;
  card: CardContext;
  invalid: boolean;
  askOn: boolean;
  onChange: (sizeId: string) => void;
}) {
  return (
    <NativeSelect
      value={e.card ? String(e.card.sizeId) : ''}
      onChange={onChange}
      invalid={invalid}
      aria-label={`card size for source size ${e.source.label}`}
      className='w-24'
      title={e.evidence?.join(' · ')}
      {...(!e.card && !e.notDrawn ? { 'data-unmapped': '' } : {})}
      {...ask('sizes-map', askOn)}
      options={[
        { value: '', label: 'leave out' },
        ...card.sizes.map((c) => ({ value: String(c.sizeId), label: c.name })),
      ]}
    />
  );
}

type KeySample = Extract<ClassEvidence, { kind: 'legend-sample' }>;

/** The key sample a row was named by (MOOD-F1), if the drawing's own key named it. */
function keySampleOf(c: LineClass): KeySample | null {
  for (const e of c.evidence) if (e.kind === 'legend-sample') return e;
  return null;
}

/** Where the row's identity comes from, in one line: the key sample and the second evidence. */
function identityLine(c: LineClass): string {
  const k = keySampleOf(c);
  if (!k) return '';
  if (!k.score) return 'key read · no line like it';
  if (k.nestingOnly) return `key ${k.score.toFixed(2)} · nesting only`;
  return `key ${k.score.toFixed(2)}${k.second >= 0.5 ? ' · 2nd ✓' : ''}`;
}

/**
 * The clicked row (MOOD-F1): its look on the sheet against its sample in the key — and the
 * answers a wrong row needs: what it means, split it (two sizes drawn alike went into one row) or
 * merge it into another. A weak identity says so; a good one is a diagnostic.
 * Controls in one line share one size (22 px tall, w-28).
 */
function RowDetail({
  row,
  swatch,
  keySwatch,
  others,
  toKey,
  onToKey,
  onRole,
  onSplit,
  onMerge,
}: {
  row: LineClass;
  swatch: LineSwatch | undefined;
  keySwatch: LineSwatch | undefined;
  others: LineClass[];
  toKey: boolean;
  onToKey: () => void;
  onRole: (v: string) => void;
  onSplit: (by: 'look' | 'nesting') => void;
  onMerge: (label: string) => void;
}) {
  const k = keySampleOf(row);
  const term = (t: string) => (
    <dt>
      <Text size='micro' variant='label' component='span'>
        {t}
      </Text>
    </dt>
  );
  return (
    <div className='mt-2 border-t border-hairline pt-2'>
      <dl className='grid grid-cols-[64px_1fr] items-center gap-x-2 gap-y-1.5'>
        {term('sheet')}
        <dd className='flex min-w-0 items-center gap-2 overflow-hidden'>
          <LineSwatchView
            swatch={swatch}
            widthMm={DETAIL_MM}
            title='the row as drawn on the sheet, 1:1'
          />
        </dd>
        {term('key')}
        <dd className='flex min-w-0 flex-wrap items-center gap-1.5'>
          {k ? (
            <>
              <LineSwatchView swatch={keySwatch} widthMm={DETAIL_MM} title='the key sample, 1:1' />
              <Text size='micro' component='span'>
                “{k.label}”
              </Text>
              <Chip
                quiet
                selected={toKey}
                pressed={toKey}
                onClick={onToKey}
                title={`zoom the sheet to the key sample and its label (${k.distanceMm} mm apart)`}
              >
                {toKey ? 'shown' : 'show in key'}
              </Chip>
              {!k.score ? (
                <Pill
                  tone='attention'
                  title='no line of the sheet is drawn like this sample: the lines this row holds were ranked by nesting'
                >
                  ! no line like it
                </Pill>
              ) : k.nestingOnly ? (
                <Pill
                  tone='attention'
                  title={`drawn like ${k.alike.join(', ')} in the key: only the nesting tells them apart`}
                >
                  ! nesting only
                </Pill>
              ) : null}
            </>
          ) : (
            <Text size='micro' variant='label' component='span'>
              —
            </Text>
          )}
        </dd>
        {row.role === 'size' && (
          <>
            {term('meaning')}
            <dd>
              <NativeSelect
                value={row.role}
                onChange={onRole}
                options={ROLES}
                aria-label={`meaning of line class ${row.id}`}
                className='w-28'
              />
            </dd>
            {term('fix')}
            <dd className='flex min-w-0 flex-wrap items-center gap-1.5'>
              <Chip
                className='h-[22px] w-28 justify-center'
                onClick={() => onSplit('look')}
                title='two looks went into this row: give the lines of the second look a row of their own'
              >
                split by look
              </Chip>
              <Chip
                className='h-[22px] w-28 justify-center'
                onClick={() => onSplit('nesting')}
                title='two sizes drawn alike went into this row: split its lines by the sizes they run between'
              >
                split by nesting
              </Chip>
              <NativeSelect
                value=''
                onChange={(v) => v && onMerge(v)}
                aria-label={`merge row ${row.sizeLabel ?? row.id} into another size`}
                className='w-28'
                options={[
                  { value: '', label: 'merge into…' },
                  ...others.map((o) => ({ value: o.sizeLabel!, label: `size ${o.sizeLabel}` })),
                ]}
              />
            </dd>
          </>
        )}
      </dl>
      <DebugFold label='identity'>
        <Text size='micro' variant='label' component='p'>
          {row.chains.length} lines · {(row.totalLengthMm / 1000).toFixed(1)} m ·{' '}
          {k
            ? `key sample ${k.score.toFixed(2)} · ${k.distanceMm} mm from its label · ${
                k.second >= 0.5 ? `2nd evidence ${fmtPct(k.second, 0)}` : 'no 2nd evidence'
              }${k.alike.length ? ` · key drawn like ${k.alike.join(', ')}` : ''}`
            : `${fmtPct(row.confidence, 0)} sure · ${row.evidence.map((e) => e.kind).join(', ') || '—'}`}
        </Text>
      </DebugFold>
    </div>
  );
}
