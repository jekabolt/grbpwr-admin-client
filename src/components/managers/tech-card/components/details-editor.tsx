import { common_MediaFull, common_TechCard } from 'api/proto-http/admin';
import { MediaSelector } from 'components/managers/media/components/media-selector';
import { useMediaMap } from 'components/managers/media/utils/useMediaQuery';
import { useEffect, useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import { MediaViewer, MediaViewerItem } from 'ui/components/media-viewer';
import Text from 'ui/components/text';
import { TechCardFormData } from './schema';
import { detailAspects, detailKeyLabel } from './tech-card-options';

type FormDetail = { key?: string; text?: string; mediaIds?: number[] };

const STANDARD_KEYS = detailAspects.map((a) => a.key);

// Construction-description editor (Sheet «Титул», lower block) backed by details[]. Only aspects
// that actually have content are shown by default — add more via the "+ добавить аспект" picker
// (standard types) or as a free-form custom aspect, instead of showing all standard rows as a
// wall of empty inputs. Each aspect is free text + a strip of reference images. Empty aspects
// aren't persisted (the mapper drops them) and collapse back out of view on the next load; a
// standard aspect stays visible for the rest of the session once shown, even if its text is
// cleared mid-edit, so the card never disappears out from under the cursor.
export function DetailsEditor({ techCard }: { techCard?: common_TechCard }) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const details = (useWatch({ control, name: 'details' }) ?? []) as FormDetail[];
  const [shownStandard, setShownStandard] = useState<string[]>(() =>
    STANDARD_KEYS.filter((k) => details.some((d) => d.key === k)),
  );
  const [customKeys, setCustomKeys] = useState<string[]>([]);
  const [newAspect, setNewAspect] = useState('');
  // session cache of just-picked media so thumbnails show before a reload
  const [cache, setCache] = useState<Map<number, string>>(new Map());
  // the reference strip opened in the shared viewer (null = closed). Each aspect
  // browses its own images, so we stash the built item list alongside the index.
  const [viewer, setViewer] = useState<{ items: MediaViewerItem[]; index: number } | null>(null);

  // Reveal a standard aspect the moment it has content (covers data arriving after mount, e.g. an
  // async form reset) — but only ever grow the set, never shrink it reactively, so clearing text
  // mid-edit can't yank the card out from under the user.
  useEffect(() => {
    const filledNow = STANDARD_KEYS.filter((k) => details.some((d) => d.key === k));
    if (filledNow.length === 0) return;
    setShownStandard((prev) => {
      const missing = filledNow.filter((k) => !prev.includes(k));
      return missing.length ? [...prev, ...missing] : prev;
    });
  }, [details]);

  const mediaById = useMemo(() => {
    const m = new Map<number, common_MediaFull>();
    for (const rm of [
      ...(techCard?.resolvedTechnicalMedia ?? []),
      ...(techCard?.resolvedMoodboardMedia ?? []),
    ])
      if (rm.media?.id != null) m.set(rm.media.id, rm.media);
    return m;
  }, [techCard?.resolvedTechnicalMedia, techCard?.resolvedMoodboardMedia]);
  // The resolved sketch maps carry only the sketch media; detail reference images are plain
  // library media ids, so resolve them from the media library too (otherwise they show as
  // "#id" after a reload).
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

  // hide an aspect card again: clear its content (if any) and forget it was shown. A standard
  // aspect can always be re-added from the picker; a custom one is gone until retyped.
  const removeAspect = (key: string) => {
    upsert(key, { text: '', mediaIds: [] });
    if (STANDARD_KEYS.includes(key)) setShownStandard((prev) => prev.filter((k) => k !== key));
    else setCustomKeys((prev) => prev.filter((k) => k !== key));
  };

  const urlOf = (id: number) => {
    const m = mediaById.get(id) ?? libraryMap.get(id);
    return cache.get(id) || m?.media?.thumbnail?.mediaUrl || m?.media?.fullSize?.mediaUrl || '';
  };

  // Build the viewer strip for an aspect (full-size on the stage, thumb for nav).
  const viewerItemsFor = (ids: number[]): MediaViewerItem[] =>
    ids.map((id) => {
      const m = mediaById.get(id) ?? libraryMap.get(id);
      const thumb = urlOf(id);
      return {
        src: m?.media?.fullSize?.mediaUrl || m?.media?.compressed?.mediaUrl || thumb,
        thumbnail: thumb,
      };
    });

  // visible = standard aspects shown this session (filled, or explicitly added) + custom keys
  // present in data or added this session — never the full standard list by default.
  const visibleStandard = STANDARD_KEYS.filter((k) => shownStandard.includes(k));
  const presentCustom = details
    .map((d) => d.key)
    .filter((k): k is string => !!k && !STANDARD_KEYS.includes(k));
  const visibleCustom = Array.from(new Set([...presentCustom, ...customKeys])).filter(
    (k) => !STANDARD_KEYS.includes(k),
  );
  const allKeys = [...visibleStandard, ...visibleCustom];
  const remainingStandard = detailAspects.filter((a) => !shownStandard.includes(a.key));

  const addStandard = (key: string) => {
    if (!key || shownStandard.includes(key)) return;
    setShownStandard((prev) => [...prev, key]);
  };

  const addCustom = () => {
    const key = newAspect.trim();
    if (!key || allKeys.includes(key)) return;
    setCustomKeys((prev) => [...prev, key]);
    setNewAspect('');
  };

  return (
    <div className='space-y-4'>
      <Text variant='inactive' size='small'>
        Описание конструкции по аспектам: текст + референс-картинки. Показаны только заполненные —
        добавляйте нужные ниже. Пустые аспекты не сохраняются.
      </Text>

      {allKeys.length === 0 && (
        <Text variant='inactive' size='small'>
          аспекты ещё не добавлены — выберите тип ниже или впишите свой
        </Text>
      )}

      {allKeys.length > 0 && (
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
                  <button
                    type='button'
                    aria-label='remove aspect'
                    onClick={() => removeAspect(key)}
                    className='shrink-0 text-textBaseSize uppercase text-textInactiveColor hover:text-textColor'
                  >
                    удалить аспект ✕
                  </button>
                </div>
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={d?.text ?? ''}
                  onChange={(e) => upsert(key, { text: e.target.value })}
                  className='w-full appearance-none rounded-none border-b border-textInactiveColor bg-bgColor text-textBaseSize focus:outline-none'
                />
                <div className='flex flex-wrap items-center gap-2'>
                  {ids.map((id, imgIndex) => {
                    const url = urlOf(id);
                    return (
                      <div key={id} className='relative size-12 border border-textInactiveColor'>
                        <button
                          type='button'
                          onClick={() =>
                            url && setViewer({ items: viewerItemsFor(ids), index: imgIndex })
                          }
                          disabled={!url}
                          aria-label='посмотреть картинку'
                          className='block size-full cursor-zoom-in'
                        >
                          {url ? (
                            <Media src={url} alt='ref' aspectRatio='1/1' fit='cover' />
                          ) : (
                            <span className='flex size-full items-center justify-center text-textBaseSize'>
                              #{id}
                            </span>
                          )}
                        </button>
                        <button
                          type='button'
                          aria-label='remove image'
                          onClick={() => removeImage(key, id)}
                          className='absolute -right-1 -top-1 flex size-4 items-center justify-center border border-textInactiveColor bg-bgColor text-textBaseSize leading-none'
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
      )}

      <div className='flex flex-wrap items-end gap-3'>
        {remainingStandard.length > 0 && (
          <label className='flex flex-col gap-1'>
            <Text size='small'>+ добавить аспект</Text>
            <select
              value=''
              onChange={(e) => addStandard(e.target.value)}
              className='w-64 appearance-none rounded-none border-b border-textInactiveColor bg-bgColor text-textBaseSize focus:outline-none'
            >
              <option value=''>выбрать тип…</option>
              {remainingStandard.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className='flex items-end gap-2'>
          <input
            value={newAspect}
            onChange={(e) => setNewAspect(e.target.value)}
            placeholder='свой аспект (напр. подкладка)'
            className='w-64 appearance-none rounded-none border-b border-textInactiveColor bg-bgColor text-textBaseSize focus:outline-none'
          />
          <Button type='button' className='uppercase' onClick={addCustom}>
            + аспект
          </Button>
        </div>
      </div>

      {/* click-to-enlarge preview of the aspect's reference images */}
      <MediaViewer
        items={viewer?.items ?? []}
        index={viewer?.index ?? 0}
        open={!!viewer}
        onOpenChange={(open) => !open && setViewer(null)}
        onIndexChange={(index) => setViewer((v) => (v ? { ...v, index } : v))}
      />
    </div>
  );
}
