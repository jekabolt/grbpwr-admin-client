import { decode } from 'blurhash';
import { cn } from 'lib/utility';
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ImgHTMLAttributes,
  type SyntheticEvent,
  type TransitionEvent,
} from 'react';

const PLACEHOLDER_SIZE = 32;
const PLACEHOLDER_CACHE_LIMIT = 500;
const FADE_DURATION_MS = 300;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

const placeholderCache = new Map<string, string | null>();

function cachedPlaceholder(hash: string): string | null | undefined {
  if (!placeholderCache.has(hash)) return undefined;

  const value = placeholderCache.get(hash) ?? null;
  placeholderCache.delete(hash);
  placeholderCache.set(hash, value);
  return value;
}

function rememberPlaceholder(hash: string, value: string | null): void {
  placeholderCache.delete(hash);
  placeholderCache.set(hash, value);

  if (placeholderCache.size > PLACEHOLDER_CACHE_LIMIT) {
    const oldest = placeholderCache.keys().next().value;
    if (oldest !== undefined) placeholderCache.delete(oldest);
  }
}

function decodePlaceholder(blurhash?: string): string | null {
  const hash = blurhash?.trim();
  if (!hash || typeof document === 'undefined') return null;

  const cached = cachedPlaceholder(hash);
  if (cached !== undefined) return cached;

  let dataUrl: string | null = null;

  try {
    const pixels = decode(hash, PLACEHOLDER_SIZE, PLACEHOLDER_SIZE);
    const canvas = document.createElement('canvas');
    canvas.width = PLACEHOLDER_SIZE;
    canvas.height = PLACEHOLDER_SIZE;
    const context = canvas.getContext('2d');

    if (context) {
      const imageData = context.createImageData(PLACEHOLDER_SIZE, PLACEHOLDER_SIZE);
      imageData.data.set(pixels);
      context.putImageData(imageData, 0, 0);
      dataUrl = canvas.toDataURL();
    }
  } catch {
    // Invalid hashes stay on the neutral surface below.
  }

  rememberPlaceholder(hash, dataUrl);
  return dataUrl;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.(REDUCED_MOTION_QUERY).matches;
}

export interface BlurhashImageProps
  extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'alt' | 'className' | 'src'> {
  src: string;
  blurhash?: string;
  alt: string;
  className?: string;
  load?: boolean;
}

export const BlurhashImage = forwardRef<HTMLImageElement, BlurhashImageProps>(
  function BlurhashImage(
    { src, blurhash, alt, className, load = true, onLoad, onError, onTransitionEnd, ...imageProps },
    forwardedRef,
  ) {
    const placeholder = useMemo(() => decodePlaceholder(blurhash), [blurhash]);
    const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
    const [settledSrc, setSettledSrc] = useState<string | null>(null);
    const instantSrc = useRef<string | null>(null);
    const loaded = load && loadedSrc === src;
    const showPlaceholder = !load || settledSrc !== src;

    const setImageRef = useCallback(
      (node: HTMLImageElement | null) => {
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;

        const requestedSrc = node?.getAttribute('src');
        if (!node || !requestedSrc || !node.complete || node.naturalWidth === 0) return;

        instantSrc.current = requestedSrc;
        setLoadedSrc(requestedSrc);
        setSettledSrc(requestedSrc);
      },
      [forwardedRef],
    );

    const handleLoad = (event: SyntheticEvent<HTMLImageElement>) => {
      const requestedSrc = event.currentTarget.getAttribute('src') ?? src;
      setLoadedSrc(requestedSrc);
      if (instantSrc.current === requestedSrc || prefersReducedMotion()) {
        setSettledSrc(requestedSrc);
      }
      onLoad?.(event);
    };

    const handleTransitionEnd = (event: TransitionEvent<HTMLImageElement>) => {
      if (event.propertyName === 'opacity') {
        setSettledSrc(event.currentTarget.getAttribute('src') ?? src);
      }
      onTransitionEnd?.(event);
    };

    useEffect(() => {
      if (!loaded || settledSrc === src) return;
      const timeout = window.setTimeout(() => setSettledSrc(src), FADE_DURATION_MS);
      return () => window.clearTimeout(timeout);
    }, [loaded, settledSrc, src]);

    return (
      <span
        role={!load && alt ? 'img' : undefined}
        aria-label={!load && alt ? alt : undefined}
        className={cn('relative inline-block overflow-hidden bg-pageBg', className)}
      >
        {showPlaceholder && (
          <span
            aria-hidden
            className='pointer-events-none absolute inset-0 block h-full w-full bg-pageBg'
            style={
              placeholder
                ? {
                    backgroundImage: `url(${placeholder})`,
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                    backgroundSize: '100% 100%',
                  }
                : undefined
            }
          />
        )}

        {load && (
          <img
            {...imageProps}
            key={src}
            ref={setImageRef}
            src={src}
            alt={alt}
            onLoad={handleLoad}
            onError={onError}
            onTransitionEnd={handleTransitionEnd}
            className={cn(
              'block transition-opacity duration-300 ease-out motion-reduce:transition-none',
              className,
              loaded ? 'opacity-100' : 'opacity-0',
            )}
          />
        )}
      </span>
    );
  },
);
