import type {
  DesignInputHeld,
  GetDesignBandResponse,
  common_DesignInputRef,
  common_DesignInputSlot,
  common_DesignRunParams,
  common_MediaFull,
} from 'api/proto-http/admin';
import { useResolvedMedia } from 'components/managers/media/utils/useMediaQuery';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useState } from 'react';
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
import { useTechCardAutosave } from '../autosave-contract';
import { viewWord } from '../board-labels';
import { usePutBack } from '../board-pick';
import { openDoor } from '../doors';
import { useFlatWords } from '../flat-words-field';
import { FIT_WHERE } from '../render/what-model-gets';
import { useFlatPreview } from '../use-design-band';

/**
 * WHAT THE MODEL GETS — THE FLAT ARM, READ FROM THE SERVER (101 Ф3).
 *
 * The pictures are NOT assembled here any more. The server answers `PreviewDesignRunInputs` with the
 * snapshot the next run would freeze for exactly the params GENERATE would send (`flatRunParams`) —
 * the same `designAssembleInputs` that StartDesignRun runs — and every other board picture with the
 * reason it stays home (`held`). One rule, on the server; this file only draws it.
 *
 * `model read · not sent`: the model's own words about a picture (`modelCaption`) are shown greyed
 * beside a held picture and NEVER travel (101 §2.7).
 *
 * The markup is `core/wmg.tsx`, one for every step. NOTHING HERE IS EDITABLE: a picture's purpose and
 * view are set on its moodboard tile.
 */

/** One word per held reason (the server's `designHeld*`). */
export const HELD_WORD: Record<string, string> = {
  mood: 'mood',
  material: 'material',
  unmarked: 'no purpose',
  pending: 'reading…',
  view_unknown: 'view ?',
  not_a_view: 'no view',
  older: 'older',
  detail: 'a detail',
  other_detail: 'another detail',
  render: 'render',
  held: 'not sent',
};

/** Why, in a few words — the line beside the held picture. */
const HELD_WHY: Record<string, string> = {
  mood: 'a flat is drawn from the garment’s own photos',
  material: 'a material is not a view of the garment',
  unmarked: 'give it a purpose on its tile',
  pending: 'the model is still reading which view it is',
  view_unknown: 'answer «which view is this?» under the moodboard',
  not_a_view: 'marked as no view',
  older: 'the two newest pictures of its view go',
  detail: 'it goes with a run of its detail',
  other_detail: 'a picture of another detail',
  render: 'a generated picture; a flat is drawn from the garment’s own photos',
  held: 'taken out of the prompt; it stays on the moodboard with its label',
};

const thumbOf = (media?: common_MediaFull): string => {
  const m = media?.media;
  return m?.thumbnail?.mediaUrl || m?.compressed?.mediaUrl || m?.fullSize?.mediaUrl || '';
};

/** The prompt's word for a reference: a view (`side L`), a hand flat (`front flat`), a detail. */
const refWord = (role: string): string =>
  role === 'front_flat' ? 'front flat' : role === 'back_flat' ? 'back flat' : viewWord(role);

export function WhatModelGetsModal({
  open,
  onOpenChange,
  band,
  techCardId = 0,
  readOnly = false,
  detail = false,
  params,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  band: GetDesignBandResponse;
  /** Чьи слова на экране (засев WORDS живёт по карточке, `words-seed.ts`). */
  techCardId?: number;
  /** Карточку нельзя писать — предложения WORDS не видно, слова = значение формы (MIN-4 c). */
  readOnly?: boolean;
  /** The `target ▾` is a detail. */
  detail?: boolean;
  /** Exactly what GENERATE would send (`flatRunParams`). */
  params: common_DesignRunParams;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const { showMessage } = useSnackBarStore();
  const autosave = useTechCardAutosave();
  const preview = useFlatPreview(techCardId, params, open, autosave.status);

  const refs = useMemo(
    () => (preview.data?.inputs?.refs ?? []).filter((r) => (r.mediaId ?? 0) > 0),
    [preview.data],
  );
  const slots = useMemo(
    () => (preview.data?.inputs?.slots ?? []).filter((s) => (s.mediaId ?? 0) > 0),
    [preview.data],
  );
  const held = useMemo(() => preview.data?.held ?? [], [preview.data]);
  const putBack = usePutBack(techCardId);

  // Thumbnails: the snapshot carries its media; a held picture is resolved through the library.
  const heldIds = useMemo(() => held.map((h) => h.mediaId ?? 0).filter((id) => id > 0), [held]);
  const library = useResolvedMedia(heldIds);

  const fit = (useWatch({ control, name: 'fit' }) ?? '') as string;
  // M14: the words a flat sends — the class line (following the category the way GENERATE does) and
  // the person's own lines from WORDS; the same hook draws the WORDS box.
  const flatWords = useFlatWords(techCardId, readOnly);
  const sentWords = flatWords.sent;
  const sentCallouts = refs.reduce((n, r) => n + (r.callouts ?? []).length, 0);
  const pictures = refs.length + slots.length;

  const lastRun = useMemo(() => latestRunOfKind(band.runs, 'flat'), [band.runs]);
  const sentCaveat =
    (lastRun?.params?.layout ?? '').trim() === 'per_view'
      ? 'the base instruction — each view’s paid call also received its own «view: …» line appended'
      : 'stored at dispatch — this is the text the provider received';

  const words = useMemo(
    () =>
      [
        sentWords || 'garment: —',
        `fit: not sent (a flat draws construction only)`,
        ...refs.map((r, i) => `${i + 1}. ${refWord((r.role ?? '').trim())}`),
        ...slots.map(
          (s, i) => `${refs.length + i + 1}. accepted ${viewWord(s.viewKey ?? '')} flat`,
        ),
        `callouts in the prompt: ${sentCallouts}`,
      ].join('\n'),
    [sentWords, refs, slots, sentCallouts],
  );

  return (
    <WmgShell
      open={open}
      onOpenChange={onOpenChange}
      kindWord='flat'
      intro={
        <>
          <b>this is what the model is given</b>, as the server would send it now: the moodboard
          pictures marked <b>target</b>, the two newest of each view
          {detail
            ? ', or the four newest photos of this detail with the accepted FRONT and BACK'
            : ''}
          , and the words under them. Nothing absent from this list travels.
        </>
      }
    >
      <WmgGroup
        flush
        label='pictures'
        aside={
          preview.isFetching && !preview.data
            ? 'asking the server…'
            : `${pictures} sent · ${sentCallouts} callout${sentCallouts === 1 ? '' : 's'}`
        }
        note='in prompt order; a callout travels with its picture, in words'
        data-wmg-sent={pictures}
      >
        {preview.isError ? (
          <Empty>the server did not answer — close and open again.</Empty>
        ) : !preview.data ? (
          <Empty>asking the server…</Empty>
        ) : pictures === 0 ? (
          <Empty>
            {detail
              ? 'no photo of this detail is on the moodboard.'
              : 'no moodboard picture is marked target with a known view.'}
          </Empty>
        ) : (
          <>
            {refs.map((r, i) => (
              <RefLine key={`r${r.mediaId}`} n={i + 1} r={r} />
            ))}
            {slots.map((s, i) => (
              <SlotLine key={`s${s.mediaId}`} n={refs.length + i + 1} s={s} />
            ))}
          </>
        )}
      </WmgGroup>

      {held.length > 0 && (
        <WmgGroup
          label='on the moodboard, not sent'
          aside={`${held.length}`}
          note='the model’s own reading of a picture is shown greyed and never sent'
          data-wmg-held={held.length}
        >
          {held.map((h) => (
            <HeldLine
              key={h.mediaId}
              h={h}
              media={library.get(h.mediaId ?? 0)}
              onSendAgain={readOnly ? undefined : putBack}
            />
          ))}
        </WmgGroup>
      )}

      <WmgGroup
        label='words'
        aside='read from the card at dispatch'
        note='the class line and the lines typed in WORDS; nothing a model wrote is sent'
        data-wmg-server-words={preview.data?.inputs?.garmentNote ?? ''}
      >
        <InventoryLine
          name='garment'
          origin='linked'
          text={
            flatWords.classLine || (
              <span className='text-error'>
                the card names no garment class; the pictures go in unexplained
              </span>
            )
          }
        />
        {flatWords.human && (
          <InventoryLine
            name='words'
            origin='typed'
            data-wmg-words=''
            text={<span className='whitespace-pre-line'>{flatWords.human}</span>}
          />
        )}
        <InventoryLine
          name='fit'
          origin='linked'
          text={`not sent — ${fit.trim() || '—'} on the card; a flat draws construction only`}
        />
      </WmgGroup>

      <NotSent
        items={[
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
            label: 'edit the words ▸',
            onClick: () => openDoor('flatWords', 'the words are in INPUT, on FLAT', showMessage),
          },
          {
            label: 'edit the fit ▸',
            onClick: () => openDoor('fit', FIT_WHERE, showMessage),
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

function RefLine({ n, r }: { n: number; r: common_DesignInputRef }) {
  const callouts = (r.callouts ?? []).map((c) => (c.text ?? '').trim()).filter(Boolean);
  const note = (r.note ?? '').trim();
  return (
    <InventoryLine
      data-wmg-ref={r.mediaId}
      name={refWord((r.role ?? '').trim())}
      number={n}
      thumb={thumbOf(r.media)}
      origin='linked'
      text={
        note || callouts.length ? (
          <>
            {note}
            {callouts.length > 0 && (
              <span className='block text-labelColor' data-wmg-callouts={callouts.length}>
                callouts · {callouts.join(' · ')}
              </span>
            )}
          </>
        ) : (
          <span className='text-labelColor'>moodboard picture</span>
        )
      }
    />
  );
}

function SlotLine({ n, s }: { n: number; s: common_DesignInputSlot }) {
  return (
    <InventoryLine
      data-wmg-slot={s.mediaId}
      name={`accepted ${viewWord((s.viewKey ?? '').trim())}`}
      number={n}
      thumb={thumbOf(s.media)}
      origin='linked'
      text={<span className='text-labelColor'>the flat on the bench, for the silhouette</span>}
    />
  );
}

function HeldLine({
  h,
  media,
  onSendAgain,
}: {
  h: DesignInputHeld;
  media?: common_MediaFull;
  /** M15: a picture a person took out of the prompt goes back with one tap. */
  onSendAgain?: (mediaId: number) => Promise<boolean>;
}) {
  const reason = (h.reason ?? '').trim();
  const caption = (h.modelCaption ?? '').trim();
  const [sending, setSending] = useState(false);
  return (
    <InventoryLine
      data-wmg-held-line={reason}
      name={<span className='text-labelColor'>{HELD_WORD[reason] ?? reason}</span>}
      thumb={thumbOf(media)}
      text={
        <span className='text-labelColor'>
          {HELD_WHY[reason] ?? ''}
          {reason === 'held' && onSendAgain && (
            <>
              {' '}
              <button
                type='button'
                data-wmg-send-again={h.mediaId}
                disabled={sending}
                onClick={() => {
                  setSending(true);
                  void onSendAgain(h.mediaId ?? 0).finally(() => setSending(false));
                }}
                className='text-textColor underline underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor disabled:text-labelColor'
              >
                {sending ? 'sending…' : 'send again ›'}
              </button>
            </>
          )}
          {caption && (
            <span className='block text-textInactiveColor' data-wmg-model-read=''>
              model read · not sent — {caption}
            </span>
          )}
        </span>
      }
    />
  );
}
