import { common_HeroFullWithTranslations } from 'api/proto-http/frontend';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { useHeroPreview } from './useHeroPreview';

interface HeroPreviewProps {
  /** Hydrated draft (mapFormToHeroFull output); memoize upstream so it changes only on content change. */
  hero: common_HeroFullWithTranslations;
  onBlockClick?: (index: number) => void;
  /** Storefront base URL; defaults to VITE_STOREFRONT_URL, then the beta stand. */
  storefrontUrl?: string;
  country?: string;
  locale?: string;
}

// Logical viewport per view; the iframe renders at this size and is scaled to fit
// the panel, so the storefront's >=1024px desktop breakpoint holds in a narrow dock.
const VIEWS = {
  desktop: { width: 1280, height: 720 },
  mobile: { width: 390, height: 844 },
} as const;

export function HeroPreview({
  hero,
  onBlockClick,
  storefrontUrl,
  country = 'gb',
  locale = 'en',
}: HeroPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<'desktop' | 'mobile'>('desktop');
  const [containerWidth, setContainerWidth] = useState(0);

  const baseUrl = (
    storefrontUrl ||
    import.meta.env.VITE_STOREFRONT_URL ||
    (import.meta.env.DEV ? 'http://localhost:3000' : 'https://beta.grbpwr.com')
  ).replace(/\/$/, '');
  const origin = useMemo(() => {
    try {
      return new URL(baseUrl).origin;
    } catch {
      return baseUrl;
    }
  }, [baseUrl]);
  const src = `${baseUrl}/${country}/${locale}/preview/hero`;

  const { handleReload } = useHeroPreview({
    iframeRef,
    hero,
    storefrontOrigin: origin,
    onBlockClick,
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setContainerWidth(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { width: logicalWidth, height: logicalHeight } = VIEWS[view];
  const scale = containerWidth ? Math.min(1, containerWidth / logicalWidth) : 1;

  return (
    <div className='flex flex-col gap-3 border-2 border-textColor'>
      <div className='flex flex-wrap items-center justify-between gap-2 border-b border-textColor px-3 py-2'>
        <Text variant='uppercase' size='large'>
          live preview
        </Text>
        <div className='flex items-center gap-2'>
          <Button
            type='button'
            variant={view === 'desktop' ? 'main' : 'secondary'}
            className='cursor-pointer px-2 py-1'
            onClick={() => setView('desktop')}
          >
            desktop
          </Button>
          <Button
            type='button'
            variant={view === 'mobile' ? 'main' : 'secondary'}
            className='cursor-pointer px-2 py-1'
            onClick={() => setView('mobile')}
          >
            mobile
          </Button>
        </div>
      </div>

      <div ref={containerRef} className='w-full px-3 pb-3'>
        <div
          className='relative mx-auto overflow-hidden border border-textInactiveColor bg-bgColor'
          style={{ width: logicalWidth * scale, height: logicalHeight * scale }}
        >
          <iframe
            ref={iframeRef}
            title='hero preview'
            src={src}
            onLoad={handleReload}
            style={{
              width: logicalWidth,
              height: logicalHeight,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              border: 0,
            }}
          />
        </div>
      </div>
    </div>
  );
}
