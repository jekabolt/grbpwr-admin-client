import type { GetDesignBandResponse, common_DesignPicture } from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { MediaViewer, mediaFullToViewerItem, useMediaViewer } from 'ui/components/media-viewer';
import { Section } from 'ui/components/section';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';

import { newClientRequestId, useDesignWrites } from '../use-design-band';
import { SILHOUETTE_VIEWS, viewLabel } from '../views';
import { benchSides, feedIsTruncated, pictureThumb, stripProvenance, unmarkedFlats } from './model';
import { CELL_WIDTH, Strip, StripCell, StripDivider } from './strip-cell';

/**
 * INPUT — FLATS OF THIS CARD. What a fabric render is actually made from.
 *
 * THE LINE DOWN THE MIDDLE IS THE WHOLE ORGAN. Left of it: the drawings the render reads, one per
 * view, each with its provenance — which is the bench, seen from the render's side rather than the
 * sheet's. Right of it: every other flat this card holds, generated or brought by hand, each with a
 * `mark ▸` that puts it in a slot. The two halves are the same pictures under two different
 * questions, and the prototype's own footnote says the thing that makes the screen safe to use:
 * marking one DISPLACES the picture that held the slot, and nothing is deleted.
 *
 * THE TWO HALVES ARE GATHERED FROM DIFFERENT PLACES, and they have to be. A bench slot carries its
 * RESOLVED plate however old the picture is, so the left side is always complete. The right side
 * can only list what the band shipped — one page of the feed — so when there is more, the strip
 * says so rather than letting a technologist conclude that a drawing he uploaded last week has
 * disappeared.
 *
 * A HAND FILE WAS ALWAYS LEGAL INPUT HERE. Nothing on this card requires a run: an uploaded flat
 * sits on the right of the line exactly like a generated one, marks into a slot exactly like one,
 * and feeds the render exactly like one. That is why the classification refuses a picture only on
 * positive evidence that it is an OUTPUT of the machine (see `isFlatCandidate`), and admits
 * everything else.
 */

/** Radix forbids an empty item value, and an empty one reaching `Select.Root` shows a placeholder
 *  where a label should be — so «mark ▸» is a sentinel, never `''`. */
const MARK_PROMPT = '__mark__';

export function RenderInputStrip({
  band,
  techCardId,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
}): JSX.Element {
  const writes = useDesignWrites(techCardId);
  const viewer = useMediaViewer();

  const sides = useMemo(() => benchSides(band), [band]);
  const others = useMemo(() => unmarkedFlats(band), [band]);
  const marked = sides.filter((side) => !!side.picture);

  /** Which cell a write is in flight for — a shared `isPending` would say «saving» on all of them. */
  const [busy, setBusy] = useState<string | null>(null);

  /** Everything with an address, in the order the strip draws it — the viewer pages the same list. */
  const viewerPictures: common_DesignPicture[] = [
    ...marked.map((side) => side.picture as common_DesignPicture),
    ...others,
  ].filter((picture) => !!picture.media);
  const viewerItems = viewerPictures.map((picture) => mediaFullToViewerItem(picture.media!));

  const mark = (picture: common_DesignPicture, view: string) => {
    const side = sides.find((s) => s.view === view);
    const pictureId = picture.id ?? 0;
    if (!side || pictureId <= 0) return;
    setBusy(`p${pictureId}`);
    writes.setBenchSlot.mutate(
      { slot: { viewKey: side.view }, pictureId, expectedSlotRev: side.slotRev },
      { onSettled: () => setBusy(null) },
    );
  };

  const unmark = (view: string, slotRev: number) => {
    setBusy(`v${view}`);
    writes.setBenchSlot.mutate(
      // `picture_id = 0` is UNMARK — empty the slot without deleting it. A different act from
      // deleting a slot, and it has to stay different.
      { slot: { viewKey: view }, pictureId: 0, expectedSlotRev: slotRev },
      { onSettled: () => setBusy(null) },
    );
  };

  return (
    <Section
      title='input — flats of this card'
      question='— the drawings the render is made from: generated, uploaded or drawn'
      action={
        <Text size='micro' variant='label' component='span' className='uppercase'>
          {marked.length} marked · {others.length} not marked
        </Text>
      }
    >
      <Strip>
        {marked.map((side) => {
          const picture = side.picture!;
          const index = viewerPictures.indexOf(picture);
          return (
            <StripCell
              key={`slot-${side.view}`}
              emphasis
              src={pictureThumb(picture)}
              alt={viewLabel(side.view)}
              badge={viewLabel(side.view)}
              corner={
                index >= 0 ? (
                  <button
                    type='button'
                    onClick={() => viewer.openAt(index)}
                    className='border border-borderColor bg-bgColor px-1 py-px uppercase hover:bg-textColor hover:text-bgColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                  >
                    <Text size='nano' variant='uppercase' component='span'>
                      zoom
                    </Text>
                  </button>
                ) : undefined
              }
              lines={[`in slot · ${viewLabel(side.view)}`, stripProvenance(band, picture)]}
              action={
                disabled ? undefined : (
                  <Button
                    variant='secondary'
                    size='xs'
                    loading={busy === `v${side.view}`}
                    onClick={() => unmark(side.view, side.slotRev)}
                  >
                    unmark
                  </Button>
                )
              }
            />
          );
        })}

        {/* The line. It stands even when one side is empty: it separates two QUESTIONS, not two
            non-empty lists, and a divider that comes and goes stops reading as a boundary. */}
        <StripDivider />

        {/* THE HAND DOOR, equal in weight to the machine. A flat brought here lands on the upload
            shelf UNMARKED — `RegisterDesignUpload` with no target — because the human has not yet
            said which view it is, and a ghost guess is not an answer. It appears on the right of
            the line a moment later, with the same `mark ▸` as everything else. */}
        {!disabled && (
          <div className={`flex flex-col gap-1 ${CELL_WIDTH}`}>
            <MediaSlot
              aspectRatio={['Custom']}
              frameAspect='132/148'
              label='+ flat'
              hint={null}
              purpose='design · flat for the render'
              showVideos={false}
              editMode
              onSelect={(media) => {
                const items = media
                  .map((m) => m.id ?? 0)
                  .filter((id) => id > 0)
                  .map((mediaId) => ({ mediaId, ghostView: '' }));
                if (!items.length) return;
                writes.registerUpload.mutate({
                  // Minted once per human intent and NOT inside the mutation: a retry carrying a
                  // fresh id would make the server honestly file a second batch.
                  clientRequestId: newClientRequestId(),
                  items,
                });
              }}
              allowMultiple
            />
            <Text size='nano' variant='label' component='span'>
              bring your own
            </Text>
            <Text size='nano' variant='label' component='span'>
              ⌘V · drop · browse
            </Text>
          </div>
        )}

        {others.map((picture) => {
          const index = viewerPictures.indexOf(picture);
          const provenance = stripProvenance(band, picture);
          return (
            <StripCell
              key={`pic-${picture.id}`}
              src={pictureThumb(picture)}
              alt={provenance}
              corner={
                index >= 0 ? (
                  <button
                    type='button'
                    onClick={() => viewer.openAt(index)}
                    className='border border-borderColor bg-bgColor px-1 py-px uppercase hover:bg-textColor hover:text-bgColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
                  >
                    <Text size='nano' variant='uppercase' component='span'>
                      zoom
                    </Text>
                  </button>
                ) : undefined
              }
              lines={['not marked', provenance]}
              action={
                disabled ? undefined : (
                  <SelectComponent
                    name={`mark-${picture.id}`}
                    value={MARK_PROMPT}
                    placeholder='mark ▸'
                    disabled={busy === `p${picture.id}`}
                    items={[
                      { value: MARK_PROMPT, label: 'mark ▸' },
                      ...SILHOUETTE_VIEWS.map((view) => ({
                        value: view,
                        label: viewLabel(view),
                      })),
                    ]}
                    onValueChange={(value: string) => {
                      if (!value || value === MARK_PROMPT) return;
                      mark(picture, value);
                    }}
                    fullWidth
                  />
                )
              }
            />
          );
        })}

        {!marked.length && !others.length && (
          <Text size='micro' variant='inactive' component='span' className='py-6'>
            no flats on this card yet — bring one in, or generate one on FLAT.
          </Text>
        )}
      </Strip>

      <Text size='micro' variant='label' component='p' className='normal-case'>
        Left of the line — what the render actually reads: one drawing per view, with its
        provenance. Right of the line — every other flat of this card; a hand file was always legal
        input here. Marking one displaces the picture that held the slot; nothing is deleted.
      </Text>

      {/* THE PAGE IS ADMITTED, NOT HIDDEN. The band ships one page of the feed, so a card with a
          long history has flats this strip cannot see. An operator who is not told that concludes
          his file was lost. */}
      {feedIsTruncated(band) && (
        <Text size='nano' variant='label' component='p' className='normal-case'>
          This card has more history than one page. The right of the line lists the flats of the
          newest page; older ones are still on the card and still in their slots.
        </Text>
      )}

      <MediaViewer
        items={viewerItems}
        index={viewer.index}
        open={viewer.open}
        onOpenChange={viewer.onOpenChange}
        onIndexChange={viewer.onIndexChange}
      />
    </Section>
  );
}
