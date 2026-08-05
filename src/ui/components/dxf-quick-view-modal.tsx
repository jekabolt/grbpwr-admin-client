import { fetchMediaBlob } from 'lib/features/media-blob';
import { useEffect, useRef, useState } from 'react';
import { formatBytes } from 'utils/pattern';
import { Button } from './button';
import { ConfirmationModal } from './confirmation-modal';
import Text from './text';

// Quick view for a DXF выкройка (§3). The browser has no native DXF renderer (unlike the
// PDF <object>/<iframe> path), so this renders via the `dxf-viewer` WebGL package —
// dynamically imported inside the modal so three.js and the parser stay out of the main
// bundle until someone actually opens a DXF. Parse/render failures degrade to a
// human-readable message + download link; the file itself is always reachable by url.
export function DxfQuickViewModal({
  url,
  title,
  sizeBytes,
  onClose,
}: {
  url: string | null; // null = closed
  title?: string;
  sizeBytes?: number;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    if (!url) return;
    let disposed = false;
    // The instance type lives inside the dynamic chunk; the cleanup needs Destroy() and,
    // when the build exposes it, the renderer for an explicit context loss.
    let viewer: {
      Destroy: () => void;
      GetRenderer?: () => { forceContextLoss?: () => void } | null;
    } | null = null;
    setState('loading');

    let blobUrl: string | null = null;

    (async () => {
      try {
        // dxf-viewer fetches its url itself, and the Spaces CDN serves patterns without
        // CORS headers — fetch the bytes here (shared direct→proxy helper) and hand the
        // viewer a same-origin blob url.
        const [{ DxfViewer }, three, blob] = await Promise.all([
          import('dxf-viewer'),
          import('three'),
          fetchMediaBlob(url),
        ]);
        blobUrl = URL.createObjectURL(blob);
        const container = containerRef.current;
        if (!container || disposed) {
          // Cleanup already ran (or never will for this container) — it saw blobUrl=null,
          // so revoking here is the only thing keeping a 40 MB blob from living forever.
          URL.revokeObjectURL(blobUrl);
          blobUrl = null;
          return;
        }
        // Match the app surface: the canvas clears to the page's own bgColor token, and
        // colorCorrection flips white-on-black CAD linework to stay visible on it.
        const bg =
          getComputedStyle(document.documentElement).getPropertyValue('--color-bgColor').trim() ||
          '#fff';
        const v = new DxfViewer(container, {
          autoResize: true,
          clearColor: new three.Color(bg),
          colorCorrection: true,
        });
        viewer = v;
        await v.Load({ url: blobUrl });
        if (!disposed) setState('ready');
      } catch (e) {
        console.error('DXF quick view failed', e);
        if (!disposed) setState('error');
      }
    })();

    return () => {
      disposed = true;
      // Free the parsed scene AND the WebGL context: renderer.dispose() alone does not
      // lose the context (three keeps it until GC), and modals reopen often enough to trip
      // the browser's active-context cap.
      try {
        viewer?.GetRenderer?.()?.forceContextLoss?.();
        viewer?.Destroy();
      } catch (e) {
        console.error('DxfViewer.Destroy failed', e);
      }
      viewer = null;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [url]);

  return (
    <ConfirmationModal
      open={url != null}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      onConfirm={onClose}
      title={title || 'выкройка (DXF)'}
      width='lg'
      hideActions
    >
      <div className='space-y-2'>
        <div className='flex flex-wrap items-center gap-2'>
          <Text size='micro' variant='label' component='span' className='min-w-0 flex-1 truncate'>
            {title}
            {sizeBytes ? ` · ${formatBytes(sizeBytes)}` : ''}
          </Text>
          <Button asChild variant='secondary' size='xs'>
            <a href={url || '#'} target='_blank' rel='noopener noreferrer'>
              скачать файл
            </a>
          </Button>
        </div>
        {state === 'error' ? (
          <div className='flex h-[50vh] w-full flex-col items-center justify-center gap-2 border border-borderColor bg-bgColor'>
            <Text size='micro' variant='label'>
              не удалось отрисовать DXF — файл можно скачать и открыть в CAD
            </Text>
          </div>
        ) : (
          <div className='relative'>
            {/* dxf-viewer owns this node: it appends its canvas and resizes with the box. */}
            <div ref={containerRef} className='h-[75vh] w-full border border-borderColor bg-bgColor' />
            {state === 'loading' && (
              <div className='pointer-events-none absolute inset-0 flex items-center justify-center'>
                <Text size='micro' variant='label'>
                  загрузка DXF…
                </Text>
              </div>
            )}
          </div>
        )}
      </div>
    </ConfirmationModal>
  );
}
