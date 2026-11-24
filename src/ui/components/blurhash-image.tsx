import { cn } from 'lib/utility';
import { drawBlurhashPreview, drawPixelPreview, loadPixelPreview } from 'lib/pixel-mosaic';
import {
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ImgHTMLAttributes,
  type SyntheticEvent,
} from 'react';

const MOSAIC_WIDTHS = [2, 3, 6] as const;
const MOSAIC_STEP_MS = 90;

export interface BlurhashImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'alt' | 'className' | 'src'> {
  src: string;
  pixelPreview?: string;
  blurhash?: string;
  alt: string;
  className?: string;
  load?: boolean;
}

export const BlurhashImage = forwardRef<HTMLImageElement, BlurhashImageProps>(
  function BlurhashImage(
    { src, pixelPreview, blurhash, alt, className, load = true, onLoad, onError, ...imageProps },
    forwardedRef,
  ) {
    // eslint-disable-next-line react/prop-types -- The legacy rule misses typed forwardRef props.
    const preview = pixelPreview?.trim() ?? '';
    const hash = blurhash?.trim() ?? '';
    const hasMosaic = !!(preview || hash);
    const [mosaicSrc, setMosaicSrc] = useState<string | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const showMosaic = hasMosaic && mosaicSrc === src;

    const setImageRef = useCallback(
      (node: HTMLImageElement | null) => {
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;

        const requestedSrc = node?.getAttribute('src');
        if (!node || !requestedSrc || !hasMosaic) return;
        setMosaicSrc(node.complete && node.naturalWidth > 0 ? null : requestedSrc);
      },
      [forwardedRef, hasMosaic],
    );

    const handleLoad = (event: SyntheticEvent<HTMLImageElement>) => {
      const requestedSrc = event.currentTarget.getAttribute('src') ?? src;
      setMosaicSrc((current) => (current === requestedSrc ? null : current));
      onLoad?.(event);
    };

    const handleError = (event: SyntheticEvent<HTMLImageElement>) => {
      onError?.(event);
    };

    useEffect(() => {
      if (load) return;
      setMosaicSrc(hasMosaic ? src : null);
    }, [hasMosaic, load, src]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas || !showMosaic) return;

      let cancelled = false;
      const timers: number[] = [];
      if (preview) {
        void loadPixelPreview(preview).then((image) => {
          if (!image || cancelled) return;
          MOSAIC_WIDTHS.forEach((width, index) => {
            const draw = () => {
              if (!cancelled) drawPixelPreview(canvas, image, width);
            };
            if (index === 0) draw();
            else timers.push(window.setTimeout(draw, index * MOSAIC_STEP_MS));
          });
        });
      } else if (hash) {
        drawBlurhashPreview(canvas, hash);
      }

      return () => {
        cancelled = true;
        timers.forEach(window.clearTimeout);
      };
    }, [hash, preview, showMosaic, src]);

    return (
      <span
        role={!load && alt ? 'img' : undefined}
        aria-label={!load && alt ? alt : undefined}
        className={cn('relative inline-block overflow-hidden bg-pageBg', className)}
      >
        {load && (
          <img
            {...imageProps}
            key={src}
            ref={setImageRef}
            src={src}
            alt={alt}
            onLoad={handleLoad}
            onError={handleError}
            className={cn('block', className)}
          />
        )}
        {showMosaic && (
          <canvas
            ref={canvasRef}
            aria-hidden
            className='pointer-events-none absolute inset-0 block h-full w-full [image-rendering:crisp-edges]'
            style={{ imageRendering: 'pixelated' }}
          />
        )}
      </span>
    );
  },
);
