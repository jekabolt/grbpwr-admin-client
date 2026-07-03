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
}

// Logical viewport per view; the iframe renders at this size and is scaled to fit
// the panel, so the storefront's >=1024px desktop breakpoint holds in a narrow dock.
const VIEWS = {
  desktop: { width: 1280, height: 720 },
  mobile: { width: 390, height: 844 },
} as const;

// Storefront locale codes — the translation language is chosen by the locale
// segment in the iframe URL (the draft carries every language). NB: the admin's
// LANGUAGES use cn/kr for ids 6/7, but the storefront URL expects zh/ko.
const PREVIEW_LOCALES = [
  { code: 'en', label: 'EN' },
  { code: 'fr', label: 'FR' },
  { code: 'de', label: 'DE' },
  { code: 'it', label: 'IT' },
  { code: 'ja', label: 'JA' },
  { code: 'zh', label: 'CN' },
  { code: 'ko', label: 'KR' },
] as const;

export function HeroPreview({
  hero,
  onBlockClick,
  storefrontUrl,
  country = 'gb',
}: HeroPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [view, setView] = useState<'desktop' | 'mobile'>('desktop');
  const [locale, setLocale] = useState('en');
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

  // When the iframe target changes (locale switch), drop the handshake so the
  // reloaded page's `ready` re-pushes the current draft in the new language.
  // Deterministic (tied to src), unlike the onLoad reset which can race `ready`.
  useEffect(() => {
    handleReload();
  }, [src, handleReload]);

  const { width: logicalWidth, height: logicalHeight } = VIEWS[view];
  const scale = containerWidth ? Math.min(1, containerWidth / logicalWidth) : 1;

  return (
    <div className='flex flex-col gap-3 border-2 border-textColor'>
      <div className='flex flex-col gap-2 border-b border-textColor px-3 py-2'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
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
        <div className='flex flex-wrap items-center gap-1'>
          {PREVIEW_LOCALES.map((l) => (
            <Button
              key={l.code}
              type='button'
              variant={locale === l.code ? 'main' : 'secondary'}
              className='cursor-pointer px-2 py-0.5'
              aria-pressed={locale === l.code}
              onClick={() => setLocale(l.code)}
            >
              {l.label}
            </Button>
          ))}
        </div>
      </div>

      <div ref={containerRef} className='w-full px-3 pb-3'>
        <div
          className='relative mx-auto overflow-hidden border border-textInactiveColor bg-bgColor'
          style={{ width: logicalWidth * scale, height: logicalHeight * scale }}
        >
          <iframe
            key={src}
            ref={iframeRef}
            title='hero preview'
            src={src}
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
