import { useEffect, useRef, useState } from 'react';
import { formatBytes } from 'utils/pattern';

// Same resolution scheme as the image cropper's proxy (see lib/features/getCropped.ts).
const MEDIA_PROXY =
  (import.meta.env.VITE_MEDIA_PROXY_URL as string | undefined) ||
  (typeof window !== 'undefined' ? `${window.location.origin}/media-proxy` : '/media-proxy');
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
    // The instance type lives inside the dynamic chunk; the cleanup only needs Destroy().
    let viewer: { Destroy: () => void } | null = null;
    setState('loading');

    let blobUrl: string | null = null;

    // dxf-viewer fetches its url itself, and the Spaces CDN serves patterns without CORS
    // headers — so fetch the bytes here (direct first, media proxy on a CORS failure, the
    // same dance the image cropper does) and hand the viewer a same-origin blob url.
    async function fetchAsBlobUrl(target: string): Promise<string> {
      let res: Response;
      try {
        res = await fetch(target);
      } catch {
        res = await fetch(`${MEDIA_PROXY}?url=${encodeURIComponent(target)}`);
      }
      if (!res.ok) throw new Error(`DXF fetch failed: ${res.status}`);
      return URL.createObjectURL(await res.blob());
    }

    (async () => {
      try {
        const [{ DxfViewer }, three, fetched] = await Promise.all([
          import('dxf-viewer'),
          import('three'),
          fetchAsBlobUrl(url),
        ]);
        blobUrl = fetched;
        const container = containerRef.current;
        if (!container || disposed) return;
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
      // Frees the WebGL context and the parsed scene — modals reopen often, contexts leak fast.
      try {
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
