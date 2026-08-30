import type { GetDesignBandResponse, common_MediaFull } from 'api/proto-http/admin';
import { useMediaMap } from 'components/managers/media/utils/useMediaQuery';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Text from 'ui/components/text';

import type { TechCardFormData } from '../../schema';
import { openDoor, type CalloutLike } from '../mint-dialog';
import type { BoardItem } from '../mood-board';
import { viewLabel } from '../views';

/**
 * WHAT THE MODEL GETS — the card's own prompt-facing inventory, in one read-only place.
 *
 * IT SAYS OUT LOUD THAT NOTHING IS DISPATCHED FROM HERE, and that is the first line rather than a
 * footnote. The generative machine is CUT in this wave — the same measured reasons `kinds-strip.tsx`
 * carries on the strip: the backend parses no pictures out of a model's answer, there is no
 * provider, and the answer ceiling is smaller than one base64 PNG. A screen that listed «the
 * prompt» without saying so would be a promise nothing keeps.
 *
 * SO WHY IT EXISTS AT ALL. Because every line of it is a REAL, LIVE fact about this card and there
 * is nowhere else that assembles them: which reference pictures carry a role and in what order,
 * which sit on the card carrying none, which pictures the prompt would never see whatever happens
 * (a moodboard tile is mood, not instruction), and the words the card states about the garment. A
 * technologist handing this style to a studio outside reads exactly this list, and today he has to
 * reconstruct it from four blocks on two tabs.
 *
 * NOTHING HERE IS EDITABLE, AND THAT IS THE DESIGN. Edits happen at the field's home; a second
 * writer for a role or a note would be a second opinion about the same row. Where an address exists
 * the line is a DOOR (`revealField` walks to the rendered field and pulses it); where the block
 * carries no `data-field` the modal names the block in words instead of drawing a button that
 * cannot lead anywhere.
 *
 * THE PROMPT NUMBERS ARE DENSE AND DERIVED, exactly as the references block computes them: a scan
 * in board order, skipping the roleless. A stored number would need N writes every time a role is
 * cleared and would disagree with the block next to it after the first race.
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
  const concept = (useWatch({ control, name: 'concept' }) ?? '') as string;
  const notes = (useWatch({ control, name: 'notes' }) ?? '') as string;
  const fit = (useWatch({ control, name: 'fit' }) ?? '') as string;

  const roleOf = useMemo(() => {
    const map = new Map<number, string>();
    for (const r of band.references ?? []) {
      if (r.mediaId != null && (r.role ?? '').trim()) map.set(r.mediaId, (r.role as string).trim());
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
      const line: Line = { mediaId: item.mediaId, role, note: (item.caption ?? '').trim() };
      if (role) inPrompt.push({ ...line, number: ++n });
      else onCardOnly.push(line);
    }
    // A role whose picture has fallen off the card. It still counts as «in the prompt» — the role
    // row is what the model would be fed — and it is listed last so it can be found and cleared.
    for (const [mediaId, role] of roleOf) {
      if (seen.has(mediaId)) continue;
      inPrompt.push({ mediaId, role, note: '', number: ++n });
    }
    return { inPrompt, onCardOnly };
  }, [items, roleOf]);

  const moodCount = items.filter((i) => i.kind !== REFERENCE_KIND && !roleOf.has(i.mediaId)).length;

  const words = useMemo(
    () =>
      [
        `garment: ${concept.trim() || '—'}`,
        `fit: ${fit.trim() || '—'} (from the card)`,
        `notes: ${notes.trim() || '—'}`,
        `references in the prompt: ${lines.inPrompt.length} of ${lines.inPrompt.length + lines.onCardOnly.length}`,
      ].join('\n'),
    [concept, fit, notes, lines],
  );

  const copy = async () => {
    // `navigator.clipboard`, NEVER `document.execCommand('copy')`. execCommand writes whatever the
    // document's SELECTION is at that moment, and this dialog opens over a form — the last thing
    // that took a selection was somebody's text field, and the copy would silently land there
    // instead. That has happened in this repo before.
    if (!navigator.clipboard?.writeText) {
      showMessage(
        'this browser does not offer the clipboard — select the text and copy it',
        'error',
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(words);
      showMessage('copied as text', 'success');
    } catch {
      showMessage('the browser refused the clipboard — select the text and copy it', 'error');
    }
  };

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={() => onOpenChange(false)}
      closeOnConfirm={false}
      width='lg'
      title='what the model gets — flat'
      cancelLabel='close'
      confirmLabel='close'
      footerHint='nothing here is editable — every fact is edited at its own field'
    >
      <div className='space-y-stack'>
        <CalloutBox tone='note'>
          <Text size='micro' component='p'>
            <b>nothing is sent from this admin.</b> Flats, renders and 3D are not made on this card
            in this wave — there is no generator behind the button and the strip on STUDIO says so
            at each of them. This is the INVENTORY: what a prompt would carry if one were assembled,
            and it is exactly what a studio outside needs to be handed.
          </Text>
        </CalloutBox>

        <div>
          <GroupLabel
            flush
            action={
              <Text size='micro' variant='label' component='span'>
                {lines.inPrompt.length} of {lines.inPrompt.length + lines.onCardOnly.length} on the
                card
              </Text>
            }
          >
            pictures
          </GroupLabel>
          {lines.inPrompt.length === 0 ? (
            <Text size='micro' variant='label' component='p'>
              no picture on this card carries a role, so none of them would be shown.
            </Text>
          ) : (
            lines.inPrompt.map((line) => (
              <ReferenceLine key={line.mediaId} line={line} media={mediaById.get(line.mediaId)} />
            ))
          )}
        </div>

        <div>
          <GroupLabel
            action={
              <Text size='micro' variant='label' component='span'>
                {lines.onCardOnly.length} · on the card only
              </Text>
            }
          >
            not sent
          </GroupLabel>
          {lines.onCardOnly.length === 0 ? (
            <Text size='micro' variant='label' component='p'>
              every picture in the input carries a role.
            </Text>
          ) : (
            lines.onCardOnly.map((line) => (
              <ReferenceLine key={line.mediaId} line={line} media={mediaById.get(line.mediaId)} />
            ))
          )}
          <Text size='nano' variant='label' component='p' className='mt-1'>
            a role is given in the <b>input — references</b> block on STUDIO; clearing one takes the
            picture out of the prompt and leaves it on the card
          </Text>
        </div>

        <div>
          <GroupLabel
            action={
              <Text size='micro' variant='label' component='span'>
                what a model would have no knowledge of
              </Text>
            }
          >
            not sent at all
          </GroupLabel>
          <ChipRow>
            <Chip title='mood is for the human — it is never instruction'>
              moodboard · {moodCount}
            </Chip>
            <Chip
              title='the callouts on the sheet'
              onClick={
                callouts.length
                  ? () =>
                      openDoor(
                        'callouts.0.description',
                        'the callouts are on ARTIFACTS, beside the sheet',
                        showMessage,
                      )
                  : undefined
              }
            >
              callouts · {callouts.length}
            </Chip>
            <Chip
              onClick={() =>
                openDoor('notes', 'notes are in the description block on STUDIO', showMessage)
              }
            >
              notes
            </Chip>
            <Chip title='the bill of materials lives on its own tab'>BOM</Chip>
            <Chip title='colourways live on their own tab'>colourways</Chip>
          </ChipRow>
        </div>

        <div>
          <GroupLabel
            action={
              <Button variant='secondary' size='xs' onClick={copy}>
                copy as text
              </Button>
            }
          >
            words
          </GroupLabel>
          {/* A PANEL FILL, NOT A SECOND BOX. `bgSecondary` is a tint inside the block; a bordered
              rectangle here would be a box in a box, which this system forbids. */}
          <pre className='overflow-x-auto whitespace-pre-wrap break-words bg-bgSecondary p-2 text-micro'>
            {words}
          </pre>
          <div className='mt-1 flex flex-wrap gap-1.5'>
            <Button
              variant='secondary'
              size='xs'
              onClick={() =>
                openDoor(
                  'concept',
                  'the concept is in the description block on STUDIO',
                  showMessage,
                )
              }
            >
              edit the concept ▸
            </Button>
            <Button
              variant='secondary'
              size='xs'
              onClick={() => openDoor('fit', 'the fit is on HEADER', showMessage)}
            >
              edit the fit ▸
            </Button>
          </div>
        </div>
      </div>
    </ConfirmationModal>
  );
}

/**
 * One picture of the input.
 *
 * A MISSING NOTE IS CALLED OUT IN RED, and it is the one red thing on this screen. A reference with
 * a role and no note is a picture handed over with no statement of what it is FOR — the receiving
 * studio sees a photograph and guesses. That is a defect of the card, so it is worded as one.
 */
function ReferenceLine({ line, media }: { line: Line; media?: common_MediaFull }) {
  const url = thumbOf(media);
  return (
    <div className='flex items-center gap-2 border-b border-hairline py-1'>
      <span className='block h-10 w-8 shrink-0 border border-borderColor bg-bgSecondary'>
        {url ? (
          <img src={url} alt='' loading='lazy' className='h-full w-full object-cover' />
        ) : null}
      </span>
      <span
        className={
          line.number
            ? 'flex h-4 w-4 shrink-0 items-center justify-center bg-textColor text-bgColor'
            : 'flex h-4 w-4 shrink-0 items-center justify-center border border-borderColor'
        }
      >
        <Text size='nano' component='span'>
          {line.number ?? '—'}
        </Text>
      </span>
      <Text size='micro' component='span' className='min-w-0 flex-1'>
        {line.role ? (
          <b>{viewLabel(line.role)}</b>
        ) : (
          <span className='text-labelColor'>no role</span>
        )}
        {' — '}
        {line.note ? (
          line.note
        ) : (
          <span className='text-error'>note is missing; the picture goes unexplained</span>
        )}
      </Text>
    </div>
  );
}
