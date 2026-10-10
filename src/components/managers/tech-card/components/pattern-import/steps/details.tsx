// Step 6 · DETAILS (contract step `meaning`) — one row per piece: the code (grammar checked as you
// type), the name, how many per garment, fold, the L/R pair, the grainline, the line meaning and
// the allowance. AI names above the threshold arrive accepted but FLAGGED (owner decision 11);
// below it they wait for a click. A piece without a grainline cannot be exported until the
// two-click tool draws one (decision 12).
import { useMemo, useState } from 'react';
import type {
  AllowanceDecision,
  LineMeaning,
  NameDecision,
  PtMm,
  SeedId,
} from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';
import { cn } from 'lib/utility';
import { Button } from 'ui/components/button';
import CheckboxCommon from 'ui/components/checkbox';
import { Chip } from 'ui/components/chip';
import { DataTable } from 'ui/components/data-table';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import type { CardContext } from '../client';
import {
  codeWordsOf,
  identitiesOf,
  identityProblem,
  sizeTokenTest,
} from 'lib/pattern-import/manifest';
import { isKnownCode } from 'lib/pattern-import/dictionary/codes';
import { SHEET_INK, SheetViewport, ptsAttr, vy } from '../sheet-viewport';
import type { ImportSessionApi, Inputs } from '../use-import-session';
import { textNameOf } from '../use-import-session';
import { PendingDetails } from './details-pending';
import {
  ConfirmStrip,
  OutlineQuestion,
  RowQuestions,
  nameNote,
  qtyOpen,
  rowOpen,
  useOpenQuestions,
} from './details-confirm';
import { Field, NativeSelect, NumberField, Panel, SplitStage, fmtPct } from '../ui-bits';

const MEANING: { value: LineMeaning; label: string }[] = [
  { value: 'seam', label: 'seam line' },
  { value: 'cut', label: 'cut line' },
  { value: 'both', label: 'both drawn' },
];
const REASON: Record<string, string> = {
  'no-grain': 'no grainline',
  'offset-hull': 'offset collapsed',
  'offset-self-intersection': 'offset crosses itself',
  'offset-topology': 'offset broke the shape',
  leak: 'outline not closed',
  merged: 'two pieces in one region',
  tiny: 'too small for a piece',
  'non-monotone': 'sizes do not grow',
  grammar: 'code grammar',
  'duplicate-identity': 'code used twice',
  'size-unmapped': 'size not mapped',
  'fold-unresolved': 'fold edge not found',
};

export function DetailsStep({ api, card }: { api: ImportSessionApi; card: CardContext }) {
  const { session, inputs, patchInputs } = api;
  const sem = session.semantics;
  const families = useMemo(() => session.pieces?.families ?? [], [session.pieces]);
  const [sel, setSel] = useState<SeedId | null>(
    () => sem?.blocked.find((b) => b.reason === 'no-grain')?.seed ?? null,
  );
  const [grainA, setGrainA] = useState<PtMm | null>(null);
  const [drawing, setDrawing] = useState(false);
  const open = useOpenQuestions(api);
  if (!sem) return <PendingDetails api={api} />;
  if (!session.sheet) return null;

  // What the worker read off the sheet (allowance text / nested loops) when nobody set it yet.
  const found = sem.pieces.find(
    (p) => p.allowance.origin === 'text' || p.allowance.origin === 'measured',
  )?.allowance;
  const fileAllowance: AllowanceDecision = inputs.fileAllowance ??
    found ?? {
      meaning: 'seam',
      allowanceMm: PATIMPORT.defaultAllowanceMm,
      origin: 'default',
      evidence: ['no allowance text found — owner default'],
    };
  const nameOf = (seed: SeedId) => session.names.find((n) => n.seed === seed);
  const specsOf = (seed: SeedId) => sem.pieces.filter((p) => p.seed === seed);
  const blockedOf = (seed: SeedId) => sem.blocked.find((b) => b.seed === seed);
  const mark = (seed: SeedId) => families.findIndex((f) => f.seed === seed) + 1;

  /** Re-run semantics with a patch to the operator's answers. */
  const rerun = (p: Partial<Pick<Inputs, 'fileAllowance' | 'overrides' | 'operatorGrain'>>) => {
    const i = { ...inputs, ...p };
    void api.dispatch({
      type: 'semantics',
      input: { ...api.semanticsInput(i), fileAllowance: i.fileAllowance ?? fileAllowance },
    });
  };
  const override = (seed: SeedId, o: NonNullable<Inputs['overrides'][SeedId]>) =>
    rerun({
      overrides: { ...inputs.overrides, [seed]: { ...(inputs.overrides[seed] ?? {}), ...o } },
    });
  const setName = (seed: SeedId, p: Partial<Pick<NameDecision, 'code' | 'mods' | 'displayName'>>) =>
    void api.editName(seed, p);
  const confirm = (seed: SeedId) =>
    patchInputs((i) => ({ confirmedNames: [...new Set([...i.confirmedNames, seed])] }));

  const selFamily = families.find((f) => f.seed === sel);
  const selSpec = sel != null ? specsOf(sel)[0] : undefined;
  const selRank = selSpec?.sizes[0]?.rank ?? Math.min(2, (selFamily?.candidates.length ?? 1) - 1);
  const selOuter = selFamily?.candidates[selRank]?.outer;
  const selGrain =
    sel != null
      ? inputs.operatorGrain[sel] ??
        (selSpec && selSpec.pairHand !== 'R' ? selSpec.sizes[0]?.grain : null)
      : null;

  const rows = families.filter((f) => f.candidates.every((c) => c.outcome !== 'tiny'));

  return (
    <SplitStage
      sideWidth={340}
      canvas={
        <Panel
          title='pieces'
          aside={
            <Text
              size='micro'
              variant='label'
              component='span'
              className='uppercase tracking-label'
            >
              {sem.pieces.length} blocks · {sem.blocked.length} blocked
            </Text>
          }
        >
          <div className='flex flex-wrap items-end gap-2'>
            <Field label='the drawn outline is' className='w-40'>
              <NativeSelect
                value={fileAllowance.meaning}
                onChange={(v) =>
                  rerun({
                    fileAllowance: {
                      ...fileAllowance,
                      meaning: v as LineMeaning,
                      origin: 'operator',
                    },
                  })
                }
                options={MEANING}
              />
            </Field>
            <Field label='allowance, mm' className='w-40'>
              <NumberField
                value={fileAllowance.allowanceMm}
                min={0}
                onCommit={(v) =>
                  rerun({
                    fileAllowance: { ...fileAllowance, allowanceMm: v ?? 0, origin: 'operator' },
                  })
                }
              />
            </Field>
            <Text size='micro' variant='label' component='p' className='min-w-0 flex-1 pb-1'>
              {fileAllowance.origin === 'operator'
                ? 'set by you'
                : // the reader's evidence already says where it looked ("text: «…»")
                  fileAllowance.evidence.join(' · ') || fileAllowance.origin}
              {' — '}a seam line gets a cut line {fileAllowance.allowanceMm} mm out (layer 1 = final
              cut, the card adds nothing).
            </Text>
          </div>
          <OutlineQuestion api={api} current={fileAllowance} />
          <ConfirmStrip api={api} />

          <DataTable className='mt-2'>
            <thead>
              <tr>
                <th>#</th>
                <th data-align='left'>code</th>
                <th data-align='left'>name</th>
                <th title='pieces per garment'>qty</th>
                <th data-align='left'>pair</th>
                <th data-align='left'>fold</th>
                <th data-align='left'>grainline</th>
                <th data-align='left'>line</th>
                <th>allow., mm</th>
                <th data-align='left'>name from</th>
                <th data-align='left'>state</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => {
                const seed = f.seed;
                const specs = specsOf(seed);
                // No AI answer for this piece (not logged in, AI off): show what the sheet text
                // gave the spec; typing a code makes it the operator's.
                const ov0 = inputs.overrides[seed];
                const n =
                  nameOf(seed) ??
                  (specs.length || ov0?.code ? textNameOf(seed, sem, ov0) : undefined);
                const b = blockedOf(seed);
                const ov = inputs.overrides[seed] ?? {};
                // A blocked piece has no spec yet: fall back to what the namer read off the sheet.
                const pair =
                  ov.pairHand !== undefined
                    ? ov.pairHand
                    : specs.length
                      ? specs[0].pairHand ?? null
                      : n?.suggestion?.pair
                        ? 'L'
                        : null;
                const unfolded =
                  ov.unfoldedFold ??
                  (specs.length ? specs[0].unfoldedFold : !!n?.suggestion?.onFold);
                const allowance = ov.allowance ?? specs[0]?.allowance ?? fileAllowance;
                const grainOrigin = inputs.operatorGrain[seed]
                  ? 'operator'
                  : specs[0]?.sizes[0]?.grain
                    ? 'found'
                    : null;
                const pending = !!n && !n.autoAccepted && !inputs.confirmedNames.includes(seed);
                const on = sel === seed;
                return (
                  <tr
                    key={seed}
                    onClick={() => setSel(seed)}
                    className={cn('cursor-pointer', on && 'bg-bgZebra')}
                  >
                    <td>
                      <span className='inline-flex size-4 items-center justify-center bg-textColor text-nano text-bgColor'>
                        {mark(seed)}
                      </span>
                    </td>
                    <td data-align='left'>
                      <CodeCell
                        value={n ? [n.code, ...n.mods].filter(Boolean).join('_') : ''}
                        hand={pair}
                        blocks={specs.map((s) => s.identity).join(' + ')}
                        sizeTokens={api.sizeTokens}
                        aiName={!!n && n.source === 'ai' && !inputs.editedNames.includes(seed)}
                        onCommit={(v) => setName(seed, splitCode(v))}
                      />
                    </td>
                    <td data-align='left'>
                      <Input
                        key={n?.displayName ?? ''}
                        defaultValue={n?.displayName ?? ''}
                        aria-label={`name of piece ${mark(seed)}`}
                        className='h-[22px] w-28'
                        onBlur={(e: React.FocusEvent<HTMLInputElement>) => {
                          const v = e.currentTarget.value.trim();
                          if (v !== (n?.displayName ?? '')) setName(seed, { displayName: v });
                        }}
                      />
                    </td>
                    <td>
                      {!specs.length ? (
                        '—'
                      ) : (
                        // A pair counts PER HAND (PieceSpec): 2 = two _L and two _R per garment.
                        // D3: a count no sheet text gives is marked until confirmed or edited.
                        <span
                          className='flex items-center gap-1'
                          title={
                            qtyOpen(open, seed)?.detail ??
                            (pair ? 'per hand: one _L and one _R each' : undefined)
                          }
                        >
                          {/* fixed slots: the inputs line up whether or not a row is marked */}
                          <span className='w-2 text-warning'>{qtyOpen(open, seed) ? '?' : ''}</span>
                          <NumberField
                            value={specs[0].piecesPerGarment}
                            min={1}
                            aria-label={`pieces per garment${pair ? ' per hand' : ''} of piece ${mark(seed)}`}
                            className={cn('w-12', qtyOpen(open, seed) && 'border-warning')}
                            onCommit={(v) =>
                              v && v !== specs[0].piecesPerGarment
                                ? override(seed, { piecesPerGarment: Math.round(v) })
                                : undefined
                            }
                          />
                          <Text size='nano' variant='label' component='span' className='w-7'>
                            {pair ? '/hand' : ''}
                          </Text>
                        </span>
                      )}
                    </td>
                    <td data-align='left'>
                      <NativeSelect
                        value={pair ?? ''}
                        onChange={(v) => override(seed, { pairHand: v ? (v as 'L' | 'R') : null })}
                        aria-label={`pair of piece ${mark(seed)}`}
                        className='w-24'
                        title='a pair is written as two blocks, _L and _R; say which hand is drawn'
                        options={[
                          { value: '', label: 'single' },
                          { value: 'L', label: 'L+R · L' },
                          { value: 'R', label: 'L+R · R' },
                        ]}
                      />
                    </td>
                    <td data-align='left'>
                      <label
                        className='flex items-center gap-1.5'
                        onClick={(e) => e.stopPropagation()}
                      >
                        <CheckboxCommon
                          name={`fold-${seed}`}
                          checked={unfolded}
                          onChange={(v) => override(seed, { unfoldedFold: v })}
                        />
                        <Text size='micro' variant='label' component='span'>
                          unfold
                        </Text>
                      </label>
                    </td>
                    <td data-align='left'>
                      {grainOrigin ? (
                        <Pill tone={grainOrigin === 'operator' ? 'ink' : 'ok'}>
                          {grainOrigin === 'operator' ? 'drawn' : 'found'}
                        </Pill>
                      ) : (
                        <Button
                          variant='secondary'
                          size='xs'
                          className='whitespace-nowrap border-error text-error'
                          onClick={(e: React.MouseEvent) => {
                            e.stopPropagation();
                            setSel(seed);
                            setGrainA(null);
                            setDrawing(true);
                          }}
                        >
                          ! draw
                        </Button>
                      )}
                    </td>
                    <td data-align='left'>
                      <NativeSelect
                        value={allowance.meaning}
                        onChange={(v) =>
                          override(seed, {
                            allowance: {
                              ...allowance,
                              meaning: v as LineMeaning,
                              origin: 'operator',
                            },
                          })
                        }
                        aria-label={`line meaning of piece ${mark(seed)}`}
                        className='w-24'
                        options={MEANING}
                      />
                    </td>
                    <td>
                      <NumberField
                        value={allowance.allowanceMm}
                        min={0}
                        aria-label={`allowance of piece ${mark(seed)}`}
                        className='ml-auto w-16'
                        onCommit={(v) =>
                          override(seed, {
                            allowance: { ...allowance, allowanceMm: v ?? 0, origin: 'operator' },
                          })
                        }
                      />
                    </td>
                    <td data-align='left'>
                      <NameSource
                        n={n}
                        note={nameNote(open, seed)?.detail ?? null}
                        pending={pending}
                        confirmed={inputs.confirmedNames.includes(seed)}
                        onConfirm={() => confirm(seed)}
                      />
                    </td>
                    <td data-align='left'>
                      {b ? (
                        <Pill tone='warn' title={b.detail}>
                          {REASON[b.reason] ?? b.reason}
                        </Pill>
                      ) : rowOpen(open, seed) ? (
                        <RowQuestions api={api} seed={seed} />
                      ) : (
                        <Pill tone='ok'>ready</Pill>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
          {sem.warnings.map((w) => (
            <Text key={w} size='micro' variant='label' component='p' className='mt-1'>
              {w}
            </Text>
          ))}
        </Panel>
      }
      side={
        <Panel
          title={sel != null ? `piece ${mark(sel)} · ${nameOf(sel)?.displayName || '—'}` : 'piece'}
          aside={
            sel != null && (
              <Chip
                quiet
                selected={drawing}
                pressed={drawing}
                onClick={() => {
                  setGrainA(null);
                  setDrawing((d) => !d);
                }}
              >
                {drawing ? 'drawing grainline…' : 'draw grainline'}
              </Chip>
            )
          }
          bodyClassName='p-0 flex flex-col'
        >
          {sel == null || !selOuter ? (
            <Text size='micro' variant='label' component='p' className='p-2'>
              select a row to see the piece
            </Text>
          ) : (
            <>
              <div className='min-h-0 flex-1'>
                <SheetViewport
                  bbox={session.sheet.sheet.bbox}
                  focus={selFamily?.candidates[selRank]?.bbox ?? null}
                  tool={drawing ? 'point' : 'pan'}
                  onPoint={(pt) => {
                    if (!drawing) return;
                    if (!grainA) setGrainA(pt);
                    else {
                      rerun({
                        operatorGrain: { ...inputs.operatorGrain, [sel]: { a: grainA, b: pt } },
                      });
                      setGrainA(null);
                      setDrawing(false);
                    }
                  }}
                >
                  {({ unit }) => (
                    <>
                      {families
                        .filter((f) => f.seed !== sel)
                        .map((f) => (
                          <polygon
                            key={f.seed}
                            points={ptsAttr(f.candidates[selRank]?.outer ?? [])}
                            fill='none'
                            stroke='#dddddd'
                            strokeWidth={unit}
                          />
                        ))}
                      <polygon
                        points={ptsAttr(selOuter)}
                        fill='#f2f2f2'
                        stroke={SHEET_INK.ink}
                        strokeWidth={unit * 1.6}
                      />
                      {selGrain && (
                        <GrainMark
                          a={selGrain.a}
                          b={selGrain.b}
                          unit={unit}
                          tone={inputs.operatorGrain[sel] ? SHEET_INK.blue : SHEET_INK.red}
                        />
                      )}
                      {grainA && (
                        <circle
                          cx={grainA.x}
                          cy={vy(grainA.y)}
                          r={unit * 4}
                          fill={SHEET_INK.blue}
                        />
                      )}
                    </>
                  )}
                </SheetViewport>
              </div>
              <div className='shrink-0 border-t border-hairline p-2'>
                {drawing ? (
                  <Text size='micro' component='p' className='text-warning'>
                    {grainA
                      ? '! click the second end of the grainline'
                      : '! click the first end of the grainline'}
                  </Text>
                ) : (
                  <>
                    <Row
                      label='blocks'
                      value={
                        specsOf(sel)
                          .map((s) => s.identity)
                          .join(', ') || '—'
                      }
                    />
                    <Row
                      label='sizes'
                      value={
                        specsOf(sel)[0]
                          ?.sizes.map((z) => z.sizeToken)
                          .join(' ') || '—'
                      }
                    />
                    <Row
                      label='fabrics (proposed)'
                      value={nameOf(sel)?.suggestion?.fabrics.length ?? '—'}
                    />
                    {blockedOf(sel) && (
                      <Text size='micro' component='p' className='mt-1 text-error'>
                        ! {blockedOf(sel)!.detail}
                        {blockedOf(sel)!.reason === 'leak' ? ' — back to pieces to fix it' : ''}
                      </Text>
                    )}
                  </>
                )}
              </div>
            </>
          )}
          <GroupLabel className='mx-2'>card pieces already here</GroupLabel>
          <Text size='micro' variant='label' component='p' className='px-2 pb-2'>
            {card.existingPieces.length
              ? `${card.existingPieces.map((p) => p.name).join(', ')} — a name is bound to an existing piece only when the sheet's own text says so, never on an AI guess alone.`
              : 'the card has no cut pieces yet — every row creates one.'}
          </Text>
        </Panel>
      }
    />
  );
}

/** The code input: grammar checked per keystroke, committed on blur/Enter. */
/** "LIN_FP_1" → code LIN_FP (all code words), mods ['1']. */
function splitCode(v: string): { code: string; mods: string[] } {
  const t = v.trim().split('_').filter(Boolean).join('_');
  const words = t ? codeWordsOf(t) : [];
  return { code: words.join('_'), mods: t.split('_').slice(words.length) };
}

function CodeCell({
  value,
  hand,
  blocks,
  sizeTokens,
  aiName,
  onCommit,
}: {
  value: string;
  hand: 'L' | 'R' | null;
  blocks: string;
  sizeTokens: ReadonlySet<string>;
  /** The model's code, untouched: it must be a dictionary code (D2). A typed code is the operator's. */
  aiName: boolean;
  onCommit: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setText(value);
  }
  // The hand is added by the pair control, so check the identities the writer will actually spell
  // (both hands, declared as a pair) with the gate's own G11 rule.
  const { code, mods } = splitCode(text);
  const isSizeToken = sizeTokenTest(sizeTokens);
  const why = text.trim()
    ? identitiesOf(code, mods, hand)
        .map((w) =>
          identityProblem(w.identity, {
            isSizeToken,
            pair: { hand: w.pairHand, of: w.pairOf },
            isKnownCode: aiName && text === value ? isKnownCode : undefined,
          }),
        )
        .find((x) => x) ?? null
    : 'empty code';
  const verdict = why ? { ok: false as const, why } : { ok: true as const };
  return (
    <span className='flex flex-col gap-0.5'>
      <Input
        value={text}
        aria-invalid={!verdict.ok || undefined}
        aria-label='piece code'
        className='h-[22px] w-20 uppercase'
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
          setText(e.currentTarget.value.toUpperCase())
        }
        onBlur={() => text !== value && onCommit(text.trim())}
        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
      {!verdict.ok ? (
        <Text size='nano' component='span' className='text-error'>
          ! {verdict.why}
        </Text>
      ) : (
        blocks && (
          <Text size='nano' variant='label' component='span'>
            {blocks}
          </Text>
        )
      )}
    </span>
  );
}

function NameSource({
  n,
  note,
  pending,
  confirmed,
  onConfirm,
}: {
  n: NameDecision | undefined;
  /** D3: the code was read off a construction note, not the piece's title — unconfirmed. */
  note: string | null;
  pending: boolean;
  confirmed: boolean;
  onConfirm: () => void;
}) {
  if (!n) return <span className='text-labelColor'>—</span>;
  if (note)
    return (
      <Chip tone='attention' onClick={onConfirm} title={`${note} · click to confirm`}>
        sheet note · confirm
      </Chip>
    );
  const text = n.source === 'text';
  if (text && !confirmed) return <Pill tone='mut'>sheet text</Pill>;
  if (confirmed) return <Pill tone='ink'>you</Pill>;
  if (n.autoAccepted)
    return (
      <Pill
        tone='attention'
        title='accepted automatically above the confidence threshold — still yours to change'
      >
        AI auto · {fmtPct(n.confidence, 0)}
      </Pill>
    );
  if (pending)
    return (
      <Chip
        tone='attention'
        onClick={onConfirm}
        title={
          n.suggestion?.evidence.join(' · ') || 'AI suggestion below the auto-accept threshold'
        }
      >
        AI {fmtPct(n.confidence, 0)} · confirm
      </Chip>
    );
  return <Pill tone='mut'>AI</Pill>;
}

function GrainMark({ a, b, unit, tone }: { a: PtMm; b: PtMm; unit: number; tone: string }) {
  const ang = Math.atan2(vy(b.y) - vy(a.y), b.x - a.x);
  const h = unit * 10;
  const tip = (p: PtMm, dir: number) => {
    const x = p.x;
    const y = vy(p.y);
    return `${x},${y} ${x - h * Math.cos(ang - dir * 0.4) * dir},${y - h * Math.sin(ang - dir * 0.4) * dir} ${x - h * Math.cos(ang + dir * 0.4) * dir},${y - h * Math.sin(ang + dir * 0.4) * dir}`;
  };
  return (
    <g pointerEvents='none'>
      <line x1={a.x} y1={vy(a.y)} x2={b.x} y2={vy(b.y)} stroke={tone} strokeWidth={unit * 1.8} />
      <polygon points={tip(b, 1)} fill={tone} />
      <polygon points={tip(a, -1)} fill={tone} />
    </g>
  );
}
