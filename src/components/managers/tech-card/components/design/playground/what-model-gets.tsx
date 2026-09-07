import type { JSX } from 'react';
import Text from 'ui/components/text';

import { InventoryLine, NotSent, WmgGroup, WmgShell, type NotSentItem } from '../core';
import { mediaThumb } from '../render/model';
import { AREA_LETTERS, areaLetter, refsCount, type PlaygroundState, type Preset } from './model';

/**
 * ═══ WHAT THE MODEL GETS — PLAYGROUND ════════════════════════════════════════════════════════
 *
 * THE ONE SURFACE ON WHICH IT IS VISIBLE WHAT A PRESS OF GENERATE BUYS. It reads the DRAFT, in the
 * order the wire will carry it (`wireParams` numbers `items[]` exactly as this list does), because
 * a second reconstruction of the request is a second statement about one paid run — and the two
 * disagree silently. That defect cost a week on a neighbouring screen: the caption said «the plates
 * do not travel» while the body said «send them all».
 *
 * ⚠ «HOW AREAS TRAVEL» IS A GROUP OF ITS OWN, and it is the reason this modal matters here more
 * than on the other screens. An outline is not a mask: the image route has no mask field at all, so
 * what an area BECOMES is a crop, an outline drawn on a copy, and a sentence. A person who is not
 * told this reads a result that changed the neighbouring sleeve as a broken model.
 *
 * NOT SENT is the half that is easiest to be wrong about. The playground reads NOTHING of the card:
 * `designKindReadsTheCard` is false for both kinds, so the colourway, the colour recipe, the bench
 * and the garment description stay where they are — and this list says so by name.
 */
export function WhatModelGetsPlaygroundModal({
  open,
  onOpenChange,
  state,
  preset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: PlaygroundState;
  preset: Preset | null;
}): JSX.Element {
  const items = state.items;
  const areas = items.flatMap((item, i) =>
    item.regions.map((region, r) => ({
      key: `${i}-${r}`,
      letter: areaLetter(r),
      image: i + 1,
      text: region.text.trim(),
    })),
  );
  const cut = preset?.kind === 'cutout';
  const words = state.ask.trim();

  const notSent: NotSentItem[] = [
    { label: 'colourway', reason: 'a playground run binds no colourway — it files under none' },
    {
      label: 'colour recipe',
      reason: 'the recipe belongs to FABRIC RENDER; nothing reads it here',
    },
    {
      label: 'the bench',
      reason: 'no plate of the bench travels — only the pictures on the table',
    },
    {
      label: 'garment description',
      reason: 'this route is not told what the garment is; the pictures are the whole subject',
    },
    {
      label: 'references of the card',
      reason: 'the card’s reference images ride with the flat, never with this run',
    },
  ];

  return (
    <WmgShell
      open={open}
      onOpenChange={onOpenChange}
      kindWord={cut ? 'cut out the background' : 'playground'}
      intro={
        <>
          <b>{refsCount(state)} pictures travel, in this order.</b> Everything below is the request
          as it leaves — the pictures a person laid on the table, the areas marked on them and the
          words typed above. Nothing of the card is added to it.
        </>
      }
    >
      <WmgGroup
        label='pictures'
        aside={`${items.length} in the order they are sent`}
        flush
        data-wmg-images={items.length}
        note='«image 1» is the first cell of the strip — the same number the ask chips and the prompt use.'
      >
        {items.length === 0 ? (
          <Text size='micro' variant='label' component='p' className='normal-case'>
            nothing is on the table yet
          </Text>
        ) : (
          items.map((item, i) => (
            <InventoryLine
              key={item.media.id ?? i}
              data-wmg-image={i + 1}
              number={i + 1}
              thumb={mediaThumb(item.media)}
              name={`image ${i + 1}`}
              origin='linked'
              text={
                <span className='flex flex-wrap items-baseline gap-x-2'>
                  {item.role ? <b>{item.role}</b> : <span>a picture</span>}
                  <span className='text-labelColor'>
                    media {item.media.id ?? 0}
                    {item.regions.length
                      ? ` · ${item.regions.length} area${item.regions.length === 1 ? '' : 's'} (${item.regions
                          .map((_, r) => AREA_LETTERS[r] ?? String(r + 1))
                          .join(' · ')})`
                      : ' · no area marked'}
                  </span>
                </span>
              }
            />
          ))
        )}
      </WmgGroup>

      <WmgGroup
        label='areas'
        aside={`${areas.length} marked`}
        data-wmg-areas={areas.length}
        note='an area is a polygon in fractions of its picture; its letter is drawn on this screen only.'
      >
        {areas.length === 0 ? (
          <Text size='micro' variant='label' component='p' className='normal-case'>
            no area is marked — the words are about the whole picture
          </Text>
        ) : (
          areas.map((area) => (
            <InventoryLine
              key={area.key}
              data-wmg-area={`${area.letter}${area.image}`}
              name={`area ${area.letter}`}
              text={
                <span className='flex flex-wrap items-baseline gap-x-2'>
                  <span>of image {area.image}</span>
                  <span className='text-labelColor'>{area.text || 'no words about it'}</span>
                </span>
              }
            />
          ))
        )}
      </WmgGroup>

      <WmgGroup label='how areas travel' data-wmg-how-areas=''>
        <Text size='micro' component='p' className='normal-case'>
          each area is sent as a <b>crop</b> of its picture and as an <b>outline</b> drawn on a copy
          of that picture, and it is described in <b>words</b>. <b>It is not a mask</b>: the image
          route takes none, so an area is a hint about WHERE, not a boundary the model is held to.
          The outlines are markers — the server tells the model not to draw them.
        </Text>
      </WmgGroup>

      <WmgGroup
        label='preset'
        aside={preset?.label ?? 'none chosen'}
        data-wmg-preset={preset?.key ?? ''}
      >
        <Text size='micro' component='p' className='normal-case'>
          {preset?.craft ||
            'pick a preset above — it decides which route the run takes and what the server tells the model to do.'}
        </Text>
      </WmgGroup>

      <WmgGroup
        label='words'
        aside={cut ? 'this preset takes none' : `${words.length} characters`}
        data-wmg-words={words.length}
      >
        {cut ? (
          <Text size='micro' variant='label' component='p' className='normal-case'>
            a cut-out carries no words at all — the server refuses one that does.
          </Text>
        ) : words ? (
          <pre className='max-h-64 overflow-y-auto whitespace-pre-wrap break-words bg-bgSecondary p-2 text-micro'>
            {words}
          </pre>
        ) : (
          <Text size='micro' variant='label' component='p' className='normal-case'>
            nothing typed — the preset’s own sentence is all the model is told.
          </Text>
        )}
      </WmgGroup>

      <NotSent items={notSent} />
    </WmgShell>
  );
}
