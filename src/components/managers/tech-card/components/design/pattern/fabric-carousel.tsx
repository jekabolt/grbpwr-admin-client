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
import { BENCH_CELL_STYLE, InertDoor } from '../bench-slot';
import { serverSpeaksDesign } from '../capability';
import { archivedRef, colorwayLabel } from '../colorway-picker';
import { AskModal, EmptyState, TwoStepPicker, type PickerBranch } from '../core';
import { PictureTile } from '../picture-tile';
import { SEAM_WORDS, patternOutputs, patternTwin, seamWarningOf } from './model';
import { CornerLabel, PendingTile, TiledFace } from './organs';
import {
  READ_ONLY_SHELF_REASON,
  SILENT_SERVER_REASON,
  boundAssetsByPair,
  pairKey,
  pairsOfAsset,
  recentFabrics,
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
 * НА ПЛИТКЕ ЧЕТЫРЕ ГЛАГОЛА И НИ ОДНОГО ЛИШНЕГО — те же, что у плиток CLOTHS рендера
 * (`render/palette.tsx`, `TextureGrid`): зум и `✕` в верхнем углу, `rename` в нижнем, и одна
 * дверь под именем — `use for ▸`. Дверь задаёт два вопроса по одному (`TwoStepPicker`: колорвей,
 * потом слот) и пишет `SetDesignAssetBinding`: этим же жестом возвращают на слот свотч, который
 * новый прогон с него сместил.
 *
 * `✕` СПРАШИВАЕТ ТОЛЬКО ТОГДА, КОГДА ЕСТЬ ЧТО ТЕРЯТЬ: ткань, надетая на слоты, уносит привязки с
 * собой (FK ON DELETE CASCADE), и эти слоты остаются без ткани в рендере — об этом говорят словами
 * перед удалением. Ненадетая ткань удаляется сразу: её потеря — одна плитка, видимая здесь же.
 */
export function FabricCarousel({
  band,
  techCardId,
  disabled,
  colorways,
  slots,
  live,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  /** Колорвеи, которые экран рисует рядами (ось композитора, архивные — только с привязками). */
  colorways: common_AdminColorwayRef[];
  slots: ClothSlot[];
  /**
   * Живые прогоны, у которых нет своей ячейки на экране: «картинка → ткань» и свотчи пар, чей ряд
   * не нарисован. Свотч нарисованной пары ждут в её ячейке — второй «идёт прогон» на тот же прогон
   * читался бы как два прогона.
   */
  live: common_DesignRun[];
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
  const count = fabrics.length + live.length;
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
    return () => ro.disconnect();
  }, [count]);
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
          {fabrics.map((a) => (
            <FabricTile
              key={a.id}
              asset={a}
              band={band}
              techCardId={techCardId}
              disabled={disabled}
              seam={seamByMedia.get(a.mediaId ?? 0) === true}
              wearable={wearable}
              slots={slots}
              byPair={byPair}
              names={names}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FabricTile({
  asset,
  band,
  techCardId,
  disabled,
  seam,
  wearable,
  slots,
  byPair,
  names,
}: {
  asset: common_DesignAsset;
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  seam: boolean;
  wearable: common_AdminColorwayRef[];
  slots: ClothSlot[];
  byPair: Map<string, common_DesignAsset>;
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
  const twin = renaming ? patternTwin(band, name, id) : undefined;

  /* ГДЕ ЭТА ТКАНЬ В РЕНДЕРЕ — пары, которые её носят, словами. Пара, чей колорвей или слот экран не
     рисует (архив без привязок, строка ушла из рулонного товара), называется числом: привязка есть
     на сервере, и промолчать о ней значило бы удалить её вслепую. */
  const worn = useMemo(
    () =>
      pairsOfAsset(band, id).map(
        (p) =>
          `${names.cw.get(p.colorwayId) ?? `colourway #${p.colorwayId}`} · ${
            names.slot.get(p.bomItemId) ?? `line #${p.bomItemId}`
          }`,
      ),
    [band, id, names],
  );
  const wornLabel =
    worn.length === 0
      ? ''
      : worn.length === 1
        ? `in render · ${worn[0]}`
        : `in render · ${worn.length} slots`;

  /* ДВЕРЬ `use for ▸`: колорвей, потом слот. У листа — что станет с парой: «worn» — уже эта ткань,
     «replaces» — у пары есть другая, и она сменится (сама она остаётся здесь, в карусели). */
  const branches: PickerBranch[] = useMemo(
    () =>
      slots.length === 0
        ? []
        : wearable.map((c) => {
            const cw = c.colorwayId ?? 0;
            const cwName = colorwayLabel(c);
            const dressed = slots.filter((s) => byPair.has(pairKey(cw, s.bomItemId))).length;
            return {
              id: cw,
              label: cwName,
              note: `${dressed}/${slots.length}`,
              title: `${dressed} of ${slots.length} slots of ${cwName} have a fabric`,
              leaves: slots.map((s) => {
                const current = byPair.get(pairKey(cw, s.bomItemId));
                const mine = (current?.id ?? 0) === id;
                return {
                  value: String(s.bomItemId),
                  label: s.name,
                  note: mine ? 'worn' : current ? 'replaces' : '',
                  title: mine
                    ? `${label} is already the fabric of ${cwName} · ${s.name}`
                    : current
                      ? `${label} becomes the fabric of ${cwName} · ${s.name} instead of ${assetLabel(current)} — that one stays here`
                      : `${label} becomes the fabric of ${cwName} · ${s.name}`,
                };
              }),
            };
          }),
    [slots, wearable, byPair, id, label],
  );

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
  const remove = () => {
    if (worn.length > 0) setAsking(true);
    else deleteAsset.mutate(id);
  };

  const full = assetFull(asset);
  const thumb = assetThumb(asset) || full;

  return (
    <div
      data-fabric-tile={id}
      style={BENCH_CELL_STYLE}
      className='flex snap-start flex-col gap-1'
      title={seam ? SEAM_WORDS : undefined}
    >
      {full ? (
        <PictureTile
          url={full}
          alt={label}
          aspect='1/1'
          className='w-full'
          face={<TiledFace url={full} alt={label} />}
          gallery={{ src: full, thumbnail: thumb, type: 'image', alt: label }}
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
          onRemove={{
            onClick: remove,
            ariaLabel: `delete ${label}`,
            title: writesOff ? offReason : `delete ${label}`,
            disabled: writesOff,
            pending: deleteAsset.isPending,
          }}
        >
          {/* THE JOIN, WHERE IT IS SEEN — dashed, not red: a join that shows is a fact about the
              picture, not a loss (the full sentence rides on the tile's title). */}
          {seam && (
            <CornerLabel at='tl' gap data-verdict='join visible'>
              seam
            </CornerLabel>
          )}
          {wornLabel && (
            /* Узкий ярлык: нижний правый угол занят тихим `rename`, и на наведении они бы наехали. */
            <CornerLabel at='bl' className='max-w-[calc(100%-56px)]' data-fabric-worn={worn.length}>
              {wornLabel}
            </CornerLabel>
          )}
        </PictureTile>
      ) : (
        /* БЕЗ КАРТИНКИ УГЛОВ НЕТ — и переименовать и удалить такую строку надо тем более (именно
           она чаще всего и есть ошибка): обе двери стоят рядом под пустым кадром. */
        <>
          <Placeholder aspect='square' className='w-full' label='no image' />
          <div className='flex items-center gap-1'>
            {writesOff ? (
              <InertDoor label='rename' reason={offReason} />
            ) : (
              <>
                <Button
                  variant='secondary'
                  size='xs'
                  loading={upsertAsset.isPending}
                  onClick={toggleRename}
                >
                  {renaming ? 'done' : 'rename'}
                </Button>
                <Button
                  variant='secondary'
                  size='xs'
                  className='ml-auto'
                  aria-label={`delete ${label}`}
                  title={`delete ${label}`}
                  onClick={remove}
                >
                  ✕
                </Button>
              </>
            )}
          </div>
        </>
      )}

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
          title={worn.length ? `${label} — worn by ${worn.join(', ')}` : label}
        >
          {label}
        </Text>
      )}

      <span data-fabric-use-for={id} className='flex'>
        {writesOff ? (
          <InertDoor label='use for ▸' reason={offReason} />
        ) : branches.length === 0 ? (
          <InertDoor
            label='use for ▸'
            reason={
              wearable.length === 0
                ? 'no live colourway on this card yet — add one on the COLOURWAYS tab'
                : 'no fabric slot on this card yet — state the cloths on the MOODBOARD step and save'
            }
          />
        ) : (
          <TwoStepPicker
            face={setBinding.isPending ? 'setting…' : 'use for ▸'}
            title='use for'
            branches={branches}
            branchNoun='colourways'
            leafNoun='slots'
            disabled={setBinding.isPending}
            triggerTitle='make this the fabric of a colourway’s slot — it goes into FABRIC RENDER for that colourway'
            onPick={(colorwayId, value) => {
              const bomItemId = Number(value);
              if (!(bomItemId > 0)) return;
              if ((byPair.get(pairKey(colorwayId, bomItemId))?.id ?? 0) === id) return;
              setBinding.mutate({ colorwayId, bomItemId, assetId: id });
            }}
          />
        )}
      </span>

      <AskModal
        open={asking}
        title='delete a fabric in use'
        sentence={
          <>
            {label} is the fabric of {worn.join(', ')}. Deleting it takes it off{' '}
            {worn.length === 1 ? 'that slot' : 'those slots'} — they stand without a fabric in
            FABRIC RENDER until another one is made or chosen.
          </>
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
