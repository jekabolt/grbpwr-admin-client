import { common_MediaFull } from 'api/proto-http/admin';
import { isVideo } from 'lib/features/filterContentType';
import { useSnackBarStore } from 'lib/stores/store';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Drawer, GroupLabel, Media, Text } from 'ui';
import {
  MediaUsageMap,
  mediaUsageRefs,
  usageRefHref,
  usageRefName,
  usageRefSlot,
} from '../utils/media-usage';
import { BulkDeleteResult, useDeleteManyMedia } from '../utils/useMediaQuery';

/**
 * What a bulk delete may touch. ONLY files KNOWN to be free go out: a file in use stays, and so
 * does one whose usage was never looked up — "not checked" is not "free". The server refuses
 * in-use media anyway (FailedPrecondition); the client never asks it to.
 */
export function splitForDelete(selected: common_MediaFull[], usage: MediaUsageMap) {
  const free: common_MediaFull[] = [];
  const kept: common_MediaFull[] = [];
  for (const m of selected) {
    if (m.id != null && mediaUsageRefs(usage, m.id)?.length === 0) free.push(m);
    else kept.push(m);
  }
  return { free, kept };
}

/** Destructive red action. `Button` has no danger tone; the default variant carries no colour. */
export const DANGER_BUTTON =
  'min-h-11 border border-error bg-error text-bgColor disabled:border-borderColor disabled:bg-bgColor disabled:text-borderColor disabled:opacity-100';

/** One in-use (or unchecked) file and the places that hold it, each a link where it can be one. */
export function KeptRow({ media, usage }: { media: common_MediaFull; usage: MediaUsageMap }) {
  const refs = mediaUsageRefs(usage, media.id);
  return (
    <li className='border-t border-hairline px-2 py-1.5'>
      <Text size='micro' component='span' className='block tabular-nums'>
        {media.id}
      </Text>
      {refs === undefined ? (
        <Text size='micro' variant='label' component='span'>
          not checked
        </Text>
      ) : (
        <ul>
          {refs.map((ref, i) => {
            const href = usageRefHref(ref);
            const line = `${usageRefName(ref)} · ${usageRefSlot(ref)}`;
            return (
              <li key={`${ref.kind}-${ref.entityId}-${ref.slot}-${i}`}>
                {href ? (
                  <Link to={href} className='text-micro text-labelColor underline'>
                    {line}
                  </Link>
                ) : (
                  <Text size='micro' variant='label' component='span'>
                    {line}
                  </Text>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/**
 * Bulk delete confirm as a bottom sheet (phone). Names what goes and what stays before the tap,
 * and the per-id refusals after it.
 */
export function MediaDeleteSheet({
  open,
  onOpenChange,
  selected,
  usage,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selected: common_MediaFull[];
  usage: MediaUsageMap;
  /** Ids the server actually removed — the caller drops them from the selection. */
  onDeleted: (ids: number[]) => void;
}) {
  const deleteMany = useDeleteManyMedia();
  const { showMessage } = useSnackBarStore();
  const [result, setResult] = useState<BulkDeleteResult | undefined>(undefined);
  const { free, kept } = splitForDelete(selected, usage);

  const close = (next: boolean) => {
    if (!next) setResult(undefined);
    onOpenChange(next);
  };

  const handleDelete = () => {
    const ids = free.map((m) => m.id).filter((id): id is number => id != null);
    if (!ids.length) return;
    deleteMany.mutate(ids, {
      onSuccess: (res) => {
        onDeleted(res.deleted);
        if (res.failed.length) {
          setResult(res);
          return;
        }
        showMessage(`deleted ${res.deleted.length}`, 'success');
        close(false);
      },
    });
  };

  if (result) {
    return (
      <Drawer
        side='bottom'
        open={open}
        onOpenChange={close}
        title={`deleted ${result.deleted.length} of ${result.deleted.length + result.failed.length}`}
        footer={
          <Button variant='main' size='sm' className='min-h-11 flex-1' onClick={() => close(false)}>
            got it
          </Button>
        }
      >
        <div className='border border-error'>
          <div className='flex justify-between px-2 py-1.5 text-micro uppercase tracking-label text-error'>
            <span>in use · kept</span>
            <span className='tabular-nums'>{result.failed.length}</span>
          </div>
          <ul>
            {result.failed.map((f) => (
              <li key={f.id} className='border-t border-hairline px-2 py-1.5'>
                <Text size='micro' component='span' className='block tabular-nums'>
                  {f.id}
                </Text>
                <Text size='micro' variant='label' component='span'>
                  {f.reason}
                </Text>
              </li>
            ))}
          </ul>
        </div>
      </Drawer>
    );
  }

  return (
    <Drawer
      side='bottom'
      open={open}
      onOpenChange={close}
      title={`delete ${free.length} of ${selected.length}`}
      footer={
        <>
          <Button
            variant='secondary'
            size='sm'
            className='min-h-11 flex-1'
            onClick={() => close(false)}
          >
            cancel
          </Button>
          <Button
            size='sm'
            className={`flex-1 ${DANGER_BUTTON}`}
            disabled={!free.length || deleteMany.isPending}
            onClick={handleDelete}
          >
            {deleteMany.isPending ? 'deleting…' : free.length ? `delete ${free.length}` : '0 free'}
          </Button>
        </>
      }
    >
      <div className='flex flex-col gap-2.5'>
        {free.length > 0 && (
          <div>
            <GroupLabel flush>free · deleted</GroupLabel>
            <div className='flex flex-wrap gap-1.5'>
              {free.map((m) => (
                <div key={m.id} className='w-14'>
                  <div className='border border-borderColor bg-pageBg'>
                    <Media
                      src={m.media?.thumbnail?.mediaUrl || ''}
                      type={isVideo(m.media?.thumbnail?.mediaUrl) ? 'video' : 'image'}
                      alt={String(m.id)}
                      aspectRatio='1/1'
                      fit='contain'
                      controls={false}
                      preload='metadata'
                    />
                  </div>
                  <Text size='nano' variant='label' component='span' className='tabular-nums'>
                    {m.id}
                  </Text>
                </div>
              ))}
            </div>
          </div>
        )}
        {kept.length > 0 && (
          <div className='border border-error'>
            <div className='flex justify-between px-2 py-1.5 text-micro uppercase tracking-label text-error'>
              <span>in use · kept</span>
              <span className='tabular-nums'>{kept.length}</span>
            </div>
            <ul>
              {kept.map((m) => (
                <KeptRow key={m.id} media={m} usage={usage} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </Drawer>
  );
}
