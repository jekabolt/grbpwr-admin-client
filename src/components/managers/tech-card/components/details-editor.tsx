import { common_MediaFull, common_TechCard } from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { useMediaMap } from 'components/managers/media/utils/useMediaQuery';
import { useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import Text from 'ui/components/text';
import { TechCardFormData } from './schema';
import { detailAspects, detailKeyLabel } from './tech-card-options';

type FormDetail = { key?: string; text?: string; mediaIds?: number[] };

const STANDARD_KEYS = detailAspects.map((a) => a.key);

// Construction-description editor (Sheet «Титул», lower block) backed by details[]. Standard
// aspects (silhouette / collar / …) are always shown; you can add custom aspects. Each aspect
// is free text + a strip of reference images. Empty aspects aren't persisted (the mapper
// drops them), so showing all standard rows never dirties or bloats the saved card.
export function DetailsEditor({ techCard }: { techCard?: common_TechCard }) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const details = (useWatch({ control, name: 'details' }) ?? []) as FormDetail[];
  const [customKeys, setCustomKeys] = useState<string[]>([]);
  const [newAspect, setNewAspect] = useState('');
  // session cache of just-picked media so thumbnails show before a reload
  const [cache, setCache] = useState<Map<number, string>>(new Map());
  // url of the image opened in the enlarged preview (null = closed)
  const [preview, setPreview] = useState<string | null>(null);

  const mediaById = useMemo(() => {
    const m = new Map<number, common_MediaFull>();
    for (const rm of techCard?.resolvedMedia ?? [])
      if (rm.media?.id != null) m.set(rm.media.id, rm.media);
    return m;
  }, [techCard?.resolvedMedia]);
  // resolvedMedia carries only the sketch media; detail reference images are plain library
  // media ids, so resolve them from the media library too (otherwise they show as "#id" after
  // a reload).
  const libraryMap = useMediaMap();

  const detailByKey = (key: string) => details.find((d) => d.key === key);

  // upsert the aspect's row by key; drop it when it has neither text nor images
  const upsert = (key: string, patch: Partial<FormDetail>) => {
    const cur = (getValues('details') ?? []) as FormDetail[];
    const k = cur.findIndex((d) => d.key === key);
    const base = k >= 0 ? cur[k] : { key, text: '', mediaIds: [] };
    const merged: FormDetail = {
      key,
      text: base.text ?? '',
      mediaIds: base.mediaIds ?? [],
      ...patch,
    };
    const empty = !merged.text?.trim() && (merged.mediaIds?.length ?? 0) === 0;
    const next = empty
      ? cur.filter((d) => d.key !== key)
      : k >= 0
        ? [...cur.slice(0, k), merged, ...cur.slice(k + 1)]
        : [...cur, merged];
    setValue('details', next as never, { shouldDirty: true });
  };

  const addImages = (key: string, picked: common_MediaFull[]) => {
    const ids = picked.map((m) => m.id).filter((x): x is number => x != null);
    setCache((prev) => {
      const m = new Map(prev);
      for (const p of picked) {
        if (p.id != null)
          m.set(p.id, p.media?.thumbnail?.mediaUrl || p.media?.fullSize?.mediaUrl || '');
      }
      return m;
    });
    // read the current ids from live form state (not the render snapshot) so two quick picks
    // don't clobber each other
    const cur =
      ((getValues('details') ?? []) as FormDetail[]).find((d) => d.key === key)?.mediaIds ?? [];
    upsert(key, { mediaIds: Array.from(new Set([...cur, ...ids])) });
  };

  const removeImage = (key: string, id: number) => {
    const cur =
      ((getValues('details') ?? []) as FormDetail[]).find((d) => d.key === key)?.mediaIds ?? [];
    upsert(key, { mediaIds: cur.filter((x) => x !== id) });
  };

  // delete a custom aspect entirely (standard aspects are always shown and can't be removed)
  const removeCustom = (key: string) => {
    setCustomKeys((prev) => prev.filter((k) => k !== key));
    const cur = ((getValues('details') ?? []) as FormDetail[]).filter((d) => d.key !== key);
    setValue('details', cur as never, { shouldDirty: true });
  };

  const urlOf = (id: number) => {
    const m = mediaById.get(id) ?? libraryMap.get(id);
    return cache.get(id) || m?.media?.thumbnail?.mediaUrl || m?.media?.fullSize?.mediaUrl || '';
  };

  // standard aspects (always shown) + any custom keys present in data or added this session
  const presentCustom = details
    .map((d) => d.key)
    .filter((k): k is string => !!k && !STANDARD_KEYS.includes(k));
  const allKeys = [
    ...STANDARD_KEYS,
    ...Array.from(new Set([...presentCustom, ...customKeys])).filter(
      (k) => !STANDARD_KEYS.includes(k),
    ),
  ];

  const addCustom = () => {
    const key = newAspect.trim();
    if (!key || allKeys.includes(key)) return;
    setCustomKeys((prev) => [...prev, key]);
    setNewAspect('');
  };

  return (
    <div className='space-y-4'>
      <Text variant='inactive' size='small'>
        Описание конструкции по аспектам: текст + референс-картинки. Пустые аспекты не сохраняются.
      </Text>

      <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
        {allKeys.map((key) => {
          const d = detailByKey(key);
          const ids = d?.mediaIds ?? [];
          return (
            <div key={key} className='space-y-2 border border-textInactiveColor p-3'>
              <div className='flex items-center justify-between gap-2'>
                <Text variant='uppercase' size='small'>
                  {detailKeyLabel(key)}
                </Text>
                {!STANDARD_KEYS.includes(key) && (
                  <button
                    type='button'
                    aria-label='remove aspect'
                    onClick={() => removeCustom(key)}
                    className='shrink-0 text-xs uppercase text-textInactiveColor hover:text-textColor'
                  >
                    удалить аспект ✕
                  </button>
                )}
              </div>
              <textarea
                rows={2}
                maxLength={2000}
                value={d?.text ?? ''}
                onChange={(e) => upsert(key, { text: e.target.value })}
                className='w-full appearance-none rounded-none border-b border-textColor bg-bgColor text-textBaseSize focus:outline-none'
              />
              <div className='flex flex-wrap items-center gap-2'>
                {ids.map((id) => {
                  const url = urlOf(id);
                  return (
                    <div key={id} className='relative size-12 border border-textColor'>
                      <button
                        type='button'
                        onClick={() => url && setPreview(url)}
                        disabled={!url}
                        aria-label='посмотреть картинку'
                        className='block size-full'
                      >
                        {url ? (
                          <Media src={url} alt='ref' aspectRatio='1/1' fit='cover' />
                        ) : (
                          <span className='flex size-full items-center justify-center text-xs'>
                            #{id}
                          </span>
                        )}
                      </button>
                      <button
                        type='button'
                        aria-label='remove image'
                        onClick={() => removeImage(key, id)}
                        className='absolute -right-1 -top-1 flex size-4 items-center justify-center border border-textColor bg-bgColor text-xs leading-none'
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
                <MediaSelector
                  label='+ картинка'
                  purpose='construction reference'
                  aspectRatio={['Custom']}
                  allowMultiple
                  showVideos={false}
                  saveSelectedMedia={(picked) => addImages(key, picked)}
                  triggerClassName='px-2 py-1 uppercase'
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className='flex items-end gap-2'>
        <input
          value={newAspect}
          onChange={(e) => setNewAspect(e.target.value)}
          placeholder='свой аспект (напр. подкладка)'
          className='w-64 appearance-none rounded-none border-b border-textColor bg-bgColor text-textBaseSize focus:outline-none'
        />
        <Button type='button' className='uppercase' onClick={addCustom}>
          + аспект
        </Button>
      </div>

      {/* click-to-enlarge preview of a reference image */}
      {preview && (
        <div
          className='fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 p-6'
          onClick={() => setPreview(null)}
          role='dialog'
          aria-label='предпросмотр картинки'
        >
          <img src={preview} alt='preview' className='max-h-full max-w-full object-contain' />
        </div>
      )}
    </div>
  );
}
