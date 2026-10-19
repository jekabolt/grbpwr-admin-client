// D3 on the details step: what the drawing does not prove is asked, not guessed (10.10).
//
//   · OutlineQuestion: no allowance text, no second drawn line, no DXF layer. The file gets ONE
//     explicit answer, cut line or seam line + N mm (decision 7: N = 10), with no preselected
//     side — unless the file names the layer every outline lies on (PASSPORT (c): "Cut lines",
//     `CUT_x5F_LINE`): then that answer is pre-filled, still one click. The per-piece line/allowance
//     controls in the table still override it.
//   · ConfirmStrip: quantities nobody printed, names read off construction notes, AI names below
//     the threshold. One deliberate click confirms them all as shown; each row has its own.
import { useState } from 'react';
import type { AllowanceDecision, PtMm, SeedId } from 'lib/pattern-import/types';
import { cn } from 'lib/utility';
import { PATIMPORT } from 'lib/pattern-import/types';
import { Button, Chip, ChipRow, Text, Input } from 'ui';
import type { ImportSessionApi } from '../use-import-session';
import { countWords, openQuestions } from '../use-import-session';
import { ask, useAnsweredAndGo, useLikelySlot } from '../ui-bits';
import { SHEET_INK, ptsAttr, vy } from '../sheet-viewport';
import { layerWordConflict, outlineByLayerWord } from '../autopilot/outline-word';

/** The open questions of the step, as the footer counts them (live answers only, S3). */
export function useOpenQuestions(api: ImportSessionApi) {
  return openQuestions(api.session.semantics, api.session.names, api.inputs, api.answersNow);
}

/**
 * Is the file's outline still a question? While it is, the question box is the only place the
 * outline is set (the compact line/allowance fields stay hidden — one decision, one place).
 */
export function outlineAsked(api: ImportSessionApi, current: AllowanceDecision): boolean {
  const open = openQuestions(api.session.semantics, api.session.names, api.inputs, api.answersNow);
  return open.allowance.length > 0 && current.origin !== 'operator';
}

export function OutlineQuestion({
  api,
  current,
  outer = [],
}: {
  api: ImportSessionApi;
  current: AllowanceDecision;
  /** The piece the two pictures are drawn from (the file's own outline). */
  outer?: readonly PtMm[];
}) {
  const open = useOpenQuestions(api).allowance;
  const [mm, setMm] = useState(
    current.allowanceMm > 0 ? current.allowanceMm : PATIMPORT.defaultAllowanceMm,
  );
  const [otherMm, setOtherMm] = useState(false);
  const [draft, setDraft] = useState('');
  const draftN = draft.trim() === '' ? NaN : Number(draft);
  const draftMm = Number.isFinite(draftN) && draftN >= 0 ? draftN : null;
  // ANSWERED AND GO: the outline answered, the next question shows — or the step moves on
  const go = useAnsweredAndGo();
  // LIKELY ANSWERS (ui-bits): skip takes the cut line only where the file names the layer so; with
  // no word (or a clash) the outline is a real choice — no safe guess, a stop
  const likely = useLikelySlot('details-outline');
  if (!outlineAsked(api, current)) return null;
  const busy = !!api.session.busy;
  // PASSPORT (c): the file's own word for the outline layer pre-fills the answer (one evidence)
  const word = outlineByLayerWord(api.session);
  // …unless the sheet's text / second line says the other line: then both are quoted, nothing pre-filled
  const clash = layerWordConflict(
    api.session,
    current.origin === 'text' || current.origin === 'measured' ? current : null,
  );
  const prefill = word?.kind === 'cut' && !clash ? 'cut' : null;
  likely.current =
    prefill === 'cut' && !busy
      ? {
          key: 'details-outline',
          what: 'drawn outline',
          answer: 'the cut line (the file names the layer)',
          sig: 'cut',
          likely: () => api.answerOutline('cut', mm),
        }
      : null;
  const why = [
    current.evidence.some((e) => /only for some pieces/.test(e))
      ? 'the sheet gives allowances only for some pieces or edges, none for the whole file'
      : 'the sheet has no allowance note and no second line',
    `${open.length} ${open.length === 1 ? 'piece' : 'pieces'} · answer once for the file`,
    !clash && word?.kind === 'cut'
      ? `the file names the layer of every outline ${word.layers.map((l) => `«${l}»`).join(', ')}: cut line is pre-filled`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');
  // owner 16.10 (r2, «hard to understand»): two PICTURE answers drawn from the file's own piece —
  // the outline as the edge (scissors on it), or as the seam (dashed) with the cut line outside.
  // A click on a picture answers; the allowance is a chip row under the seam picture, a chip
  // answers with its value at once ("other…" opens a number field).
  const seam = (v: number) => {
    if (!(v >= 0)) return;
    setMm(v);
    go(api.answerOutline('seam', v));
  };
  const answers = (
    <span className='flex flex-wrap items-start gap-2'>
      <span className='flex flex-col gap-1.5'>
        <button
          type='button'
          {...ask('details-outline')}
          // the file names the layer every outline lies on (PASSPORT (c)): that answer is the
          // one-click fix; with no such word the outline is a choice, coached
          {...(prefill === 'cut' ? { 'data-ask-fix': '' } : {})}
          data-ask-hint='pick a picture'
          data-testid='outline-answer-cut'
          disabled={busy}
          title={`the allowance is already in the drawing: cut exactly on the drawn line${prefill === 'cut' ? ' (the file names the layer so)' : ''}`}
          onClick={() => go(api.answerOutline('cut', mm))}
          className={cn(OUTLINE_CARD, prefill === 'cut' && 'border-warning')}
        >
          <OutlinePicture outer={outer} kind='cut' />
          <Text size='micro' component='span' className='uppercase'>
            cut on this line
          </Text>
          <Text size='micro' variant='label' component='span'>
            the line is the edge
          </Text>
        </button>
      </span>
      <span className='flex flex-col gap-1.5'>
        <button
          type='button'
          {...ask('details-outline')}
          data-ask-hint='pick a picture'
          data-testid='outline-answer-seam'
          disabled={busy}
          title='the drawn line is where it is sewn: the cut line is built this far outside it'
          onClick={() => seam(mm)}
          className={OUTLINE_CARD}
        >
          <OutlinePicture outer={outer} kind='seam' />
          <Text size='micro' component='span' className='uppercase'>
            sew on this line
          </Text>
          <Text size='micro' variant='label' component='span'>
            add {mm} mm around
          </Text>
        </button>
        <ChipRow>
          {MM_CHIPS.map((v) => (
            <Chip
              key={v}
              selected={mm === v}
              disabled={busy}
              title={`sew on the drawn line, cut ${v} mm outside it`}
              onClick={() => seam(v)}
            >
              {v}
            </Chip>
          ))}
          {otherMm ? (
            // a draft: nothing is sent on blur (a chip or a picture clicked next sends its own
            // value) — only Enter or the [use N mm] chip answer with the typed value
            <>
              <Input
                type='number'
                min={0}
                value={draft}
                disabled={busy}
                autoFocus
                aria-label='allowance to add around a seam line, mm'
                className='h-[22px] w-12 tabular-nums'
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setDraft(e.currentTarget.value)
                }
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter' && draftMm != null) seam(draftMm);
                }}
              />
              {draftMm != null && (
                <Chip disabled={busy} onClick={() => seam(draftMm)}>
                  use {draftMm} mm
                </Chip>
              )}
            </>
          ) : (
            <Chip disabled={busy} onClick={() => setOtherMm(true)}>
              other…
            </Chip>
          )}
          <Text size='micro' variant='label' component='span'>
            mm
          </Text>
        </ChipRow>
      </span>
    </span>
  );
  // owner 16.10: only the picture answers — the step's question card (right, beside the preview)
  // says the question; the old full-width callout with a bold title and a number spinner is gone
  return (
    <span className='flex flex-col items-start gap-1' title={why}>
      {/* a clash between the layer word and the sheet, or why the layer word cannot answer:
          the reason the question is asked at all — stays on screen */}
      {(clash || word?.kind === 'stop') && (
        <Text size='micro' variant='label' component='p'>
          {clash ?? (word?.kind === 'stop' ? word.reason : '')}
        </Text>
      )}
      {answers}
    </span>
  );
}

const MM_CHIPS = [7, 10, 15];
const OUTLINE_CARD =
  'flex w-[144px] cursor-pointer flex-col items-center gap-1 border border-borderColor bg-bgColor p-2 text-center hover:border-textColor disabled:cursor-default disabled:opacity-50';

/**
 * One answer's picture: the piece fitted whole in a 132 px square. `cut` — the outline solid ink
 * with scissors on its top; `seam` — the outline dashed (the sewing line) and the cut line solid
 * blue outside it (a stroke-ring offset, wide enough to read at this size — not to scale).
 */
function OutlinePicture({ outer, kind }: { outer: readonly PtMm[]; kind: 'cut' | 'seam' }) {
  const S = 112;
  if (outer.length < 3) return <span style={{ width: S, height: S }} />;
  const xs = outer.map((p) => p.x);
  const ys = outer.map((p) => vy(p.y));
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX || 1;
  const h = Math.max(...ys) - minY || 1;
  const side = Math.max(w, h);
  // room for the offset ring and the scissors
  const pad = side * 0.14;
  const box = side + 2 * pad;
  const px = box / S; // viewBox units per screen pixel
  const pts = ptsAttr(outer);
  const top = outer.reduce((a, p) => (vy(p.y) < vy(a.y) ? p : a));
  return (
    <svg
      width={S}
      height={S}
      viewBox={`${minX + w / 2 - box / 2} ${minY + h / 2 - box / 2} ${box} ${box}`}
      aria-hidden
    >
      {kind === 'seam' && (
        <>
          {/* the ring: a wide blue stroke, a slightly narrower white one, the piece on top */}
          <polygon
            points={pts}
            fill='none'
            stroke={SHEET_INK.blue}
            strokeWidth={px * 14}
            strokeLinejoin='round'
          />
          <polygon
            points={pts}
            fill='none'
            stroke='#ffffff'
            strokeWidth={px * 11}
            strokeLinejoin='round'
          />
        </>
      )}
      <polygon
        points={pts}
        fill={SHEET_INK.fill}
        stroke={SHEET_INK.ink}
        strokeWidth={px * (kind === 'cut' ? 2 : 1.5)}
        strokeDasharray={kind === 'seam' ? `${px * 5} ${px * 3}` : undefined}
      />
      {kind === 'cut' && (
        <text
          x={top.x}
          y={vy(top.y)}
          fontSize={px * 22}
          textAnchor='middle'
          dominantBaseline='central'
          fill={SHEET_INK.ink}
          stroke='#ffffff'
          strokeWidth={px * 3}
          paintOrder='stroke'
        >
          ✂
        </text>
      )}
    </svg>
  );
}

export function ConfirmStrip({ api }: { api: ImportSessionApi }) {
  const open = useOpenQuestions(api);
  if (!open.total) return null;
  const foldAlt = open.quantity.filter((u) => u.foldAlt).length;
  // no summary line: each open row carries its own "? … · confirm" and the footer's ask line
  // counts them; this is the secondary shortcut — the footer keeps the one filled button
  return (
    <div className='mt-2 flex justify-end'>
      <Chip
        {...ask('details-confirm')}
        quiet
        disabled={!!api.session.busy}
        onClick={() => api.confirmShown()}
        title={`accept every marked quantity and name as the table shows it now (${countWords(open)})${foldAlt ? ` · ${foldAlt} may be cut on fold instead of a pair` : ''}`}
      >
        confirm all as shown
      </Chip>
    </div>
  );
}

/**
 * What is still open on ONE row: words for the state cell, and its confirm chip. A quantity
 * question also offers "cut on fold" (E4): the outline may be the half of a fold piece, which no
 * count fixes — the choice turns the row into the fold question (pick the edge, unfold). When an
 * asymmetric outline suggested the pair but a long straight edge would unfold it cleanly
 * (`foldAlt`), the choice is marked as the suggested alternative; it is never applied by itself.
 */
export function RowQuestions({
  api,
  seed,
  onFold,
}: {
  api: ImportSessionApi;
  seed: SeedId;
  onFold?: () => void;
}) {
  const open = useOpenQuestions(api);
  const qty = open.quantity.find((u) => u.seed === seed);
  const what = [
    qty ? 'qty' : '',
    open.name.some((u) => u.seed === seed) || open.aiNames.some((n) => n.seed === seed)
      ? 'name'
      : '',
  ].filter(Boolean);
  if (!what.length) return null;
  const why = [...open.quantity, ...open.name]
    .filter((u) => u.seed === seed)
    .map((u) => `${u.kind}: ${u.detail}`)
    .join(' · ');
  // stacked: the state column is pinned to the table's right edge and must stay narrow (1024 px)
  return (
    <span className='flex flex-col items-start gap-1'>
      <Chip
        tone='attention'
        onClick={() => api.confirmShown(seed)}
        title={`${why || 'AI name below the auto-accept threshold'} · click to confirm as shown`}
      >
        ? {what.join(' + ')} · confirm
      </Chip>
      {qty && onFold && (
        <Chip
          tone={qty.foldAlt ? 'attention' : undefined}
          dashed={!qty.foldAlt}
          disabled={!!api.session.busy}
          onClick={onFold}
          title={
            qty.foldAlt
              ? 'suggested: one long straight edge would make this outline the half of a piece cut on fold. pick the fold edge next'
              : 'the outline is the half of a piece cut on fold: pick the fold edge next'
          }
        >
          {qty.foldAlt ? 'cut on fold?' : 'on fold'}
        </Chip>
      )}
    </span>
  );
}

/** Does this row still have a quantity or name to confirm? */
export function rowOpen(open: ReturnType<typeof openQuestions>, seed: SeedId) {
  return (
    open.quantity.some((u) => u.seed === seed) ||
    open.name.some((u) => u.seed === seed) ||
    open.aiNames.some((n) => n.seed === seed)
  );
}

/** Is this row's quantity an open question (the qty cell marks it)? */
export function qtyOpen(open: ReturnType<typeof openQuestions>, seed: SeedId) {
  return open.quantity.find((u) => u.seed === seed) ?? null;
}

/** The sheet note a row's name was read from, while unconfirmed. */
export function nameNote(open: ReturnType<typeof openQuestions>, seed: SeedId) {
  return open.name.find((u) => u.seed === seed) ?? null;
}

/**
 * PASSPORT (d), Ф1: the document's own cutting list against the pieces found — a NOTE, never a
 * stop (the list may name other models, other sheets, pieces cut by dimensions or traced from
 * another). Read from the text layer only. A `HeaderWarnings` item, and only when the list names
 * a piece this sheet does not carry (all found = nothing to say).
 */
export function passportWarning(api: ImportSessionApi): string | null {
  const p = api.session.semantics?.passport;
  if (!p || !p.pieces.length) return null;
  const missing = p.pieces.filter((e) => !e.binding);
  const extra = p.extra ?? [];
  if (!missing.length && !extra.length) return null;
  const tag = (e: (typeof p.pieces)[number]) =>
    `${e.label?.value ?? '?'} «${e.name.value}»${e.qty ? ` ×${e.qty.value.n}${e.qty.value.mode === 'fold' ? ' on fold' : ''}` : ''}`;
  return [
    missing.length
      ? `cutting list: not found on this sheet — ${missing
          .slice(0, 6)
          .map(tag)
          .join(', ')}${missing.length > 6 ? ` +${missing.length - 6}` : ''}`
      : '',
    extra.length ? `on the sheet, not in the list: ${extra.slice(0, 6).join(', ')}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
