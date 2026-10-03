import type {
  GetDesignBandResponse,
  common_AdminColorwayRef,
  common_DesignAsset,
  common_DesignRun,
} from 'api/proto-http/admin';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import { Placeholder } from 'ui/components/placeholder';
import Text from 'ui/components/text';

import { ASSET_NAME_MAX, assetFull, assetLabel, assetThumb } from '../assets/model';
import { useAssetBindingWrites, useAssetWrites } from '../assets/use-assets';
import { BENCH_CELL_STYLE } from '../bench-slot';
import { serverSpeaksDesign } from '../capability';
import { archivedRef, colorwayLabel } from '../colorway-picker';
import { AskModal, EmptyState } from '../core';
import { PictureTile, type PictureTileMenuItem } from '../picture-tile';
import { SEAM_WORDS, patternOutputs, refusalAdvice, seamWarningOf } from './model';
import { PendingTile, TiledFace } from './organs';
import {
  NO_BINDINGS_REASON,
  READ_ONLY_SHELF_REASON,
  SILENT_SERVER_REASON,
  boundAssetsByPair,
  clothTwin,
  pairKey,
  pairsOfAsset,
  recentFabrics,
  runTraceNote,
  type ClothSlot,
} from './slot-fabrics';

/**
 * ═══ LAST FABRICS — ОДНА ИСТОРИЯ ШАГА, И ЭТО КАРУСЕЛЬ (владелец, 2026-09-26) ═══════════════════
 *
 * Дословно: «история IMAGE TO FABRIC — только каруселью последних сгенерённых тканей», и ревью
 * (B5) довело это до правила всего шага: ОДИН орган истории. Здесь стояли две полки («tiles on this
 * card» и «made earlier, not kept»), под шагом — общий блок GENERATION HISTORY, и на рядах слотов
 * планировалась третья полоса «made for this slot». Всё это одно и то же — ткани карточки, — и
 * теперь оно стоит одной полосой: новейшие первыми, живые прогоны перед ними.
 *
 * НА ПЛИТКЕ ДВА УГЛА, И ОБА — В КАДРЕ (T17, 20-TILE-SPEC §3: «nothing under a tile except a
 * cap»): внизу справа — выбор `use for ▾` и последним `rename`. Выбор
 * — плоский список пар «колорвей · слот» (у одного колорвея — просто слоты): угол примитива
 * двухшаговых списков не держит, а пар на карточке единицы. Пишет `SetDesignAssetBinding`: этим же
 * жестом возвращают на слот свотч, который новый прогон с него сместил. Крупный вид — нажатием на
 * саму картинку. Под кадром — одна подпись, имя ткани, как имя слота под плиткой FLAT SLOTS (TF5).
 *
 * `✕` НА ПЛИТКЕ НЕТ (TF2): по всей полосе `✕` значит «убрать из этого блока, ничего не теряя», а
 * снять ткань с полки — удалить её с карточки и из хранилища. Отсоединять отсюда нечего, поэтому
 * удаление — последняя красная строка меню, `delete…` (без пар меню называется `more ▾` и держит
 * только её), и оно ВСЕГДА спрашивает. Надетая ткань уносит привязки с собой (FK ON DELETE
 * CASCADE), и эти слоты остаются без ткани в рендере — вопрос говорит об этом словами.
 *
 * ГДЕ ТКАНЬ В РЕНДЕРЕ — ДВУМЯ МЕРАМИ (UX-проход, U-5; TF5). Ярлык лица говорит только факт —
 * `in render`; КАКИЕ пары её носят («ROSSO · outer, OLIVE · outer», без повторов), говорит `title`
 * плитки и имени. Серая нано-строка под именем снята (TF5): под плиткой стоит одна подпись, имя.
 * Угловой ярлык в 80px ширины обрезал адрес до «IN RENDER · R…», поэтому пары — не на нём.
 *
 * НА СЕРВЕРЕ БЕЗ ПРИВЯЗОК (`bindings = false`) КАРУСЕЛЬ ТА ЖЕ, минус то, чего там нет: `use for ▸`
 * не появляется (повод — в `title` плитки), а «in render» и строка пар не рисуются — надеть ткань на
 * слот такой сервер не умеет, и сказать «она в рендере» было бы неправдой. Крупный вид, `rename` и `more ▾ → delete…`
 * работают: полка старше привязок.
 */
export function FabricCarousel({
  band,
  techCardId,
  disabled,
  bindings,
  colorways,
  slots,
  live,
  making,
  failed,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  /** Сервер говорит привязками (`bindingsSpoken`): без них нет ни `use for ▸`, ни «in render». */
  bindings: boolean;
  /**
   * Колорвеи, которые экран рисует рядами: ось композитора, из архивных — только дошедшие до шага
   * и носящие привязки (архив с одними привязками сюда не доходит — ревью m-5).
   */
  colorways: common_AdminColorwayRef[];
  slots: ClothSlot[];
  /**
   * Живые прогоны, у которых нет своей ячейки на экране: «картинка → ткань» и свотчи пар, чей ряд
   * не нарисован. Свотч нарисованной пары ждут в её ячейке — второй «идёт прогон» на тот же прогон
   * читался бы как два прогона.
   */
  live: common_DesignRun[];
  /**
   * Пары (`pairKey`), чей свотч делается прямо сейчас: лист `use for ▸` помечает их «making…» (U-6)
   * — так же, как «replaces» помечает одетую пару, — потому что надетое сейчас сменит посадка.
   */
  making: ReadonlySet<string>;
  /**
   * Новейший прогон «картинка → ткань», кончившийся без ткани (`runTraces`, ревью M-1): пунктирная
   * плитка в голове полосы, пока его не сменит новый прогон. Следы пар сюда не едут — у них ряд.
   */
  failed: common_DesignRun | null;
}): JSX.Element {
  const fabrics = useMemo(() => recentFabrics(band), [band]);
  const byPair = useMemo(() => boundAssetsByPair(band), [band]);
  /** Шов меряется на ПОПЫТКЕ прогона (`seamWarningOf`), а плитка держит медиа — сверка по медиа. */
  const seamByMedia = useMemo(() => {
    const m = new Map<number, boolean>();
    for (const { picture, run } of patternOutputs(band)) {
      const mediaId = picture.media?.id ?? 0;
      if (mediaId > 0 && !m.has(mediaId)) m.set(mediaId, seamWarningOf(run));
    }
    return m;
  }, [band]);
  /** Надеть можно только на живой колорвей: архивный — «новой работы под ним не делают». */
  const wearable = useMemo(() => colorways.filter((c) => !archivedRef(c)), [colorways]);
  const names = useMemo(() => {
    const cw = new Map<number, string>();
    for (const c of colorways) cw.set(c.colorwayId ?? 0, colorwayLabel(c));
    const slot = new Map<number, string>();
    for (const s of slots) slot.set(s.bomItemId, s.name);
    return { cw, slot };
  }, [colorways, slots]);

  /* ═══ ДВЕРИ ‹ › — ТОЛЬКО КОГДА ПОЛОСА ПРАВДА НЕ ВЛЕЗЛА ═════════════════════════════════════════
     Прокрутка колесом и тачпадом у полосы есть всегда; двери нужны мыши без горизонтального
     колеса. Нарисованные на полосе из трёх плиток, они обещали бы продолжение, которого нет. */
  const strip = useRef<HTMLDivElement | null>(null);
  const [overflow, setOverflow] = useState(false);
  const count = fabrics.length + live.length + (failed ? 1 : 0);
  /* ⚠ ПЕРЕМЕР — НА СМЕНЕ САМИХ ПЛИТОК, А НЕ ИХ ЧИСЛА (ревью m-6). Удалили одну, на её место из
     глубины полки въехала тринадцатая — число то же, эффект по `count` молчал. Поэтому зависимости —
     списки, а наблюдатель смотрит и на полосу, и на каждую плитку: плитка, выросшая после декода
     картинки или после переименования, двигает `scrollWidth` без единого рендера здесь. */
  useEffect(() => {
    const el = strip.current;
    if (!el) {
      setOverflow(false);
      return;
    }
    const measure = () => setOverflow(el.scrollWidth > el.clientWidth + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => ro.disconnect();
  }, [fabrics, live, failed]);
  const scroll = (dir: -1 | 1) => {
    const el = strip.current;
    if (!el) return;
    const still =
      typeof window !== 'undefined' &&
      !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({
      left: dir * Math.max(el.clientWidth * 0.8, 150),
      behavior: still ? 'auto' : 'smooth',
    });
  };

  return (
    <div data-fabric-carousel='' className='mt-5 flex min-w-0 flex-col gap-2'>
      <div className='flex min-h-[18px] items-center gap-2'>
        <Text size='micro' variant='label' tracking='label' component='span' className='uppercase'>
          last fabrics
        </Text>
        {overflow && (
          <div className='ml-auto flex items-center gap-1'>
            <Button
              variant='secondary'
              size='xs'
              aria-label='scroll the last fabrics back'
              title='scroll back'
              onClick={() => scroll(-1)}
            >
              ‹
            </Button>
            <Button
              variant='secondary'
              size='xs'
              aria-label='scroll the last fabrics on'
              title='scroll on'
              onClick={() => scroll(1)}
            >
              ›
            </Button>
          </div>
        )}
      </div>

      {count === 0 ? (
        <EmptyState>
          no fabric on this card yet — a swatch made on a slot above, or a fabric extracted here,
          lands in this strip
        </EmptyState>
      ) : (
        /* `-mx-1 px-1`: плитки стоят по одной вертикали с ячейкой фото над ними, а обводке фокуса
           у крайней плитки (`use for ▸` у самого края) есть 4px, где полоса её не обрежет. */
        <div
          ref={strip}
          className='-mx-1 flex min-w-0 snap-x snap-mandatory scroll-px-1 gap-3 overflow-x-auto px-1 py-2'
        >
          {live.map((r) => (
            <div
              key={r.id ?? `live-${r.startedAt ?? r.createdAt ?? ''}`}
              style={BENCH_CELL_STYLE}
              className='snap-start'
            >
              <PendingTile startedAt={r.startedAt ?? r.createdAt} aspect='1/1' />
            </div>
          ))}
          {failed && <FailedTile run={failed} />}
          {fabrics.map((a) => (
            <FabricTile
              key={a.id}
              asset={a}
              band={band}
              techCardId={techCardId}
              disabled={disabled}
              bindings={bindings}
              seam={seamByMedia.get(a.mediaId ?? 0) === true}
              wearable={wearable}
              slots={slots}
              byPair={byPair}
              making={making}
              names={names}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * СЛЕД ПРОГОНА «КАРТИНКА → ТКАНЬ», НЕ ДАВШЕГО ТКАНИ (ревью M-1) — пунктирная плитка той же меры,
 * что живая, на её же месте: «здесь должна была лечь ткань, и вот почему не легла». Пунктир и
 * серое слово, не красный: исход назван словом («failed · CODE»), а красный в этой админке — убыток
 * там, где он точно есть. Двери у плитки нет ни одной: повтор — та же `extract fabric` выше, а
 * исчезает плитка сама, когда новейшим прогоном этого вида станет другой. Полный исход и совет —
 * в `title` (у провайдера бывают абзацы; плитка 138px их не держит).
 */
function FailedTile({ run }: { run: common_DesignRun }): JSX.Element {
  const note = runTraceNote(run);
  const advice = refusalAdvice(`${run.errorCode ?? ''} ${run.lastError ?? ''}`);
  const name = (run.params?.pattern?.name ?? '').trim() || 'extracted fabric';
  return (
    <div
      data-fabric-failed={run.id ?? ''}
      style={BENCH_CELL_STYLE}
      className='flex snap-start flex-col gap-1'
      title={[note.full, advice].filter(Boolean).join(' — ')}
    >
      <Placeholder dashed aspect='square' className='w-full px-2'>
        <span className='flex min-w-0 flex-col items-center gap-0.5 text-center'>
          <Text size='micro' variant='label' component='span' className='normal-case'>
            no fabric from the last extract
          </Text>
          {/* The code IS the news here, so it wraps rather than being cut to «PROVIDER_TIM…». */}
          <Text size='nano' variant='label' component='span' className='max-w-full break-words'>
            {note.line}
          </Text>
        </span>
      </Placeholder>
      <Text
        size='micro'
        variant='uppercase'
        tracking='label'
        component='span'
        className='min-w-0 truncate font-bold'
      >
        {name}
      </Text>
    </div>
  );
}

function FabricTile({
  asset,
  band,
  techCardId,
  disabled,
  bindings,
  seam,
  wearable,
  slots,
  byPair,
  making,
  names,
}: {
  asset: common_DesignAsset;
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  bindings: boolean;
  seam: boolean;
  wearable: common_AdminColorwayRef[];
  slots: ClothSlot[];
  byPair: Map<string, common_DesignAsset>;
  making: ReadonlySet<string>;
  names: { cw: Map<number, string>; slot: Map<number, string> };
}): JSX.Element {
  const { upsertAsset, deleteAsset } = useAssetWrites(techCardId);
  const { setBinding } = useAssetBindingWrites(techCardId);
  const speaks = serverSpeaksDesign();
  const writesOff = !!disabled || !speaks;
  const offReason = disabled ? READ_ONLY_SHELF_REASON : SILENT_SERVER_REASON;

  const id = asset.id ?? 0;
  const label = assetLabel(asset);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(label);
  const [asking, setAsking] = useState(false);
  const twin = renaming ? clothTwin(band, name, id) : undefined;

  /* ГДЕ ЭТА ТКАНЬ В РЕНДЕРЕ — пары, которые её носят, словами. Пара, чей колорвей или слот экран не
     рисует (архивный колорвей, не дошедший до шага; строка ушла из рулонного товара), называется
     числом: привязка есть на сервере, и промолчать о ней значило бы удалить её вслепую. */
  const worn = useMemo(
    () =>
      (bindings ? pairsOfAsset(band, id) : []).map(
        (p) =>
          `${names.cw.get(p.colorwayId) ?? `colourway #${p.colorwayId}`} · ${
            names.slot.get(p.bomItemId) ?? `line #${p.bomItemId}`
          }`,
      ),
    [bindings, band, id, names],
  );
  /** Пары словами, без повторов (два слота с одним именем у одного колорвея — одна строка). */
  const wornLine = useMemo(() => [...new Set(worn)].join(', '), [worn]);

  /* ВЫБОР `use for ▾`: пары «колорвей · слот» одним списком. У пары — что с ней станет: «making…»
     — для пары прямо сейчас делается свотч, и его посадка сменит всё, что надето сейчас (U-6);
     текущая (●) — уже эта ткань; «replaces» — у пары есть другая, и она сменится (сама она
     остаётся здесь, в карусели). Один колорвей — имя колорвея не повторяется в каждой строке. */
  const useFor: PictureTileMenuItem[] = useMemo(() => {
    if (slots.length === 0) return [];
    const one = wearable.length === 1;
    return wearable.flatMap((c) => {
      const cw = c.colorwayId ?? 0;
      const cwName = colorwayLabel(c);
      return slots.map((s) => {
        const current = byPair.get(pairKey(cw, s.bomItemId));
        const mine = (current?.id ?? 0) === id;
        const inFlight = making.has(pairKey(cw, s.bomItemId));
        const note = inFlight ? 'making…' : !mine && current ? 'replaces' : '';
        return {
          value: `${cw}:${s.bomItemId}`,
          label: (
            <>
              {one ? s.name : `${cwName} · ${s.name}`}
              {note && <span className='text-labelColor'>{` · ${note}`}</span>}
            </>
          ),
          current: mine,
          title: inFlight
            ? `a swatch for ${cwName} · ${s.name} is being made — when it lands it becomes the fabric of this slot, in place of whatever is chosen now`
            : mine
              ? `${label} is already the fabric of ${cwName} · ${s.name}`
              : current
                ? `${label} becomes the fabric of ${cwName} · ${s.name} instead of ${assetLabel(current)} — that one stays here`
                : `${label} becomes the fabric of ${cwName} · ${s.name}`,
        };
      });
    });
  }, [slots, wearable, byPair, making, id, label]);
  /** Почему выбора нет — словами; стоит в `title` плитки, угла без действия на кадре нет. */
  const useForOff = writesOff
    ? offReason
    : !bindings
      ? NO_BINDINGS_REASON
      : useFor.length === 0
        ? wearable.length === 0
          ? 'no live colourway on this card yet — add one on the COLOURWAYS tab'
          : 'no fabric slot on this card yet — state the cloths on the MOODBOARD step and save'
        : '';

  /**
   * RENAME IS `UpsertDesignAsset` WITH EVERY FIELD ECHOED. Upsert REPLACES the row: a field not
   * named arrives as zero and wipes what was saved — `media_id` (the fabric would stop being a
   * picture), `repeat_mm`, the colour the swatch was dyed from, the parentage. Neither the legacy
   * colourway nor the slot bindings are echoed, and they cannot be: the upsert's SET list names
   * neither, exactly so a rename survives both.
   */
  const rename = () => {
    const next = name.trim().slice(0, ASSET_NAME_MAX);
    if (!next || next === label) {
      setRenaming(false);
      setName(label);
      return;
    }
    upsertAsset.mutate(
      {
        assetId: id,
        kind: asset.kind ?? '',
        name: next,
        mediaId: asset.mediaId ?? 0,
        colourCode: asset.colourCode ?? '',
        colourHex: asset.colourHex ?? '',
        note: asset.note ?? '',
        derivedFromAssetId: asset.derivedFromAssetId ?? 0,
        repeatMm: asset.repeatMm ?? 0,
        rotationDeg: asset.rotationDeg ?? 0,
        ordinal: asset.ordinal ?? 0,
      },
      { onSettled: () => setRenaming(false) },
    );
  };
  const toggleRename = () => {
    if (renaming) rename();
    else {
      setName(label);
      setRenaming(true);
    }
  };
  /** TF2: delete is ALWAYS asked — one question, the worn slots named when there are any. */
  const offerDelete = !writesOff;
  const menuItems: PictureTileMenuItem[] = [
    ...(useForOff ? [] : useFor),
    ...(offerDelete
      ? [
          {
            value: DELETE_ITEM,
            label: 'delete…',
            tone: 'danger' as const,
            title: `delete ${label} from this card for good`,
          },
        ]
      : []),
  ];
  const pairsOffered = !useForOff;

  const full = assetFull(asset);
  const thumb = assetThumb(asset) || full;

  return (
    <div
      data-fabric-tile={id}
      /* Якорь двери пар остался на плитке: выбор теперь угол её кадра (`data-menu`). */
      data-fabric-use-for={id}
      style={BENCH_CELL_STYLE}
      className='flex snap-start flex-col gap-1'
      title={
        [worn.length ? `in FABRIC RENDER for ${wornLine}` : '', seam ? SEAM_WORDS : '', useForOff]
          .filter(Boolean)
          .join(' · ') || undefined
      }
      /* Где ткань в рендере — в `title` (TF5); якорь говорит пробам, что пары есть. */
      data-fabric-worn-by={worn.length ? id : undefined}
    >
      {/* ОДНА ПЛИТКА НА ОБА СЛУЧАЯ: без картинки примитив сам рисует кадр «no image», а углы —
          те же. Переименовать и удалить такую строку надо тем более (именно она чаще всего и есть
          ошибка), и у неё теперь те же места, что у любой другой. */}
      <PictureTile
        url={full}
        alt={label}
        aspect='1/1'
        className='w-full'
        face={full ? <TiledFace url={full} alt={label} /> : undefined}
        gallery={full ? { src: full, thumbnail: thumb, type: 'image', alt: label } : undefined}
        /* ФАКТЫ — ВЕРХ СЛЕВА. `in render` — ярлык чернилами, тем же, что `in` у плиток CLOTHS
           рендера (`render/palette.tsx`): тот же факт на соседнем экране. Шов — флаг под ним,
           серый, не красный: шов, который видно, — факт о картинке, а не потеря (довод — в
           `title` плитки). Прежде шов стоял углом сверху, а `in render` — снизу слева, где на
           наведении в него въезжал ряд `use for ▾ · rename`. */
        badge={worn.length > 0 ? <span data-fabric-worn={worn.length}>in render</span> : undefined}
        flag={seam ? { word: 'seam', tone: 'mut', title: SEAM_WORDS } : undefined}
        menu={
          menuItems.length
            ? {
                label: pairsOffered ? 'use for' : 'more',
                ariaLabel: pairsOffered
                  ? `use ${label} for a colourway’s slot`
                  : `more for ${label}`,
                title: pairsOffered
                  ? 'make this the fabric of a colourway’s slot — it goes into FABRIC RENDER for that colourway'
                  : undefined,
                items: menuItems,
                pending: setBinding.isPending || deleteAsset.isPending,
                'data-menu': pairsOffered ? `use-for:${id}` : `more:${id}`,
                onPick: (value) => {
                  if (value === DELETE_ITEM) return setAsking(true);
                  const [colorwayId, bomItemId] = value.split(':').map(Number);
                  if (!(colorwayId > 0) || !(bomItemId > 0)) return;
                  if ((byPair.get(pairKey(colorwayId, bomItemId))?.id ?? 0) === id) return;
                  setBinding.mutate({ colorwayId, bomItemId, assetId: id });
                },
              }
            : undefined
        }
        onEdit={{
          onClick: toggleRename,
          ariaLabel: renaming ? `save the new name of ${label}` : `rename ${label}`,
          title: writesOff
            ? offReason
            : 'the render prompt cites this fabric BY NAME, so «IMG_4471» reaches the model as the name of the cloth',
          disabled: writesOff,
          pending: upsertAsset.isPending,
        }}
        editLabel={renaming ? 'done' : 'rename'}
      />

      {renaming ? (
        <div className='flex flex-col gap-0.5'>
          <Input
            name={`fabric-name-${id}`}
            value={name}
            maxLength={ASSET_NAME_MAX}
            autoFocus
            aria-label='new name for this fabric'
            placeholder='twill repeat'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent) => {
              // Enter/Escape are not letters: `e.key` is layout-independent for them.
              if (e.key === 'Enter') rename();
              if (e.key === 'Escape') {
                setRenaming(false);
                setName(label);
              }
            }}
          />
          {/* ADVICE, NOT A GATE: an old row is being corrected, not a new one filed. */}
          {twin && (
            <Text size='nano' variant='label' component='span' data-rename-twin=''>
              another fabric on this card already carries this name
            </Text>
          )}
        </div>
      ) : (
        <Text
          size='micro'
          variant='uppercase'
          tracking='label'
          component='span'
          className='min-w-0 truncate font-bold'
          title={worn.length ? `${label} — worn by ${wornLine}` : label}
        >
          {label}
        </Text>
      )}
      <AskModal
        open={asking}
        title={worn.length > 0 ? 'delete a fabric in use' : 'delete a fabric'}
        sentence={
          worn.length > 0 ? (
            <>
              {label} is the fabric of {worn.join(', ')}. Deleting it takes it off{' '}
              {worn.length === 1 ? 'that slot' : 'those slots'} — they stand without a fabric in
              FABRIC RENDER until another one is made or chosen.
            </>
          ) : (
            <>{label} leaves this card for good.</>
          )
        }
        verb='delete the fabric'
        onClose={() => setAsking(false)}
        onDo={() => {
          setAsking(false);
          deleteAsset.mutate(id);
        }}
      />
    </div>
  );
}

/** The menu's delete row: no `colourway:slot` pair can be spelled this way. */
const DELETE_ITEM = '__delete';
