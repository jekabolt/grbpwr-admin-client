import { common_MediaFull, common_TechCard } from 'api/proto-http/admin';
import { MediaSlot } from 'components/managers/media/components/media-slot';
import { useMediaMap } from 'components/managers/media/utils/useMediaQuery';
import { useEffect, useMemo, useState, type JSX } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { Chip } from 'ui/components/chip';
import Input from 'ui/components/input';
import Media from 'ui/components/media';
import { MediaViewer, MediaViewerItem } from 'ui/components/media-viewer';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import Textarea from 'ui/components/text-area';
import { Toolbar } from 'ui/components/toolbar';
import { InertDoor } from './design/bench-slot';
import { Counter, EmptyState } from './design/core';
import {
  BoardMovedPill,
  FromMoodboardPill,
  GoTo,
  LockedBar,
  ProvenancePill,
  scrollToOrgan,
  useProvenance,
} from './design/head/mood-organs';
import { REFERENCE_KIND } from './design/mood-board';
import { upsertDetail, type FormDetail } from './form-writers';
import { TechCardFormData } from './schema';
import { detailAspects, detailKeyLabel } from './tech-card-options';

/**
 * CONSTRUCTION — ОПИСАНО АСПЕКТ ЗА АСПЕКТОМ (блок шага MOODBOARD, макет `_step-mood.js`,
 * `zAspectsBlock`). Хранится в `details[]`; показываются только аспекты с содержимым или добавленные
 * в этой сессии — не стена пустых полей. Каждый аспект: подпись капслоком, справа пилюля
 * происхождения и `✕`; под ней текст; под текстом лента картинок 100×100 с `✕` в углу и приёмным
 * слотом `+ image`. Пустые аспекты не сохраняются (маппер их роняет) и уходят из вида на следующей
 * загрузке; стандартный аспект, показанный в сессии, остаётся на месте и с пустым текстом — карточка
 * не исчезает из-под курсора.
 *
 * ═══ ЧТО ЗДЕСЬ НЕ РИСУЕТСЯ — SILHOUETTE И FABRIC ══════════════════════════════════════════════
 *
 * Эти два ключа `details[]` правит блок GENERAL INFORMATION выше (та же строка, вторая
 * поверхность). Макет их в CONSTRUCTION не показывает — и здесь их нет: одно поле на двух блоках
 * одной страницы читалось бы как два разных поля. Строки при этом никуда не деваются: этот орган их
 * не видит, не удаляет и в пикер не предлагает.
 *
 * ═══ ШАПКА БЛОКА — У КОМПОЗИТОРА (`design/studio-tab.tsx`, заморожен) ═══════════════════════════
 *
 * Слота `action` она не отдаёт, поэтому правый угол макета (`FROM THE MOODBOARD · N OF M DRAFTED
 * ASPECTS · + ASPECT · MOODBOARD MOVED ON`) стоит первым рядом блока, прижатый вправо.
 * `ConstructionAction` экспортирован — как только композитор отдаст `action`, ряд переезжает туда.
 *
 * ═══ ДВЕРЬ «FROM CONSTRUCTION ▸ · pastes N lines» ════════════════════════════════════════════════
 *
 * В макете она вставляет строки конструкции в промпт ФЛЭТА. У продукта эта дверь ЕСТЬ и живёт у
 * самого поля-адресата — `garment description` на шаге FLAT (`design/references-section.tsx`,
 * B-15, «fit first, then one line per filled aspect»). Второго писателя того же правила здесь не
 * заводится; дверь стоит инертной С ПРИЧИНОЙ, которая называет, где стоит живая, а число строк
 * считается тем же правилом (посадка + заполненные аспекты).
 */

/** Ключи, которые правит GENERAL INFORMATION; здесь они не рисуются. */
const GENERAL_KEYS = ['silhouette', 'fabric'];
const STANDARD_KEYS = detailAspects.map((a) => a.key).filter((k) => !GENERAL_KEYS.includes(k));

export function DetailsEditor({ techCard }: { techCard?: common_TechCard }): JSX.Element {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const details = (useWatch({ control, name: 'details' }) ?? []) as FormDetail[];
  const fit = (useWatch({ control, name: 'fit' }) ?? '') as string;
  // «Стоит и во входе» — картинка, поднятая референсом шага FLAT (строка `moodboardMedia` вида
  // REFERENCE). Ровно этим отличается картинка аспекта от входа прогона, и отличие ПОКАЗАНО пилюлей
  // под кадром, а не рассказано оговоркой.
  const boardRows = (useWatch({ control, name: 'moodboardMedia' }) ?? []) as {
    mediaId?: number;
    kind?: string;
  }[];
  const inputIds = useMemo(
    () =>
      new Set(
        boardRows
          .filter((r) => r.kind === REFERENCE_KIND)
          .map((r) => r.mediaId)
          .filter((id): id is number => !!id),
      ),
    [boardRows],
  );
  const techCardId = techCard?.id ?? 0;
  const prov = useProvenance(techCardId);

  const [shownStandard, setShownStandard] = useState<string[]>(() =>
    STANDARD_KEYS.filter((k) => details.some((d) => d.key === k)),
  );
  const [customKeys, setCustomKeys] = useState<string[]>([]);
  const [picker, setPicker] = useState(false);
  const [newAspect, setNewAspect] = useState('');
  const [newStandard, setNewStandard] = useState('');
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
  // ТЕЛО УЕХАЛО В `form-writers.ts` — там же, где рождаются строки BOM. Здесь была ВТОРАЯ копия
  // одного правила (первая — поля общих сведений), и черновик construction завёл бы третью.
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
    .filter((k): k is string => !!k && !STANDARD_KEYS.includes(k) && !GENERAL_KEYS.includes(k));
  const visibleCustom = Array.from(new Set([...presentCustom, ...customKeys])).filter(
    (k) => !STANDARD_KEYS.includes(k) && !GENERAL_KEYS.includes(k),
  );
  const allKeys = [...visibleStandard, ...visibleCustom];
  const remainingStandard = detailAspects.filter(
    (a) => !GENERAL_KEYS.includes(a.key) && !shownStandard.includes(a.key),
  );
  const drafted = allKeys.filter((k) => prov({ kind: 'detail', key: k }) === 'drafted').length;

  // ЧТО УЕХАЛО БЫ ВО ФЛЭТ ДВЕРЬЮ «FROM CONSTRUCTION»: посадка, затем по строке на заполненный
  // аспект — правило двери у поля-адресата (`references-section.tsx`, `takeAspects`). Здесь только
  // ЧИСЛО, тем же счётом; текст не собирается — второго писателя у правила нет.
  const pasteLines =
    (fit.trim() ? 1 : 0) + details.filter((d) => (d.key ?? '').trim() && (d.text ?? '').trim()).length;

  const addAspect = () => {
    const own = newAspect.trim();
    const key = own || newStandard;
    if (!key) return;
    if (own) {
      if (!allKeys.includes(own) && !GENERAL_KEYS.includes(own))
        setCustomKeys((prev) => (prev.includes(own) ? prev : [...prev, own]));
    } else if (!shownStandard.includes(key)) {
      setShownStandard((prev) => [...prev, key]);
    }
    setNewAspect('');
    setNewStandard('');
    setPicker(false);
  };

  const addChip = (
    <Chip dashed onClick={() => setPicker((v) => !v)} pressed={picker} data-c19-aspect-add=''>
      + aspect
    </Chip>
  );

  return (
    <div className='space-y-2.5' data-c19-aspects=''>
      <ConstructionAction
        techCardId={techCardId}
        drafted={drafted}
        total={allKeys.length}
        add={addChip}
      />

      {allKeys.length === 0 && (
        <EmptyState action={addChip}>
          <span className='uppercase text-textColor'>no aspects yet</span>
        </EmptyState>
      )}

      {allKeys.length > 0 && (
        <div data-c19-aspect-list=''>
          {allKeys.map((key) => {
            const d = detailByKey(key);
            const ids = d?.mediaIds ?? [];
            return (
              <div key={key} className='border-b border-hairline pb-2 pt-1.5' data-c19-aspect={key}>
                <div className='flex flex-wrap items-center gap-2'>
                  <Text
                    size='control'
                    variant='uppercase'
                    tracking='label'
                    component='span'
                    className='min-w-0 flex-1 truncate'
                  >
                    {detailKeyLabel(key)}
                  </Text>
                  <ProvenancePill state={prov({ kind: 'detail', key })} data-c19-prov={key} />
                  <Button
                    type='button'
                    variant='secondary'
                    size='xs'
                    aria-label={`remove aspect ${detailKeyLabel(key)}`}
                    onClick={() => removeAspect(key)}
                    data-c19-aspect-drop={key}
                  >
                    ✕
                  </Button>
                </div>
                <Textarea
                  name={`detail-${key}`}
                  rows={2}
                  maxLength={2000}
                  value={d?.text ?? ''}
                  placeholder='how this aspect is made'
                  className='mt-1'
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    upsert(key, { text: e.target.value })
                  }
                />
                {/* 100px, not the 40px these used to be: a construction reference is looked AT —
                    a seam finish or a pocket bartack is unreadable at thumbnail size. Под кадром —
                    пилюля `in the input`, если та же картинка стоит референсом флэта. */}
                <div className='mt-1.5 flex flex-wrap items-start gap-1.5'>
                  {ids.map((id, imgIndex) => {
                    const url = urlOf(id);
                    return (
                      <div key={id} className='min-w-[100px]' data-c19-aspect-pic={id}>
                        <div className='relative size-[100px] border border-borderColor bg-bgZebra'>
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
                            className='absolute right-0.5 top-0.5 flex size-4 items-center justify-center border border-borderColor bg-bgColor text-nano leading-none hover:border-textColor'
                          >
                            ✕
                          </button>
                        </div>
                        {inputIds.has(id) && (
                          <div className='pt-0.5'>
                            <Pill tone='ink'>in the input</Pill>
                          </div>
                        )}
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

      {/* ПИКЕР АСПЕКТА — по клику на `+ aspect`, полосой контролов (`Toolbar` — единственная
          рамка, которой внутри блока можно): словарь, своё имя, `add`, `close`. */}
      {picker && (
        <Toolbar data-c19-aspect-picker=''>
          {remainingStandard.length > 0 && (
            <select
              aria-label='aspect kind'
              value={newStandard}
              onChange={(e) => setNewStandard(e.target.value)}
              className='min-h-[22px] w-44 appearance-none rounded-none border border-borderColor bg-bgColor px-[7px] py-[3px] text-textBaseSize focus:border-textColor focus:outline-none'
            >
              <option value=''>— not set —</option>
              {remainingStandard.map((a) => (
                <option key={a.key} value={a.key}>
                  {a.label}
                </option>
              ))}
            </select>
          )}
          <Input
            name='new-aspect'
            aria-label='your own aspect'
            value={newAspect}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewAspect(e.target.value)}
            placeholder='or your own, e.g. lining'
            className='w-48'
          />
          <Button type='button' variant='secondary' size='xs' onClick={addAspect} data-c19-aspect-confirm=''>
            add
          </Button>
          <Button type='button' variant='secondary' size='xs' onClick={() => setPicker(false)}>
            close
          </Button>
        </Toolbar>
      )}

      {/* ДВЕРЬ ВСТАВКИ ВО ФЛЭТ — см. шапку файла: живая стоит у поля-адресата на шаге FLAT, здесь —
          инертная с причиной, и число строк тем же правилом. */}
      <div className='flex flex-wrap items-center gap-2' data-c19-paste-lines={pasteLines}>
        <InertDoor
          label='from construction ▸'
          size='sm'
          reason={`this door stands at the garment description on the FLAT step — it pastes ${pasteLines} line${
            pasteLines === 1 ? '' : 's'
          } from here (fit first, then one line per filled aspect)`}
        />
        <Text size='micro' variant='label' component='span'>
          pastes {pasteLines} line{pasteLines === 1 ? '' : 's'} · the door itself stands at the
          garment description on FLAT
        </Text>
      </div>
      {pasteLines === 0 && (
        <LockedBar
          reason='nothing is written in the construction yet · nothing to paste'
          door={
            <GoTo onClick={() => scrollToOrgan('[data-c19-general]')} data-c19-to-general=''>
              general information
            </GoTo>
          }
          data-c19-paste-lock=''
        />
      )}

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

/**
 * ПРАВЫЙ УГОЛ ШАПКИ БЛОКА (макет: `zFromBoard() + counter(drafted, 'drafted aspect', n) +
 * chip('+ aspect') + zMoved()`). Экспортирован для `action` композитора; пока тот заморожен — стоит
 * первым рядом блока. Счётчик не рисуется при нуле аспектов (макет: «не рисуется, если аспектов 0»).
 */
export function ConstructionAction({
  techCardId,
  drafted,
  total,
  add,
}: {
  techCardId: number;
  drafted: number;
  total: number;
  add?: JSX.Element;
}): JSX.Element {
  return (
    <div className='flex flex-wrap items-center justify-end gap-1.5' data-c19-aspects-action=''>
      <FromMoodboardPill />
      {total > 0 && (
        <span className='contents' data-c19-aspects-drafted=''>
          <Counter n={drafted} noun='drafted aspect' total={total} />
        </span>
      )}
      {add}
      <BoardMovedPill techCardId={techCardId} />
    </div>
  );
}
