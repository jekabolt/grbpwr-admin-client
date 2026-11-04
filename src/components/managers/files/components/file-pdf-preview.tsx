import { useLayoutEffect, useRef, useState } from 'react';
import { Button, Text } from 'ui';
import { usePdfDocument } from '../hooks/usePdfDocument';
import { ReaderPage, type PageHit } from './reader-page';

const NO_HITS: PageHit[] = [];
const FRAME_INSET = 16;

/** First page of a pdf, fitted into the frame of the file card. A click opens the reader. */
export function FilePdfPreview({
  url,
  urlsExpireAt,
  fallback,
  className,
  onOpen,
}: {
  url: string;
  urlsExpireAt: string | null;
  fallback: React.ReactNode;
  className: string;
  onOpen: () => void;
}) {
  const { doc, status } = usePdfDocument(url, urlsExpireAt);
  const frameRef = useRef<HTMLButtonElement>(null);
  const [zoom, setZoom] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (!doc) return;
    let cancelled = false;
    doc
      .getPage(1)
      .then((page) => {
        const frame = frameRef.current;
        if (cancelled || !frame) return;
        const { width, height } = page.getViewport({ scale: 1 });
        const fit = Math.min(
          (frame.clientWidth - FRAME_INSET) / width,
          (frame.clientHeight - FRAME_INSET) / height,
        );
        setZoom(Math.max(10, Math.floor(fit * 100)));
      })
      .catch(() => setZoom(null));
    return () => {
      cancelled = true;
    };
  }, [doc]);

  if (status === 'failed') return <>{fallback}</>;

  return (
    <Button
      ref={frameRef}
      type='button'
      variant='default'
      aria-label='read pdf'
      onClick={onOpen}
      className={`${className} flex w-full shrink-0 cursor-zoom-in items-center justify-center overflow-hidden border-b border-borderColor bg-pageBg`}
    >
      {doc && zoom ? (
        <span className='pointer-events-none block'>
          <ReaderPage doc={doc} pageNumber={1} zoom={zoom} hits={NO_HITS} />
        </span>
      ) : (
        <Text size='micro' variant='label' component='span'>
          loading
        </Text>
      )}
    </Button>
  );
}
