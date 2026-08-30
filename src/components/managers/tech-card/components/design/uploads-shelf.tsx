import type {
  DesignUploadItem,
  GetDesignBandResponse,
  common_MediaFull,
} from 'api/proto-http/admin';
import { useMediaIntake } from 'components/managers/media/utils/useMediaIntake';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Placeholder } from 'ui/components/placeholder';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

import { FeedRows, PickModeNote, type FeedRowModel } from './band-feed';
import { serverSpeaksDesign } from './capability';
import { batchCaption, shelfBatchOrdinals } from './handles';
import { newClientRequestId, useDesignWrites } from './use-design-band';
import { hiddenCountOfBatch } from './visibility';

/**
 * THE UPLOADS SHELF — what a person brought by hand, filed as batches.
 *
 * ONE GESTURE IS ONE BATCH, AND THE BATCH IS THE PROVENANCE CARRIER. Files that arrive together are
 * presumed to draw one garment; that presumption is what the mixed-composition check reads later,
 * and it only exists because the gesture was kept whole. Splitting one drop into four batches would
 * destroy a fact nobody can reconstruct afterwards.
 *
 * TWO STOREYS, AND THEY ARE DIFFERENT STOREYS. The BYTES go up through the repository's ordinary
 * media intake (`useMediaIntake` → crop → `UploadContentImage`), exactly as every other picture in
 * this admin does — there is no second uploader here and no second bucket. Only once media rows
 * exist does `RegisterDesignUpload` FILE them into the band: one batch row, its pictures under it.
 * The contract says as much in as many words («the bytes themselves went up through
 * UploadContentImage first»), and the split is why a failed registration loses no bytes.
 *
 * `client_request_id` IS MINTED ONCE PER INTENT AND SURVIVES THE RETRY. It is the server's
 * idempotency key: a repeat with the same value returns the SAME batch instead of filing a phantom
 * second one with the same files in it. So it is minted at the moment the media settle — one
 * gesture, one id — and held until that registration lands. Minting it inside the mutation would
 * defeat the whole mechanism: a retry would carry a fresh id and the server would honestly file a
 * second batch.
 */

type PendingIntent = {
  clientRequestId: string;
  items: DesignUploadItem[];
};

export function UploadsShelf({
  techCardId,
  band,
  disabled,
}: {
  techCardId: number;
  band: GetDesignBandResponse;
  disabled?: boolean;
}): JSX.Element {
  const speaks = serverSpeaksDesign();
  const { registerUpload } = useDesignWrites(techCardId);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * The intent that has not landed yet. Held rather than dropped so an explicit retry can carry the
   * SAME `client_request_id` — that is the whole point of the key.
   */
  const [pending, setPending] = useState<PendingIntent | null>(null);

  const writesOff = !!disabled || !speaks;

  const fileIntent = useCallback(
    (intent: PendingIntent) => {
      setPending(intent);
      registerUpload.mutate(intent, { onSuccess: () => setPending(null) });
    },
    [registerUpload],
  );

  /**
   * The media are up. One call per settled batch (`MediaIntakeDialog` fires `onDone` once nothing
   * is live), so one call is one gesture is one `client_request_id`.
   *
   * `ghost_view` is left EMPTY on every item. It is a GUESS about which view a file depicts, and
   * this client has nothing to guess from: `common_MediaFull` carries urls and dimensions, not the
   * name the file had on the operator's disk. An invented guess would be printed on the tile as
   * «probably BACK» and confirmed by a tired human, which is worse than no guess at all.
   */
  const onMedia = useCallback(
    (media: common_MediaFull[]) => {
      if (writesOff) return;
      const items: DesignUploadItem[] = media
        .filter((m) => (m.id ?? 0) > 0)
        // `kind` is stated, not left empty: RegisterDesignUpload used to hardcode 'flat' on the
        // server, which is exactly why renders and 3D could not be uploaded by hand at all. Now
        // that the kind travels on the wire, THIS shelf is still the flat shelf — the render and
        // 3D screens have intakes of their own and name their own kind.
        .map((m) => ({ mediaId: m.id, ghostView: '', kind: 'flat' }));
      if (!items.length) return;
      fileIntent({ clientRequestId: newClientRequestId(), items });
    },
    [fileIntent, writesOff],
  );

  const intake = useMediaIntake({
    enabled: !writesOff,
    accept: 'image',
    purpose: 'design pictures',
    onMedia,
  });

  const ordinals = useMemo(() => shelfBatchOrdinals(band.batches ?? []), [band.batches]);

  const rows = useMemo<FeedRowModel[]>(
    () =>
      (band.batches ?? [])
        .map((batch) => ({
          key: `batch:${batch.id}`,
          createdAt: batch.createdAt ?? '',
          meta: (
            <Text
              size='micro'
              variant='label'
              component='span'
              className='uppercase tracking-label'
            >
              {(() => {
                const ordinal = ordinals.get(batch.id ?? 0);
                return ordinal ? `upload ${ordinal} · ` : '';
              })()}
              {batchCaption(batch)}
            </Text>
          ),
          pictures: batch.pictures ?? [],
          hiddenCount: hiddenCountOfBatch(band, batch.id ?? 0),
          shelfOrdinal: ordinals.get(batch.id ?? 0),
        }))
        // Newest first, and the order is the shelf ordinal reversed rather than a second sort:
        // `shelfBatchOrdinals` already made the clock total by falling back to the id.
        .sort((a, b) => (b.shelfOrdinal ?? 0) - (a.shelfOrdinal ?? 0)),
    [band, ordinals],
  );

  const batchCount = rows.length;
  const fileCount = (band.batches ?? []).reduce((n, b) => n + (b.filesCount ?? 0), 0);

  const browse = () => fileInputRef.current?.click();

  const door = (
    <div className='flex flex-wrap items-center gap-2'>
      <Button variant='secondary' size='sm' onClick={browse} disabled={writesOff || intake.busy}>
        + add files
      </Button>
      <Text size='micro' variant='label' component='span'>
        ⌘V · drag files here · click to browse — one gesture is ONE batch, and the files of a batch
        are presumed to draw one garment
      </Text>
    </div>
  );

  return (
    <Section
      id='design-uploads'
      title='uploads'
      question='— brought by hand; the same pictures the slots read'
      action={
        <Text size='micro' variant='label' component='span'>
          {batchCount} batch{batchCount === 1 ? '' : 'es'} · {fileCount} files
        </Text>
      }
    >
      {/* The handlers live on a bare div, not on the block: `Section` IS the white block, and a
          second bordered surface inside it would be a box in a box. */}
      <div {...intake.regionHandlers} className='space-y-stack'>
        <PickModeNote band={band} />

        {!speaks && (
          <CalloutBox tone='note'>
            this server does not speak the design band yet — pictures cannot be brought in here.
          </CalloutBox>
        )}

        {registerUpload.isError && pending && (
          <CalloutBox tone='error'>
            <b>the files went up but were not filed.</b> The bytes are safe in the media library —
            press try again and they are filed under the same batch, never a second one.{' '}
            <button
              type='button'
              onClick={() => fileIntent(pending)}
              className='cursor-pointer underline'
            >
              try again
            </button>
          </CalloutBox>
        )}

        {registerUpload.isPending && (
          <Text size='micro' variant='label'>
            filing {pending?.items.length ?? 0} file
            {(pending?.items.length ?? 0) === 1 ? '' : 's'} into a batch…
          </Text>
        )}

        {rows.length ? (
          <>
            {door}
            <FeedRows techCardId={techCardId} band={band} rows={rows} disabled={disabled} />
          </>
        ) : (
          <>
            <Placeholder
              dashed
              className={intake.dragging ? 'h-28 border-textColor text-textColor' : 'h-28'}
              label={
                writesOff ? 'uploads are closed on this card' : '+ add files · ⌘V · drag · browse'
              }
            />
            {door}
          </>
        )}

        {/* The OS file dialog. `useMediaIntake` owns ⌘V and the drop; the browse gesture has to be
            handed to it explicitly, and the input is reset so picking the same file twice works. */}
        <input
          ref={fileInputRef}
          type='file'
          accept='image/*'
          multiple
          hidden
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = '';
            if (files.length) intake.openFiles(files);
          }}
        />
      </div>
      {intake.dialog}
    </Section>
  );
}
