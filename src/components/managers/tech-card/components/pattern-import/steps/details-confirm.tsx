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
import type { AllowanceDecision, SeedId } from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip } from 'ui/components/chip';
import Text from 'ui/components/text';
import type { ImportSessionApi } from '../use-import-session';
import { countWords, openQuestions } from '../use-import-session';
import { NumberField } from '../ui-bits';
import { layerWordConflict, outlineByLayerWord } from '../autopilot/outline-word';

/** The open questions of the step, as the footer counts them (live answers only, S3). */
export function useOpenQuestions(api: ImportSessionApi) {
  return openQuestions(api.session.semantics, api.session.names, api.inputs, api.answersNow);
}

export function OutlineQuestion({
  api,
  current,
}: {
  api: ImportSessionApi;
  current: AllowanceDecision;
}) {
  const open = useOpenQuestions(api).allowance;
  const [mm, setMm] = useState(
    current.allowanceMm > 0 ? current.allowanceMm : PATIMPORT.defaultAllowanceMm,
  );
  if (!open.length || current.origin === 'operator') return null;
  const busy = !!api.session.busy;
  // PASSPORT (c): the file's own word for the outline layer pre-fills the answer (one evidence)
  const word = outlineByLayerWord(api.session);
  // …unless the sheet's text / second line says the other line: then both are quoted, nothing pre-filled
  const clash = layerWordConflict(
    api.session,
    current.origin === 'text' || current.origin === 'measured' ? current : null,
  );
  const prefill = word?.kind === 'cut' && !clash ? 'cut' : null;
  return (
    <CalloutBox
      tone='warning'
      className='mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 py-1.5'
    >
      <Text size='micro' component='p' className='min-w-0 flex-1'>
        <b>! what is the drawn outline?</b>{' '}
        {current.evidence.some((e) => /only for some pieces/.test(e))
          ? 'the sheet gives allowances only for some pieces or edges, none for the whole file'
          : 'the sheet has no allowance note and no second line'}{' '}
        ({open.length} {open.length === 1 ? 'piece' : 'pieces'}). answer once for the file.
        {clash && ` ${clash}`}
        {!clash &&
          word?.kind === 'cut' &&
          ` the file names the layer of every outline ${word.layers.map((l) => `«${l}»`).join(', ')}: cut line is pre-filled.`}
        {word?.kind === 'stop' && ` ${word.reason}`}
      </Text>
      <span className='flex flex-wrap items-center gap-1.5'>
        <Button
          variant={prefill === 'cut' ? 'main' : 'secondary'}
          size='xs'
          disabled={busy}
          title='the allowance is already in the drawing: the outline is cut as drawn'
          onClick={() => void api.answerOutline('cut', mm)}
        >
          cut line · as drawn
        </Button>
        <Button
          variant='secondary'
          size='xs'
          disabled={busy}
          title='the outline is the sewing line: the cut line is built this far outside it'
          onClick={() => void api.answerOutline('seam', mm)}
        >
          seam line · add {mm} mm
        </Button>
        <NumberField
          value={mm}
          min={0}
          aria-label='allowance to add to a seam line, mm'
          className='w-12'
          onCommit={(v) => v != null && v >= 0 && setMm(v)}
        />
        <Text size='micro' variant='label' component='span'>
          mm
        </Text>
      </span>
    </CalloutBox>
  );
}

export function ConfirmStrip({ api }: { api: ImportSessionApi }) {
  const open = useOpenQuestions(api);
  if (!open.total) return null;
  return (
    <div className='mt-2 flex flex-wrap items-center gap-2'>
      <Text size='micro' component='p' className='min-w-0 flex-1 text-warning'>
        ! {countWords(open)} not proven by the sheet: check the marked rows, fix any that are wrong,
        then confirm the rest.
        {open.quantity.some((u) => u.foldAlt) &&
          ` ${open.quantity.filter((u) => u.foldAlt).length} may be cut on fold instead of a pair.`}
      </Text>
      <Button
        variant='main'
        size='xs'
        disabled={!!api.session.busy}
        onClick={() => api.confirmShown()}
        title='accept every marked quantity and name as the table shows it now'
      >
        confirm all as shown
      </Button>
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
 * another). Shown only when the list was read from the text layer (our grammar, a cutting section).
 */
export function PassportNote({ api }: { api: ImportSessionApi }) {
  const p = api.session.semantics?.passport;
  if (!p || !p.pieces.length) return null;
  const bound = p.pieces.filter((e) => e.binding);
  const missing = p.pieces.filter((e) => !e.binding);
  const tag = (e: (typeof p.pieces)[number]) =>
    `${e.label?.value ?? '?'} «${e.name.value}»${e.qty ? ` ×${e.qty.value.n}${e.qty.value.mode === 'fold' ? ' on fold' : ''}` : ''}`;
  return (
    <Text
      size='micro'
      component='p'
      className={`mt-2 ${missing.length ? 'text-warning' : 'text-textInactiveColor'}`}
    >
      the document&apos;s cutting list names {p.pieces.length}{' '}
      {p.pieces.length === 1 ? 'piece' : 'pieces'}; {bound.length} found on this sheet by the
      printed number
      {missing.length > 0 &&
        ` — not found here: ${missing
          .slice(0, 6)
          .map(tag)
          .join(
            ', ',
          )}${missing.length > 6 ? ` +${missing.length - 6}` : ''} (another model or sheet, cut by dimensions, or lost — check)`}
      {(p.extra?.length ?? 0) > 0 &&
        ` · on the sheet but not in the list: ${(p.extra ?? []).slice(0, 6).join(', ')}`}
    </Text>
  );
}
