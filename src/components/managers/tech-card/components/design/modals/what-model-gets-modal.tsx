import type { GetDesignBandResponse, common_MediaFull } from 'api/proto-http/admin';
import { useMediaMap } from 'components/managers/media/utils/useMediaQuery';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import type { TechCardFormData } from '../../schema';
import {
  CopyWords,
  InventoryLine,
  NotSent,
  WmgGroup,
  WmgShell,
  WordsAsSent,
  latestRunOfKind,
} from '../core';
import { openDoor } from '../doors';
import type { BoardItem } from '../mood-board';
import type { CalloutLike } from '../render/what-model-gets';
import { viewLabel } from '../views';

/**
 * WHAT THE MODEL GETS — THE FLAT ARM: a reader of the FORM.
 *
 * THE MARKUP IS NOT HERE. It is `core/wmg.tsx`, one for every step (contract §B); this file is the
 * SUPPLIER — it knows which form fields make up the flat dispatch and in what order, and it hands
 * the parts to the shared lines. The render / 3D / recolour arms live in `render/what-model-gets`
 * and read the BAND; the two files stay apart because their dependency sets have nothing in common,
 * not because their panels may look different.
 *
 * EVERY LINE OF IT IS A REAL, LIVE FACT ABOUT THIS CARD and there is nowhere else that assembles
 * them: which reference pictures carry a role and in what order, which sit on the card carrying
 * none, which pictures the prompt would never see whatever happens (a moodboard tile is mood, not
 * instruction), and the words the card states about the garment. A technologist handing this style
 * to a studio outside reads exactly this list.
 *
 * NOTHING HERE IS EDITABLE, AND THAT IS THE DESIGN. Edits happen at the field's home; a second
 * writer for a role or a note would be a second opinion about the same row. Where an address exists
 * the line is a DOOR (`openDoor` walks to the rendered field and pulses it); where the block carries
 * no `data-field` the panel names the block in words instead of drawing a button that cannot lead
 * anywhere.
 *
 * THE PROMPT NUMBERS ARE DENSE AND DERIVED, exactly as the references block computes them: a scan
 * in board order, skipping the roleless. A stored number would need N writes every time a role is
 * cleared and would disagree with the block next to it after the first race.
 *
 * AND THE SENT TEXT ITSELF — `run.prompt` of the latest flat run — CLOSES THE OWNER'S CLAIM «if
 * there are comments/example prompts I wrote, why weren't they added». His paragraphs WERE in every
 * dispatch; nothing on any screen showed the words, so the inventory above read as the whole story.
 * The worker stores the composed base instruction at dispatch (never rebuilt on read), and this
 * panel shows that text verbatim. The inventory answers «which pictures travelled», the text
 * answers «in what words».
 */

const REFERENCE_KIND = 'TECH_CARD_MEDIA_KIND_REFERENCE';

type Line = {
  mediaId: number;
  role: string;
  note: string;
  number?: number;
};

function thumbOf(media?: common_MediaFull): string {
  const m = media?.media;
  return m?.thumbnail?.mediaUrl || m?.compressed?.mediaUrl || m?.fullSize?.mediaUrl || '';
}

export function WhatModelGetsModal({
  open,
  onOpenChange,
  band,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  band: GetDesignBandResponse;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const { showMessage } = useSnackBarStore();
  const mediaById = useMediaMap();

  // READ-ONLY SUBSCRIPTIONS. `useWatch`, never `useFieldArray`: the studio already holds ONE field
  // array over `callouts` and a second instance over the same name does not synchronise with it in
  // react-hook-form 7.62 — a defect this band has already paid for once.
  const items = (useWatch({ control, name: 'moodboardMedia' }) ?? []) as BoardItem[];
  const callouts = (useWatch({ control, name: 'callouts' }) ?? []) as CalloutLike[];
  // `garment_description` (W-3), NOT `concept`. The two are different documents: `concept` is
  // prose printed for the factory, `garment_description` is the sentence the operator writes FOR
  // THE MODEL and which goes into every run. Showing one under the other's name made this panel
  // state, next to a price, that the model receives words it does not receive.
  const garment = (useWatch({ control, name: 'garmentDescription' }) ?? '') as string;
  const fit = (useWatch({ control, name: 'fit' }) ?? '') as string;

  const roleOf = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of band.references ?? []) {
      if (r.mediaId != null && (r.role ?? '').trim()) map.set(r.mediaId, (r.role as string).trim());
    }
    return map;
  }, [band.references]);

  // The reference's note lives on `DesignReference.note`, beside the role, because it is a
  // statement about the INPUT and not about the picture. Reading the board row's `caption` would
  // show every note as blank — the quietest possible way for this panel to under-report.
  const noteOf = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of band.references ?? []) {
      if (r.mediaId != null && (r.note ?? '').trim()) map.set(r.mediaId, (r.note as string).trim());
    }
    return map;
  }, [band.references]);

  /**
   * Membership is the UNION of the two halves, the same rule the references block applies: a
   * picture with a role belongs to the input even if its `kind` has drifted, because a role is the
   * stronger statement and hiding its carrier would leave a record visible on no screen at all.
   */
  const lines = useMemo(() => {
    const inPrompt: Line[] = [];
    const onCardOnly: Line[] = [];
    let n = 0;
    const seen = new Set<number>();
    for (const item of items) {
      const role = roleOf.get(item.mediaId) ?? '';
      if (item.kind !== REFERENCE_KIND && !role) continue;
      seen.add(item.mediaId);
      const line: Line = { mediaId: item.mediaId, role, note: noteOf.get(item.mediaId) ?? '' };
      if (role) inPrompt.push({ ...line, number: ++n });
      else onCardOnly.push(line);
    }
    // A role whose picture has fallen off the card. It still counts as «in the prompt» — the role
    // row is what the model would be fed — and it is listed last so it can be found and cleared.
    for (const [mediaId, role] of roleOf) {
      if (seen.has(mediaId)) continue;
      inPrompt.push({ mediaId, role, note: noteOf.get(mediaId) ?? '', number: ++n });
    }
    return { inPrompt, onCardOnly };
  }, [items, roleOf, noteOf]);

  const moodCount = items.filter((i) => i.kind !== REFERENCE_KIND && !roleOf.has(i.mediaId)).length;
  const total = lines.inPrompt.length + lines.onCardOnly.length;

  /**
   * THE LATEST FLAT RUN — the newest row of THIS door's kind. A render's or a vector's text under
   * this title would answer a question nobody asked here.
   */
  const lastRun = useMemo(() => latestRunOfKind(band.runs, 'flat'), [band.runs]);
  /**
   * The contract's own deviation notes, spoken beside the text so nobody reads «base» as
   * «transcript»: on `per_view` each paid call got «view: …» appended, and only the single-call
   * flat route is byte-for-byte what the provider received.
   */
  const sentCaveat =
    (lastRun?.params?.layout ?? '').trim() === 'per_view'
      ? 'the base instruction — each view’s paid call also received its own «view: …» line appended'
      : 'stored at dispatch — this is the text the provider received';

  const words = useMemo(
    () =>
      [
        `garment: ${garment.trim() || '—'}`,
        `fit: ${fit.trim() || '—'} (from the card)`,
        `references in the prompt: ${lines.inPrompt.length} of ${total}`,
      ].join('\n'),
    [garment, fit, lines, total],
  );

  return (
    <WmgShell
      open={open}
      onOpenChange={onOpenChange}
      kindWord='flat'
      intro={
        <>
          <b>this is what the model is given.</b> Pressing GENERATE sends exactly the pictures and
          words listed below — nothing on the moodboard travels, and neither does anything absent
          from this list. The same inventory is what a studio outside would need to be handed.
        </>
      }
    >
      <WmgGroup flush label='pictures' aside={`${lines.inPrompt.length} of ${total} on the card`}>
        {lines.inPrompt.length === 0 ? (
          <Empty>no picture on this card carries a role, so none of them would be shown.</Empty>
        ) : (
          lines.inPrompt.map((line) => (
            <ReferenceLine key={line.mediaId} line={line} media={mediaById.get(line.mediaId)} />
          ))
        )}
      </WmgGroup>

      <WmgGroup label='words' aside='read from the card at dispatch'>
        <InventoryLine
          name='garment'
          origin='linked'
          text={
            garment.trim() || (
              <span className='text-error'>
                the card states no description; the pictures go in unexplained
              </span>
            )
          }
        />
        <InventoryLine name='fit' origin='linked' text={`${fit.trim() || '—'} (from the card)`} />
      </WmgGroup>

      <WmgGroup
        label='on the card, not in the prompt'
        aside={`${lines.onCardOnly.length} · on the card only`}
        note={
          <>
            a role is given in the <b>input — references</b> block on STUDIO; clearing one takes the
            picture out of the prompt and leaves it on the card
          </>
        }
      >
        {lines.onCardOnly.length === 0 ? (
          <Empty>every picture in the input carries a role.</Empty>
        ) : (
          lines.onCardOnly.map((line) => (
            <ReferenceLine key={line.mediaId} line={line} media={mediaById.get(line.mediaId)} />
          ))
        )}
      </WmgGroup>

      <NotSent
        items={[
          {
            label: `moodboard · ${moodCount}`,
            reason: 'mood is for the human — it is never instruction',
          },
          {
            label: `callouts · ${callouts.length}`,
            reason: 'the callouts on the sheet are for the factory; the flat run never reads them',
            door: callouts.length
              ? () =>
                  openDoor(
                    'callouts.0.description',
                    'the callouts are on ARTIFACTS, beside the sheet',
                    showMessage,
                  )
              : undefined,
          },
          /* The `notes` item is gone with its field: U-9 removed the notes editor from the band, so
             a door here led to a block that no longer exists. The field itself still round-trips;
             it is simply not authored here and never was sent to the model. */
          {
            label: 'BOM',
            reason:
              'the bill of materials lives on its own tab and describes the make, not the look',
          },
          {
            label: 'colourways',
            reason: 'colourways live on their own tab; a flat is drawn uncoloured',
          },
        ]}
      />

      <CopyWords
        words={words}
        say={showMessage}
        doors={[
          {
            label: 'edit the description ▸',
            onClick: () =>
              openDoor(
                'garmentDescription',
                'the garment description is in INPUT — REFERENCES, on STUDIO',
                showMessage,
              ),
          },
          {
            label: 'edit the fit ▸',
            onClick: () => openDoor('fit', 'the fit is on HEADER', showMessage),
          },
        ]}
      />

      <WordsAsSent
        run={lastRun}
        text={(lastRun?.prompt ?? '').trim()}
        kindWord='flat'
        caveat={sentCaveat}
        whenNone='no flat run yet — the worker composes the sent text at dispatch, and this panel shows the latest run’s copy.'
      />
    </WmgShell>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <InventoryLine name='—' text={<span className='text-labelColor'>{children}</span>} />;
}

/**
 * One picture of the input.
 *
 * A MISSING NOTE IS CALLED OUT IN RED, and it is the one red thing on this screen. A reference with
 * a role and no note is a picture handed over with no statement of what it is FOR — the receiving
 * studio sees a photograph and guesses. That is a defect of the card, so it is worded as one.
 */
function ReferenceLine({ line, media }: { line: Line; media?: common_MediaFull }) {
  return (
    <InventoryLine
      name={line.role ? viewLabel(line.role) : <span className='text-labelColor'>no role</span>}
      number={line.number ?? null}
      thumb={thumbOf(media)}
      origin={line.role ? 'linked' : undefined}
      text={
        line.note ? (
          line.note
        ) : (
          <span className='text-error'>note is missing; the picture goes unexplained</span>
        )
      }
    />
  );
}
