import { common_MediaFull } from 'api/proto-http/admin';
import { ViewerAction, sizeLine } from 'components/shared/media-viewer/media-viewer';
import { useEffect, useState } from 'react';
import { Button, Drawer } from 'ui';

const HIDE_AFTER_MS = 6000;

function line(m?: common_MediaFull): string {
  const size = sizeLine(m?.media?.fullSize?.width, m?.media?.fullSize?.height);
  return [m?.id, size].filter(Boolean).join(' · ');
}

function thumbOf(m?: common_MediaFull): string | undefined {
  return m?.media?.thumbnail?.mediaUrl || m?.media?.compressed?.mediaUrl;
}

/**
 * Frames 4 / 4a: after a crop or expand the viewer stays on the original and this one line says
 * the copy exists — `compare` opens a sheet with both, `open` jumps to the copy. It leaves by
 * itself after a few seconds (the thin bar is its timer), but not while the sheet is open.
 */
export function MediaSavedBar({
  original,
  saved,
  onOpen,
  onDismiss,
}: {
  original?: common_MediaFull;
  saved: common_MediaFull;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const [comparing, setComparing] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (comparing) return;
    const start = requestAnimationFrame(() => setRunning(true));
    const t = setTimeout(onDismiss, HIDE_AFTER_MS);
    return () => {
      cancelAnimationFrame(start);
      clearTimeout(t);
      setRunning(false);
    };
  }, [saved.id, comparing, onDismiss]);

  return (
    <div className='relative mx-4 mb-1 flex items-center gap-2 border border-bgColor/40 px-2 py-1 text-micro uppercase tracking-label'>
      <span aria-hidden>✓</span>
      <span className='min-w-0 flex-1 truncate tabular-nums'>{saved.id} saved</span>
      <ViewerAction className='max-lg:min-h-11' onClick={() => setComparing(true)}>
        compare
      </ViewerAction>
      <ViewerAction selected className='max-lg:min-h-11' onClick={onOpen}>
        open
      </ViewerAction>
      <span
        aria-hidden
        className='absolute bottom-0 left-0 h-px bg-bgColor/70'
        style={{
          width: running ? '0%' : '100%',
          transition: running ? `width ${HIDE_AFTER_MS}ms linear` : 'none',
        }}
      />

      <Drawer
        side='bottom'
        open={comparing}
        onOpenChange={setComparing}
        title='compare'
        footer={
          <>
            <Button variant='secondary' size='lg' onClick={() => setComparing(false)}>
              stay on {original?.id}
            </Button>
            <Button
              variant='main'
              size='lg'
              onClick={() => {
                setComparing(false);
                onOpen();
              }}
            >
              open {saved.id}
            </Button>
          </>
        }
      >
        <div className='flex flex-col gap-2 text-micro tabular-nums'>
          {[original, saved].map((m, i) => (
            <div key={i} className='flex items-center gap-3'>
              <div className='flex size-20 shrink-0 items-center justify-center bg-pageBg'>
                {thumbOf(m) && (
                  <img src={thumbOf(m)} alt='' className='max-h-full max-w-full object-contain' />
                )}
              </div>
              <span>{line(m)}</span>
              {i === 0 && (
                <span aria-hidden className='ml-auto text-labelColor'>
                  →
                </span>
              )}
            </div>
          ))}
        </div>
      </Drawer>
    </div>
  );
}
