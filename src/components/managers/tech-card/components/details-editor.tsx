import { common_MediaFull, common_TechCard } from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { useMediaMap } from 'components/managers/media/utils/useMediaQuery';
import { useEffect, useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import Media from 'ui/components/media';
import { MediaViewer, MediaViewerItem } from 'ui/components/media-viewer';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';
import { Toolbar } from 'ui/components/toolbar';
import { upsertDetail, type FormDetail } from './form-writers';
import { TechCardFormData } from './schema';
import { detailAspects, detailKeyLabel } from './tech-card-options';

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

  // upsert the aspect's row by key; drop it when it has neither text nor images.
  // ТЕЛО УЕХАЛО В `form-writers.ts` — там же, где рождаются указания и строки BOM. Здесь была
  // ВТОРАЯ копия одного правила (первая — поля общих сведений), и черновик construction завёл бы
  // третью; расхождение таких копий видно только полной перезаписью на сохранении.
  const upsert = (key: string, patch: Partial<FormDetail>) =>
    upsertDetail(getValues, setValue, key, patch);

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
    <div className='space-y-2.5'>
      <Text size='micro' variant='label'>
        construction described aspect by aspect: text + reference images. only the filled-in ones
        are shown — add the ones you need below. empty aspects are not saved.
      </Text>

      {allKeys.length === 0 && (
        <Text size='micro' variant='label'>
          no aspects added yet — pick a type below or type your own
        </Text>
      )}

      {allKeys.length > 0 && (
        <div className='grid grid-cols-1 gap-1.5 lg:grid-cols-2'>
          {allKeys.map((key) => {
            const d = detailByKey(key);
            const ids = d?.mediaIds ?? [];
            return (
              <div key={key} className='space-y-1 border border-borderColor p-2.5'>
                <div className='flex items-baseline justify-between gap-2'>
                  <Text component='span' className='font-bold'>
                    {detailKeyLabel(key)}
                  </Text>
                  <button
                    type='button'
                    aria-label='remove aspect'
                    onClick={() => removeAspect(key)}
                    className='shrink-0 text-micro uppercase tracking-label text-labelColor hover:text-textColor'
                  >
                    remove ✕
                  </button>
                </div>
                <Textarea
                  name={`detail-${key}`}
                  rows={2}
                  maxLength={2000}
                  value={d?.text ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    upsert(key, { text: e.target.value })
                  }
                />
                {/* 100px, not the 40px these used to be: a construction reference is looked AT —
                    a seam finish or a pocket bartack is unreadable at thumbnail size, which made
                    the strip a list of things you had to open one by one to identify. */}
                <div className='flex flex-wrap items-start gap-1.5'>
                  {ids.map((id, imgIndex) => {
                    const url = urlOf(id);
                    return (
                      <div key={id} className='relative size-[100px] border border-borderColor'>
                        <button
                          type='button'
                          onClick={() =>
                            url && setViewer({ items: viewerItemsFor(ids), index: imgIndex })
                          }
                          disabled={!url}
                          aria-label='view the image'
                          className='block size-full cursor-zoom-in'
                        >
                          {url ? (
                            <Media src={url} alt='ref' aspectRatio='1/1' fit='cover' />
                          ) : (
                            <span className='flex size-full items-center justify-center text-micro'>
                              #{id}
                            </span>
                          )}
                        </button>
                        <button
                          type='button'
                          aria-label='remove image'
                          onClick={() => removeImage(key, id)}
                          className='absolute -right-1 -top-1 flex size-4 items-center justify-center border border-borderColor bg-bgColor text-nano leading-none'
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                  {/* Той же клеткой, что и снимки рядом: пустое место и есть слот. ⌘V кладёт сюда
                      скриншот из мессенджера, минуя библиотеку. */}
                  <MediaSlot
                    aspectRatio={['Custom']}
                    frameAspect='1/1'
                    heightPx={100}
                    compact
                    label='+ image'
                    purpose='construction reference'
                    allowMultiple
                    showVideos={false}
                    onSelect={(picked) => addImages(key, picked)}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Toolbar>
        {remainingStandard.length > 0 && (
          <select
            aria-label='add a standard aspect'
            value=''
            onChange={(e) => addStandard(e.target.value)}
            className='min-h-[22px] w-40 appearance-none rounded-none border border-borderColor bg-bgColor px-[7px] py-[3px] text-textBaseSize focus:border-textColor focus:outline-none'
          >
            <option value=''>pick a type…</option>
            {remainingStandard.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </select>
        )}
        <Input
          name='new-aspect'
          value={newAspect}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAspect(e.target.value)}
          placeholder='your own aspect (e.g. lining)'
          className='w-48'
        />
        <Button type='button' variant='main' size='sm' onClick={addCustom}>
          + aspect
        </Button>
      </Toolbar>

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
