import {
  common_Category,
  common_SeasonEnum,
  common_SkuSeason,
  common_TechCardListItem,
  common_TechCardStage,
} from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import {
  SEASON_OPTIONS,
  TECH_CARD_PURPOSE_ALL,
  techCardPurposeFilterOptions,
  techCardStageOptions,
} from 'constants/filter';
import { SECTION } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { getCategoriesByParentId } from 'lib/utility';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import GenericPopover from 'ui/components/popover';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import { Tiles } from 'ui/components/tiles';
import { Toolbar, ToolbarSpacer } from 'ui/components/toolbar';
import { seasonLabel, seasonParam, TechCardTile } from './tech-card-tile';
import { stageLabel } from './utils';
import { useDeleteTechCard, useInfiniteTechCards, useTechCard } from './useTechCardQuery';

const LIMIT = 30;
const ALL_STAGES = 'TECH_CARD_STAGE_UNKNOWN';
const DEFAULT_PURPOSE = TECH_CARD_PURPOSE_ALL;
// Потолок добора пула коллекций: 40 страниц по LIMIT. Не производительность, а ПРЕДОХРАНИТЕЛЬ —
// провалившийся fetchNextPage оставляет hasNextPage=true, и без счётчика цикл добора стал бы вечным.
const MAX_POOL_PAGES = 40;

// ?season=FW-2026. Parsed strictly — a mangled value is dropped rather than filtering to nothing.
function parseSeason(raw: string | null): common_SkuSeason | undefined {
  if (!raw) return undefined;
  const [code, year] = raw.split('-');
  const enumCode = `SEASON_ENUM_${(code ?? '').toUpperCase()}` as common_SeasonEnum;
  if (!SEASON_OPTIONS.some((o) => o.value === enumCode)) return undefined;
  const parsedYear = Number(year);
  if (!Number.isInteger(parsedYear) || parsedYear <= 0) return undefined;
  return { code: enumCode, year: parsedYear };
}

export function TechCardList() {
  const { showMessage } = useSnackBarStore();
  const deleteTechCard = useDeleteTechCard();
  const canEdit = usePermissions().canWrite(SECTION.techCards);
  // The category tree is already in memory (DictionaryProvider loads it once at startup).
  const { dictionary } = useDictionary();

  // Every filter lives in the URL (R-1): the board's "see all" hand-off lands pre-filtered, the
  // chips write back, and a reload/share reproduces the same view. Validated — a mangled ?stage=
  // must not be sent to the API (it would return nothing and read as an empty list).
  const [searchParams, setSearchParams] = useSearchParams();
  const [name, setName] = useState('');

  const setParam = (key: string, next: string | undefined) =>
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next) p.set(key, next);
        else p.delete(key);
        return p;
      },
      { replace: true },
    );

  const stageParam = searchParams.get('stage');
  const stage: common_TechCardStage = techCardStageOptions.some((o) => o.value === stageParam)
    ? (stageParam as common_TechCardStage)
    : ALL_STAGES;

  // Purpose (sellable | auxiliary | all) defaults to ALL: an aux card is a full tech card now
  // (colour variants, per-colour runs), so hiding half the catalogue behind a chip read as "the
  // filter is missing". `all` is a CLIENT sentinel, not a wire value: the RPC's purpose is "" = no
  // filter and the generated builder drops a falsy one, so "all" is sent as `undefined`. The chip
  // is always active (it always states which purpose is being shown) and opens a picker instead of
  // carrying a ✕ — removing it would be meaningless when the absence of the param already means
  // "all".
  // URL contract: no ?purpose= → all; ?purpose=sellable and ?purpose=auxiliary are explicit (old
  // shared links carrying either keep their exact meaning); anything else falls back to all.
  const purposeParam = searchParams.get('purpose');
  const purpose: string = techCardPurposeFilterOptions.some((o) => o.value === purposeParam)
    ? (purposeParam as string)
    : DEFAULT_PURPOSE;

  const purposeLabel =
    techCardPurposeFilterOptions.find((o) => o.value === purpose)?.label ?? purpose;

  const season = useMemo(() => parseSeason(searchParams.get('season')), [searchParams]);

  // ?collection=<ИМЯ>. Не enum и не id — свободный текст: колонки-ссылки `tech_card.collection_id`
  // у тех-карты нет (0240 дропнула её как мёртвую схему), хранится строка. Поэтому валидировать
  // нечем и НЕЛЬЗЯ: любое имя, которое сервер вернул в строке листа, — законное значение фильтра,
  // включая рукописные и архивные, которых в словаре коллекций нет. Пустое значение (?collection=)
  // = фильтра нет, ровно как на сервере, где falsy не уходит на провод.
  // НИКАКОЙ СВОЕЙ НОРМАЛИЗАЦИИ: сервер TrimSpace снял намеренно, чтобы фильтр совпадал с пулом,
  // собранным из его же ответов. « SS25» и «SS25» — разные коллекции, потому что так они и лежат.
  const collection = searchParams.get('collection') || undefined;

  // ?category=<id>, validated as a positive integer only — NOT against the dictionary. On a shared
  // link the dictionary is often still in flight, and rejecting a well-formed id because its name
  // has not arrived yet would silently widen the list instead of narrowing it.
  const categoryId = useMemo(() => {
    const id = Number(searchParams.get('category'));
    return Number.isInteger(id) && id > 0 ? id : undefined;
  }, [searchParams]);

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteTechCards(
      {
        name: name.trim() || undefined,
        stage: stage === ALL_STAGES ? undefined : stage,
        purpose: purpose === TECH_CARD_PURPOSE_ALL ? undefined : purpose,
        skuSeason: season,
        collection,
        // One id whatever level it came from: the server matches category_id OR top/sub/type.
        categoryIds: categoryId ? [categoryId] : undefined,
      },
      LIMIT,
    );
  const { ref, inView } = useInView({ rootMargin: '200px' });
  const [pendingDelete, setPendingDelete] = useState<{ id: number; label: string } | null>(null);

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Every filter is now server-side, so `total` is the true matching count and this reads
  // "loaded of matching".
  const techCards = useMemo(() => data?.pages.flatMap((page) => page.techCards) ?? [], [data]);
  const total = data?.pages[0]?.total ?? techCards.length;

  // The facet is "seasons seen so far", not "every season on file" — there is no list-seasons RPC,
  // so the only source is the rows that have come back. It must accumulate ACROSS filter changes
  // precisely because the query is server-filtered: once a season is picked the pages carry only
  // that season, and a pool rebuilt from them would collapse to the one option already chosen.
  const [seasonPool, setSeasonPool] = useState<common_SkuSeason[]>([]);
  useEffect(() => {
    const found = techCards
      .map((tc) => tc.skuSeason)
      .filter((s): s is common_SkuSeason => !!s?.code && !!s?.year);
    if (found.length === 0) return;
    setSeasonPool((prev) => {
      const seen = new Map<string, common_SkuSeason>(prev.map((s) => [seasonParam(s), s]));
      let changed = false;
      for (const s of found) {
        const key = seasonParam(s);
        if (!seen.has(key)) {
          seen.set(key, s);
          changed = true;
        }
      }
      if (!changed) return prev;
      return [...seen.values()].sort(
        (a, b) => (b.year ?? 0) - (a.year ?? 0) || String(a.code).localeCompare(String(b.code)),
      );
    });
  }, [techCards]);

  // Пул коллекций — та же идиома, что и у сезонов, и по той же причине: RPC «перечисли коллекции
  // тех-карт» не существует, а словарь коллекций НЕ ГОДИТСЯ в источник — карты с рукописными и
  // архивными именами в нём отсутствуют намеренно, и фасет из словаря сделал бы их нефильтруемыми.
  // Единственный источник — строки, которые уже пришли. Копится ПОПЕРЁК смены фильтров: как только
  // коллекция выбрана, страницы несут только её, и пул, пересобранный из них, схлопнулся бы до
  // одного уже выбранного пункта.
  // Ключ — СЫРАЯ строка: ни trim, ни приведения регистра. Два имени, различающиеся только краевым
  // пробелом, — две разные коллекции в базе, и слить их здесь значило бы отправить на сервер то,
  // чего он не найдёт.
  const [collectionPool, setCollectionPool] = useState<string[]>([]);
  useEffect(() => {
    const found = techCards.map((tc) => tc.collection).filter((c): c is string => !!c);
    if (found.length === 0) return;
    setCollectionPool((prev) => {
      const seen = new Set(prev);
      let changed = false;
      for (const c of found) {
        if (!seen.has(c)) {
          seen.add(c);
          changed = true;
        }
      }
      if (!changed) return prev;
      return [...seen].sort((a, b) => a.localeCompare(b));
    });
  }, [techCards]);

  const collectionOptions = useMemo(
    () => collectionPool.map((c) => ({ value: c, label: collectionLabel(c) })),
    [collectionPool],
  );

  // ПУЛ НЕПОЛОН, ПОКА НЕ ДОКРУЧЕНЫ ВСЕ СТРАНИЦЫ, и молчаливый неполный список хуже отсутствующего:
  // человек увидел бы пять коллекций и решил, что других нет. Поэтому две вещи разом — сноска под
  // пунктами ЧЕСТНО называет, из чего список собран и чего в нём ещё нет, а кнопка рядом даёт
  // ДОБРАТЬ остаток одним кликом. Добор — явное действие оператора, а не фон: страницы тянутся
  // тем же бесконечным запросом, что и лист, так что заодно рисуются и плитки.
  const [completingPool, setCompletingPool] = useState(false);
  // Предохранитель от вечного цикла: провалившийся fetchNextPage оставляет hasNextPage=true, и
  // эффект бился бы в него бесконечно. Считаем ПОПЫТКИ, а не страницы.
  const poolAttempts = useRef(0);
  useEffect(() => {
    if (!completingPool) return;
    if (!hasNextPage || poolAttempts.current >= MAX_POOL_PAGES) {
      setCompletingPool(false);
      return;
    }
    if (!isFetchingNextPage) {
      poolAttempts.current += 1;
      fetchNextPage();
    }
  }, [completingPool, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const seasonOptions = useMemo(() => {
    const pool = [...seasonPool];
    if (season && !pool.some((s) => seasonParam(s) === seasonParam(season))) pool.unshift(season);
    return pool.map((s) => ({ value: seasonParam(s), label: seasonLabel(s) }));
  }, [seasonPool, season]);

  // The whole tree is offerable because category_ids matches at ANY level — "outerwear" (top) and
  // "parka" (type) are both single-id picks, so the client never has to expand a branch. Walked
  // depth-first so the popover reads as the tree it is; the depth cap also stops a cyclic parentId.
  const categoryOptions = useMemo(() => {
    const cats = dictionary?.categories ?? [];
    const out: PickerOption[] = [];
    const walk = (c: common_Category, depth: number) => {
      const id = c.id ?? 0;
      out.push({ value: String(id), label: c.name ?? `#${id}`, depth });
      if (!id || depth >= 2) return;
      for (const child of getCategoriesByParentId(cats, id)) walk(child, depth + 1);
    };
    for (const c of cats) if (c.level === 'top_category') walk(c, 0);
    return out;
  }, [dictionary?.categories]);

  const categoryLabel = useMemo(
    () => (dictionary?.categories ?? []).find((c) => c.id === categoryId)?.name,
    [dictionary?.categories, categoryId],
  );

  // Purpose narrows whenever it is actually sent — which includes the DEFAULT (sellable). That is the
  // honest reading of the empty state: with 30 auxiliary cards on file and none sellable, "no tech
  // cards" was a lie, and "nothing matches these filters" points at the chip that is hiding them.
  // Only `all` — the one value that filters nothing — leaves the list un-narrowed.
  const narrowed =
    !!season ||
    !!categoryId ||
    stage !== ALL_STAGES ||
    !!name.trim() ||
    !!collection ||
    purpose !== TECH_CARD_PURPOSE_ALL;

  // One request, on an explicitly destructive action: the cascade counts come off the full card.
  const pendingCard = useTechCard(pendingDelete?.id);
  const cascade = pendingCard.data?.techCard;

  function confirmDelete() {
    if (!pendingDelete) return;
    deleteTechCard.mutate(pendingDelete.id, {
      onSuccess: () => showMessage('tech card deleted', 'success'),
      onError: (error) =>
        showMessage(error instanceof Error ? error.message : 'Failed to delete tech card', 'error'),
    });
    setPendingDelete(null);
  }

  return (
    <div className='flex flex-col gap-2.5'>
      {/* 6.4 — one chip bar. Every filter is a chip; what is narrowing the list is literally
          readable, and an active one is removable in a single click. */}
      <Toolbar>
        <div className='min-w-[150px] flex-1'>
          <Input
            name='name'
            value={name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            placeholder='search name / style №'
            aria-label='search tech cards'
          />
        </div>
        <ChipRow>
          <PickerChip
            title='purpose'
            // Название ОПЦИИ, а не голое значение URL: чип показывал «all», не называя, ЧЕМУ это
            // «all» — и владелец не увидел фильтра aux/не-aux, который тут всё это время был.
            label={purposeLabel}
            selected
            options={techCardPurposeFilterOptions.map((o) => ({ value: o.value, label: o.label }))}
            // The default stays OUT of the URL (a clean ?-less link is the full list); sellable and
            // auxiliary are written explicitly, so a narrowed view survives a reload and a share.
            onSelect={(v) => setParam('purpose', v === DEFAULT_PURPOSE ? undefined : v)}
          />
          {stage === ALL_STAGES ? (
            <PickerChip
              title='stage'
              label='+ stage'
              options={techCardStageOptions.map((o) => ({ value: o.value, label: o.label }))}
              onSelect={(v) => setParam('stage', v)}
            />
          ) : (
            <Chip selected onRemove={() => setParam('stage', undefined)}>
              {stageLabel(stage)}
            </Chip>
          )}
          {!season ? (
            seasonOptions.length > 0 && (
              <PickerChip
                title='season'
                label='+ season'
                options={seasonOptions}
                onSelect={(v) => setParam('season', v)}
              />
            )
          ) : (
            <Chip selected onRemove={() => setParam('season', undefined)}>
              {seasonLabel(season)}
            </Chip>
          )}
          {!collection ? (
            collectionOptions.length > 0 && (
              <PickerChip
                title='collection'
                label='+ collection'
                options={collectionOptions}
                onSelect={(v) => setParam('collection', v)}
                footer={
                  hasNextPage ? (
                    <>
                      <Text size='micro' variant='label'>
                        {`names come from the ${techCards.length} of ${total} rows loaded — a collection that appears only further down the list is not offered yet`}
                      </Text>
                      <button
                        type='button'
                        disabled={completingPool}
                        onClick={() => {
                          poolAttempts.current = 0;
                          setCompletingPool(true);
                        }}
                        className='mt-1 w-full border border-textColor py-0.5 disabled:opacity-50'
                      >
                        <Text size='control' component='span' className='uppercase'>
                          {completingPool
                            ? 'loading…'
                            : `load the remaining ${Math.max(total - techCards.length, 0)}`}
                        </Text>
                      </button>
                    </>
                  ) : (
                    <Text size='micro' variant='label'>
                      {`all ${total} matching rows are loaded — these are every collection named in them`}
                    </Text>
                  )
                }
              />
            )
          ) : (
            <Chip selected onRemove={() => setParam('collection', undefined)}>
              {collectionLabel(collection)}
            </Chip>
          )}
          {!categoryId ? (
            categoryOptions.length > 0 && (
              <PickerChip
                title='category'
                label='+ category'
                options={categoryOptions}
                onSelect={(v) => setParam('category', v)}
              />
            )
          ) : (
            <Chip selected onRemove={() => setParam('category', undefined)}>
              {categoryLabel || `#${categoryId}`}
            </Chip>
          )}
        </ChipRow>
        <ToolbarSpacer />
        <Text size='micro' variant='label' className='tabular-nums'>
          {techCards.length} of {total}
        </Text>
      </Toolbar>

      {isLoading ? (
        <div className='flex justify-center py-20'>
          <Text variant='label' className='animate-pulse uppercase'>
            loading tech cards…
          </Text>
        </div>
      ) : isError ? (
        <div className='flex justify-center py-20'>
          <Text variant='label' className='uppercase'>
            failed to load tech cards — refresh to retry
          </Text>
        </div>
      ) : techCards.length === 0 ? (
        <div className='flex justify-center py-20'>
          {/* The purpose chip is ALWAYS set to something, so `narrowed` is true in the default view
              too — and "nothing matches these filters" alone would read as a mystery on a genuinely
              empty database. Naming the chip makes one sentence true in both cases: the list is
              empty AND here is the filter that is deciding what counts. */}
          <Text variant='label' className='uppercase'>
            {narrowed
              ? `nothing matches these filters — purpose is «${purpose}»${
                  // Коллекция названа В КАВЫЧКАХ и целиком: краевой пробел в имени HTML при
                  // отрисовке схлопнул бы, и « SS25» стало бы неотличимо от «SS25» — ровно та
                  // пара, на которой пустой лист и выглядит необъяснимым.
                  collection ? `, collection is «${collection}»` : ''
                }`
              : 'no tech cards'}
          </Text>
        </div>
      ) : (
        // 6.1 — thumbnail cards. A style with no sketch still gets a tile; the striped
        // placeholder is the point.
        <Tiles min={140}>
          {techCards.map((tc) => {
            const id = tc.id ?? 0;
            return (
              <TechCardTile
                key={id}
                card={tc}
                action={
                  <div className='flex items-center gap-1'>
                    <ColorwayBadge card={tc} />
                    {canEdit ? (
                      <Button
                        type='button'
                        size='xs'
                        variant='secondary'
                        aria-label='delete tech card'
                        className='bg-bgColor'
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          setPendingDelete({
                            id,
                            label: tc.styleNumber || tc.name || '',
                          });
                        }}
                      >
                        ✕
                      </Button>
                    ) : null}
                  </div>
                }
              />
            );
          })}
        </Tiles>
      )}

      {hasNextPage && (
        <div ref={ref} className='flex justify-center py-4'>
          {isFetchingNextPage && (
            <Text size='micro' variant='label' className='uppercase'>
              loading more…
            </Text>
          )}
        </div>
      )}

      {/* 6.5 — show exactly what dies, then make the hand type the style number. Slow on purpose. */}
      {pendingDelete && (
        <ConfirmationModal
          open
          width='sm'
          onOpenChange={(open) => !open && setPendingDelete(null)}
          onConfirm={confirmDelete}
          title={pendingDelete.label ? `delete ${pendingDelete.label}?` : 'delete tech card'}
          confirmLabel='delete'
          cancelLabel='cancel'
          typeToConfirm={pendingDelete.label || undefined}
        >
          {pendingCard.isLoading ? (
            <Text size='micro' variant='label' className='uppercase'>
              loading what this deletes…
            </Text>
          ) : pendingCard.isError ? (
            <Text size='micro' variant='label' className='uppercase'>
              could not read the card contents — everything under it still cascades
            </Text>
          ) : (
            <>
              <Row label='BOM articles' value={cascade?.bomItems?.length ?? 0} />
              <Row label='colourways & recipes' value={pendingCard.data?.colorways?.length ?? 0} />
              <Row
                label='sign-offs · issues'
                value={`${cascade?.signoffs?.length ?? 0} · ${cascade?.issues?.length ?? 0}`}
              />
            </>
          )}
          <Text size='micro' variant='label' className='mt-2 uppercase'>
            all of it cascades and this cannot be undone
          </Text>
        </ConfirmationModal>
      )}
    </div>
  );
}

// Live colourway count, off the list row (batched server-side, no N+1). Zero is a real fact — an
// un-coloured style cannot be sampled or sold — so it is shown, not hidden; `mut` like every other
// neutral classification keeps it from shouting. Suppressed for auxiliary items (dust bags,
// shoppers), which have no colourways at all, so "0" there would be noise rather than a state.
function ColorwayBadge({ card }: { card: common_TechCardListItem }) {
  if (card.purpose === 'TECH_CARD_PURPOSE_AUXILIARY') {
    // 0252: an aux card has no colourways, but it CAN produce in several colours — one warehouse
    // bucket each. That is a different fact from a colourway (stock, not an article), so it gets its
    // own word rather than being folded into "cw". Counts ACTIVE variants only, like the server:
    // the badge answers "what can this card produce", not "what has ever existed". Zero stays
    // suppressed — a single-output aux card is the normal case, not a state worth a badge.
    const colours = card.outputVariantCount ?? 0;
    if (colours === 0) return null;
    return (
      <Pill
        tone='mut'
        title='colour variants of the output'
        className='pointer-events-none bg-bgColor'
      >
        {colours} {colours === 1 ? 'colour' : 'colours'}
      </Pill>
    );
  }
  // proto3 omits a zero on the wire, so absent and 0 are the same fact.
  const count = card.colorwayCount ?? 0;
  return (
    <Pill tone='mut' title='live colourways' className='pointer-events-none bg-bgColor'>
      {count} cw
    </Pill>
  );
}

/**
 * Подпись имени коллекции. Имя кладётся на провод СЫРЫМ, но показывать его сырым нельзя: HTML при
 * отрисовке схлопывает краевые пробелы, и « SS25» на экране выглядело бы как «SS25» — два разных
 * фильтра, неотличимых глазом. Поэтому имя с краевым пробелом берётся в кавычки, внутри которых
 * пробел становится внутренним и виден. Подпись НИЧЕГО не меняет в значении — оно уходит сырым.
 */
function collectionLabel(name: string): string {
  return name === name.trim() ? name : `«${name}»`;
}

/** `depth` indents a tree level in the popover (category); flat facets leave it unset. */
type PickerOption = { value: string; label: string; depth?: number };

const OPTION_INDENT = ['', 'pl-2', 'pl-4'];

/**
 * An inactive facet (`+ stage`) or a fixed-value one (purpose) — a chip that opens a small popover
 * of values. The chip itself is a non-interactive `span` so it can sit inside the popover's own
 * trigger button; an ACTIVE removable filter is a plain `Chip … onRemove` instead, never this.
 */
function PickerChip({
  title,
  label,
  selected,
  options,
  onSelect,
  footer,
}: {
  title: string;
  label: string;
  selected?: boolean;
  options: PickerOption[];
  onSelect: (value: string) => void;
  /**
   * Сноска под пунктами — для фасета, чей список значений НЕПОЛОН по устройству (коллекция
   * собирается из загруженных строк листа). Здесь же живёт кнопка добора: сноска называет, чего в
   * списке ещё нет, кнопка это чинит. Пункта фасета из неё не делается — она вне цикла options и
   * поповер не закрывает.
   */
  footer?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <GenericPopover
      open={open}
      onOpenChange={setOpen}
      title={title}
      triggerProps={{ 'aria-label': `filter by ${title}` }}
      openElement={
        <Chip selected={selected} dashed={!selected}>
          {label}
        </Chip>
      }
    >
      <div className='flex flex-col'>
        {options.map((o) => (
          <button
            key={o.value}
            type='button'
            onClick={() => {
              onSelect(o.value);
              setOpen(false);
            }}
            className={`w-full border-b border-hairline py-1 text-left last:border-b-0 ${
              OPTION_INDENT[o.depth ?? 0] ?? ''
            }`}
          >
            <Text size='control' component='span' className='uppercase'>
              {o.label}
            </Text>
          </button>
        ))}
        {footer && <div className='mt-1.5 border-t border-hairline pt-1.5'>{footer}</div>}
      </div>
    </GenericPopover>
  );
}
