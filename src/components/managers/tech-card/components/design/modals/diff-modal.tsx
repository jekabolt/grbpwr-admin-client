import type { GetDesignBandResponse, common_MediaFull } from 'api/proto-http/admin';
import { useMemo } from 'react';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';

import { benchDiffRows } from '../sheet-bar';

/**
 * WHAT WOULD CHANGE — the sheet bar's own sentence, with the pictures.
 *
 * IT READS THE BAR'S FUNCTION, NOT A SECOND ONE, AND THAT IS THE ENTIRE REASON THIS FILE IS SHORT.
 * The prototype's own defect list carries this exact bug (Г6/R2): the bar counted the sides and the
 * modal forgot the details, so «matches the bench» and «CUFF has moved on» could be on screen at
 * the same time, and a version nobody meant to mint got minted. `benchDiffRows` lives in
 * `sheet-bar.tsx` because that is what the bar counts with; importing it here is the whole
 * guarantee. A local copy of the comparison would drift the first week somebody adds a slot kind.
 *
 * WHY IT IS A MODAL AT ALL, when ARTIFACTS draws the same rows inline. Because the bar is on
 * STUDIO. It names the changed views in words — «the bench has moved on: FRONT, CUFF» — and until
 * now there was nowhere on that tab to SEE them; the pictures lived one tab away, next to the mint.
 * A person who has just moved a plate is standing here, not there.
 *
 * COMPARISON IS BY MEDIA ID, which is the only identity a frozen plate and a bench slot share — and
 * the more honest question anyway, since what a version froze is BYTES. The thumbnails are looked
 * up from the same two places the ids came from; nothing here fetches.
 */

export function DiffModal({
  open,
  onOpenChange,
  band,
  onMintFirst,
  disabled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  band: GetDesignBandResponse;
  /**
   * Opens the mint with `origin: 'print'`. Optional because minting needs the page's own save path
   * (`DesignSaveHostProvider`) and this dialog owns none of it — a caller that cannot mint simply
   * does not offer the door, rather than drawing one that fails.
   */
  onMintFirst?: () => void;
  disabled?: boolean;
}) {
  const rows = useMemo(() => benchDiffRows(band) ?? [], [band]);
  const version = band.latestVersion?.versionNumber ?? 0;

  /** media id → the resolved media, off the two objects the rows were computed from. */
  const mediaById = useMemo(() => {
    const map = new Map<number, common_MediaFull>();
    for (const plate of band.latestVersion?.plates ?? []) {
      const id = plate.media?.id ?? 0;
      if (id > 0 && plate.media) map.set(id, plate.media);
    }
    for (const slot of band.bench ?? []) {
      const id = slot.picture?.media?.id ?? 0;
      if (id > 0 && slot.picture?.media) map.set(id, slot.picture.media);
    }
    return map;
  }, [band]);

  const changed = rows.filter((r) => r.from !== r.to);

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={() => onOpenChange(false)}
      hideActions
      width='lg'
      title={`what would change — v${version} → the bench`}
    >
      <div className='space-y-stack'>
        <Text size='micro' variant='label' component='p'>
          {changed.length === 0
            ? `The bench matches v${version}. Printing it prints what is on screen.`
            : `${changed.length} of ${rows.length} place${rows.length === 1 ? '' : 's'} would look different on paper. Nothing here is broken — a version is born of an ACT, so v${version + 1} appears when somebody prints or releases, not when a picture changes.`}
        </Text>

        <div>
          {rows.map((row, i) => (
            // KEYED BY POSITION, NOT BY NAME. Two details may legally carry the SAME name — the
            // wire forbids addressing a detail by its name for exactly that reason — and the row
            // list is a stable, ordered derivation of the bench, so the index is its real identity.
            <div
              key={`${i}:${row.name}`}
              className='flex items-center gap-2 border-b border-hairline py-1'
            >
              <Text
                size='micro'
                variant='uppercase'
                tracking='label'
                component='span'
                className='w-24 shrink-0 truncate'
              >
                {row.name}
              </Text>
              {row.from === row.to ? (
                <Text size='micro' variant='label' component='span'>
                  unchanged
                </Text>
              ) : (
                <>
                  <Thumb media={mediaById.get(row.from)} label={`v${version}`} />
                  <Text size='micro' component='span' aria-hidden>
                    →
                  </Text>
                  <Thumb media={mediaById.get(row.to)} label='the bench' />
                  <Text
                    size='nano'
                    variant='uppercase'
                    tracking='label'
                    component='span'
                    className='ml-auto shrink-0'
                  >
                    {row.from === 0 ? 'added' : row.to === 0 ? 'emptied' : 'replaced'}
                  </Text>
                </>
              )}
            </div>
          ))}
          {rows.length === 0 && (
            <Text size='micro' variant='label' component='p'>
              nothing to compare — this card has no minted version yet
            </Text>
          )}
        </div>

        <div className='flex flex-wrap items-center gap-1.5'>
          <Button variant='secondary' size='sm' onClick={() => onOpenChange(false)}>
            close
          </Button>
          {onMintFirst && changed.length > 0 && (
            <Button
              variant='main'
              size='sm'
              disabled={disabled}
              onClick={() => {
                onOpenChange(false);
                onMintFirst();
              }}
            >
              mint v{version + 1} ▸
            </Button>
          )}
        </div>
      </div>
    </ConfirmationModal>
  );
}

/** One side of a row. Empty is a labelled hole, not a blank — «emptied» is a real answer. */
function Thumb({ media, label }: { media?: common_MediaFull; label: string }) {
  const url = media?.media?.thumbnail?.mediaUrl || media?.media?.compressed?.mediaUrl || '';
  return (
    <span
      // мат под снимком белый (R-12); кадр здесь фиксированный, поэтому летербокс почти всегда
      className='relative block h-14 w-11 shrink-0 border border-borderColor bg-bgColor'
      title={label}
    >
      {url ? (
        <img src={url} alt={label} loading='lazy' className='h-full w-full object-contain' />
      ) : (
        <span className='absolute inset-0 flex items-center justify-center'>
          <Text size='nano' variant='label' component='span'>
            —
          </Text>
        </span>
      )}
    </span>
  );
}
