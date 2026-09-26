import type {
  GetDesignBandResponse,
  common_AdminColorwayRef,
  common_DesignRun,
  common_MediaFull,
} from 'api/proto-http/admin';
import { useRef, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import Text from 'ui/components/text';

import { ASSET_PATTERN } from '../assets/model';
import { useAssetWrites } from '../assets/use-assets';
import { InertDoor } from '../bench-slot';
import { serverSpeaksDesign } from '../capability';
import { GROUP_GAP, Reason } from '../core';
import { RunRefusal } from '../render/generate-row';
import { useStartDesignRun } from '../render/use-design-run';
import { FabricCarousel } from './fabric-carousel';
import { refusalAdvice } from './model';
import { PatternInput } from './pattern-input';
import {
  READ_ONLY_RUN_REASON,
  SILENT_SERVER_REASON,
  imageGate,
  mintFabricName,
  type ClothSlot,
  type ShelfCeiling,
} from './slot-fabrics';

/**
 * ═══ IMAGE TO FABRIC — ФОТОГРАФИЯ → БЕСШОВНАЯ ТКАНЬ, И ПОД НЕЙ ИСТОРИЯ ШАГА ═══════════════════
 *
 * Владелец (2026-09-26): «отдельный блок: загрузить картинку → Image to Fabric; его история — только
 * каруселью последних тканей; ткань из карусели можно назначить любому (колорвей, слот)».
 *
 * ЭТО СЕГОДНЯШНИЙ ПРОГОН ШАГА, ПЕРЕЕХАВШИЙ В СВОЮ ГРУППУ, А НЕ НОВЫЙ: `kind = pattern`, режим
 * пустой (картинка), ровно одна фотография в `extra_input_media_ids`, `colorwayId: 0` — ткань
 * встаёт на полку ничьей и надевается на пары дверью `use for ▸` в карусели. Имя — `fabric N`,
 * минтится (D5): поле NAME снято, переименовывают на плитке.
 *
 * ГЛАГОЛ ДРУГОЙ, ЧЕМ У РЯДОВ СЛОТОВ, НАМЕРЕННО: `generate` там делает свотч из ЦВЕТА, здесь
 * `extract fabric` вынимает ткань из ФОТОГРАФИИ. Одно слово на два разных прогона читалось бы как
 * одна кнопка, стоящая дважды.
 *
 * ДЕНЕГ НА ЭТОЙ ДВЕРИ НЕ ПИШЕТСЯ: строка денег одна на весь блок и стоит в его шапке.
 */
export function ImageToFabric({
  band,
  techCardId,
  disabled,
  colorways,
  slots,
  live,
  making,
  failed,
  ceiling,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  colorways: common_AdminColorwayRef[];
  slots: ClothSlot[];
  /** Живые прогоны без своей ячейки на экране — карусель ставит их первыми. */
  live: common_DesignRun[];
  /** Пары (`pairKey`), чей свотч сейчас делается, — пометка «making…» в `use for ▸` (U-6). */
  making: ReadonlySet<string>;
  /** Новейший прогон «картинка → ткань», если он кончился без ткани (`runTraces`, ревью M-1). */
  failed: common_DesignRun | null;
  /** Потолок полки — один ответ на обе двери шага (`shelfCeiling`, ревью m-2). */
  ceiling: ShelfCeiling;
}): JSX.Element {
  const run = useStartDesignRun(techCardId);
  const { upsertAsset } = useAssetWrites(techCardId);
  const speaks = serverSpeaksDesign();
  const [source, setSource] = useState<common_MediaFull | null>(null);
  /**
   * ОТКАЗ ПОСАДКИ ИЗ ГАЛЕРЕИ — СВОИМ СОСТОЯНИЕМ, А НЕ `upsertAsset.isError`: ошибка react-query
   * живёт до следующей мутации, а блок при смене карточки не размонтируется (инвариант 12), и отказ
   * по снимку карточки A стоял бы под ячейкой карточки B.
   */
  const [fileRefusal, setFileRefusal] = useState('');

  /* ═══ КАРТОЧКА СМЕНИЛАСЬ — ЗАГОТОВКА ПРОГОНА НАЧИНАЕТСЯ ЗАНОВО, В ТЕЛЕ РЕНДЕРА ════════════════
     Фотография в ячейке — вход ПЛАТНОГО прогона, а блок не ключуется карточкой. Оставленная, она
     встала бы на экран карточки B, ворота открылись бы, и `extract fabric` ушёл бы с чужим входом
     на счёт этой карточки. Не в эффекте: эффект оставил бы один закоммиченный кадр с новой
     карточкой и старым входом, а один кадр — это одно нажатие. Образец — `generation-history.tsx`
     (`shownCard`); отказ и леджер прогона сбрасывает сам `useStartDesignRun` тем же приёмом. */
  const shownCard = useRef(techCardId);
  if (shownCard.current !== techCardId) {
    shownCard.current = techCardId;
    if (source) setSource(null);
    if (fileRefusal) setFileRefusal('');
  }

  const sourceId = source?.id ?? 0;
  const gate = imageGate(sourceId, ceiling, speaks);
  const advice = run.refusal ? refusalAdvice(run.refusal.words) : '';

  /**
   * НИЖНЯЯ ПОЛОВИНА ЯЧЕЙКИ: снимок, который УЖЕ плитка, встаёт на полку как есть — `UpsertDesignAsset`
   * с `asset_id = 0`, без прогона и без денег (владелец, 2026-09-07). Имя минтится тем же `fabric N`,
   * что у прогона рядом: две двери одной группы не называют свои ткани двумя словарями.
   * `repeatMm: 0` — «раппорт не назван»: этот снимок никто не мерил.
   */
  const fileFromGallery = (media: common_MediaFull) => {
    const mediaId = media.id ?? 0;
    if (mediaId <= 0) return;
    setFileRefusal('');
    upsertAsset.mutate(
      { assetId: 0, kind: ASSET_PATTERN, name: mintFabricName(band), mediaId, repeatMm: 0 },
      {
        /* ДОСЛОВНО И РЯДОМ С ДВЕРЬЮ: всплывашка хука живёт секунды, а на этот отказ человек обязан
           подействовать (выбрать другой снимок). */
        onError: (error: unknown) =>
          setFileRefusal(
            (error as Error)?.message?.trim() || 'the fabric did not go onto the shelf',
          ),
      },
    );
  };

  /* ЧЕСТНАЯ ДВЕРЬ ИЛИ НИКАКОЙ: половина гаснет ровно там, где сервер откажет (потолок полки —
     серверный, `refuseFullShelf`). */
  const galleryInert = !speaks ? SILENT_SERVER_REASON : ceiling.full ? ceiling.reason : '';

  const extract = () =>
    run.start({
      kind: 'pattern',
      ask: '',
      params: {
        // A fabric has no side of a garment: the list is empty EXPLICITLY, and the server checks it.
        views: [],
        // NOBODY'S: the extracted fabric lands on the shelf unbound; `use for ▸` dresses a slot.
        colorwayId: 0,
        layout: '',
        // Image mode states no colour: the photograph IS the colour, and a code beside it would
        // be a second, competing instruction.
        colour: undefined,
        threed: undefined,
        fixTarget: '',
        // The field says «extra»; here it carries the ONE photograph the fabric is extracted from,
        // and the server refuses any other count (`one_source_picture`).
        extraInputMediaIds: [sourceId],
        fixTargets: [],
        fixSlotIds: [],
        autoSplit: false,
        detailSlotIds: [],
        // THE REPEAT TRAVELS AS A LITERAL ZERO (the density is the model's, J-12); the name is
        // minted from the SHELF, never from live runs — see `mintSlotName` for why that is money.
        pattern: {
          repeatMm: 0,
          name: mintFabricName(band),
          sourceAssetId: 0,
          mode: '',
          bomItemId: 0,
        },
        // НЕ ПЛЕЙГРАУНД: поле осмысленно только на kind=freeform (`freeform_forbidden` иначе).
        freeform: undefined,
        useFlatSlots: false,
        flatSlotIds: [],
      },
    });

  return (
    <div data-image-to-fabric='' className='min-w-0'>
      <GroupLabel
        flush
        className={GROUP_GAP}
        lead={
          <Text size='micro' variant='label' component='span' className='normal-case'>
            — a seamless fabric out of a photograph
          </Text>
        }
      >
        image to fabric
      </GroupLabel>

      <div className='flex items-start gap-6'>
        <PatternInput
          source={source}
          onPick={setSource}
          onClear={() => setSource(null)}
          onPickFromGallery={fileFromGallery}
          galleryInert={galleryInert}
          galleryPending={upsertAsset.isPending}
          disabled={disabled}
        />
        <div className='flex min-w-0 flex-1 flex-col items-start gap-3'>
          {/* THE SAME MEASURE AS THE ROW `generate` (`xs`, final review m-F): the two paid doors of
              one block are siblings, and the inert door keeps the size of the live one it stands
              in for (F-1), so nothing jumps when the gate opens. */}
          <span data-image-extract={sourceId || 'empty'}>
            {disabled ? (
              <InertDoor label='extract fabric' reason={READ_ONLY_RUN_REASON} />
            ) : gate.ok ? (
              <Button
                variant='secondary'
                size='xs'
                disabled={run.isPending}
                onClick={extract}
                title='extract a seamless fabric from this photograph — it lands in LAST FABRICS below, bound to no slot'
              >
                {run.isPending ? 'starting…' : 'extract fabric'}
              </Button>
            ) : (
              <InertDoor label='extract fabric' reason={gate.reason} />
            )}
          </span>
          {fileRefusal && (
            <span data-gallery-refusal=''>
              <Reason>{fileRefusal}</Reason>
            </span>
          )}
          {/* THE REFUSAL STAYS ON SCREEN AND IS QUOTED VERBATIM (Ф4): the server's words name the
              cause; our half is the advice under them, never instead of them. */}
          <RunRefusal refusal={run.refusal} onDismiss={run.dismissRefusal} />
          {run.refusal && advice && (
            <span data-refusal-advice=''>
              <Reason>{advice}</Reason>
            </span>
          )}
        </div>
      </div>

      <FabricCarousel
        band={band}
        techCardId={techCardId}
        disabled={disabled}
        colorways={colorways}
        slots={slots}
        live={live}
        making={making}
        failed={failed}
      />
    </div>
  );
}
