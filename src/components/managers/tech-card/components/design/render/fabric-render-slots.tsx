import type {
  DesignBenchSlotRef,
  GetDesignBandResponse,
  common_MediaFull,
} from 'api/proto-http/admin';
import { useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { mediaFullToViewerItem } from 'ui/components/media-viewer';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { Tiles } from 'ui/components/tiles';

import { BenchSlot, InertDoor } from '../bench-slot';
import { shelfBatchOrdinals } from '../handles';
import { newClientRequestId, useDesignWrites } from '../use-design-band';
import { viewLabel } from '../views';
import { renderPlacements, slotOrigin, slotOriginLine, threedSides } from './model';
import { uploadItem } from '../upload-item';

/**
 * ═══ FABRIC RENDER SLOTS — четыре независимых слота ФАБРИК-РЕНДЕРА, по одному на сторону ══════
 *
 * Владелец (J-25), дословно: «в FABRIC RENDER делаем FLAT SLOTS только для FABRIC RENDER SLOTS
 * отдельные независимые слоты именно для фабрик рендеров которые можно заполнять в разделе
 * RENDERS OF THIS CARD и там же можно и сплитить их».
 *
 * ═══ НОВОЙ ТАБЛИЦЫ ЗДЕСЬ НЕТ, И ЭТО ОТВЕТ, А НЕ ЭКОНОМИЯ ══════════════════════════════════════
 *
 * «Отдельные независимые слоты» уже существуют: верстак с круга 14 двухосный (view × kind,
 * миграция 0349) и с круга 14 же поколорвейный (0356). Рендер-слот — это строка `design_bench_slot`
 * с `kind='render'` и `colorway_id` этого колорвея, и её независимость от флэтового слота той же
 * стороны держит СЕРВЕР: род входит в ключ исключительности, а `picture.kind` сверяется с
 * `slot.kind` при каждой постановке (`wrong_kind`). То есть рендер не может встать во флэтовый
 * слот и наоборот — по ОТКАЗУ, а не по дисциплине клиента.
 *
 * Единственная обязанность клиента — та, которую полоса уже держит: КАЖДЫЙ писатель СПЕЛЛИТ
 * `kind: 'render'` и никогда не полагается на «пустое значит flat».
 *
 * ═══ ПОЧЕМУ ЭТО ТОТ ЖЕ ОРГАН, ЧТО FLAT SLOTS, А НЕ ПОЛОСА ВХОДА ═══════════════════════════════
 *
 * Владелец назвал предмет по имени соседа — «делаем FLAT SLOTS, только для рендеров», — и это же
 * говорит PRODUCT.md правилом «one editor grammar»: `Tiles` из четырёх плит `BenchSlot`, те же
 * углы (✕ очищает сторону, зум в общий ряд студии), та же подпись происхождения, та же дверь
 * `+ add front` у пустой. Человек, знающий флэтовый верстак, знает и этот.
 *
 * ЧЕГО У ЭТОГО ВЕРСТАКА НЕТ, И КАЖДОЕ — ПО ПРИЧИНЕ, А НЕ ПО ЗАБЫВЧИВОСТИ:
 *   · деталей (`NewDetailCell`) — деталь это ВЫНОСКА ЧЕРТЕЖА, её читает лист и тех-пак; рендер
 *     детали не печатается нигде, и слот под неё был бы ящиком без читателя;
 *   · `MixWarn` — предупреждение о СМЕСИ ПРОИСХОЖДЕНИЙ плит листа, а лист собирается из флэтов;
 *   · угла `edit ▸` — векторный редактор пишет слой штрихов над ЧЕРТЕЖОМ (довод у пропа
 *     `editable` в `bench-slot.tsx`);
 *   · второй двери у пустой плиты («or mark a picture from the band») — J-15 снял её у флэтов, а
 *     вторая дверь этого слота стоит этажом выше: `mark ▸` на плитке в «renders of this card».
 *
 * ═══ ПОРЯДОК НА ЭКРАНЕ: СЛОТЫ ПОСЛЕ ВЫХОДОВ ══════════════════════════════════════════════════
 *
 * Блок стоит ПОД «renders of this card», потому что заполняется ИЗ него — то же «сначала
 * материал, потом сборка», по которому флэтовый верстак стоит под лентой (`studio-tab.tsx`).
 * Разделителя между блоками не рисуется: 24px грунта и есть разделитель (DESIGN.md).
 */
export function FabricRenderSlots({
  band,
  techCardId,
  disabled,
  colorwayId = 0,
  colorwayLabel = '',
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
  /**
   * ЧЕЙ ЭТО ВЕРСТАК. Ровно то число, под которым 3D его читает и отправляет — состояние студии
   * (`useColorwayChoice`), одно на весь экран. Два источника этого числа дали бы студию, где
   * вход показывает одно, а прогон собирается из другого.
   */
  colorwayId?: number;
  colorwayLabel?: string;
}): JSX.Element {
  const writes = useDesignWrites(techCardId);
  const sides = useMemo(() => threedSides(band, colorwayId), [band, colorwayId]);
  const shelfOrdinals = useMemo(() => shelfBatchOrdinals(band.batches ?? []), [band.batches]);
  /** Кадры карточки, которым есть куда встать: только ПУСТЫЕ стороны. Довод — в `./model`. */
  const placements = useMemo(() => renderPlacements(band, colorwayId), [band, colorwayId]);

  /** Для какой стороны идёт запись. Общий `isPending` сказал бы «saving» на всех четырёх. */
  const [busy, setBusy] = useState<string | null>(null);
  const [filling, setFilling] = useState(false);
  /**
   * ИСХОД ПОСЛЕДНЕГО НАЖАТИЯ ДВЕРИ — какие стороны встали и какие нет, с причинами.
   *
   * Состоянием, а не всплывашкой: вопрос «какие стороны у меня теперь новые» человек задаёт,
   * глядя на четыре плиты, и ответ обязан стоять рядом с ними, пока он не нажмёт снова.
   */
  const [outcome, setOutcome] = useState<{
    done: string[];
    failed: { view: string; reason: string }[];
  } | null>(null);

  const filled = sides.filter((side) => !!side.picture).length;

  /** Адрес стороны на ЭТОМ верстаке. Род спеллится всегда — пустое поле читается сервером как flat. */
  /* ⚠ `slotId` ОТСУТСТВУЕТ НАМЕРЕННО, и это не небрежность. Он в одном `oneof` с `viewKey`;
     ноль в proto-JSON — ЗАДАННОЕ поле, второй член выбивает первый, и сервер отвергает запись
     с «oneof admin.DesignBenchSlotRef.slot is already set». Так эти слоты не наполнялись НИ
     РАЗУ с выпуска. Образец — `bench.tsx`, где ссылка всегда была без него. */
  const sideRef = (view: string): DesignBenchSlotRef => ({
    viewKey: view,
    kind: 'render',
    colorwayId,
  });

  const unmark = (view: string, slotRev: number) => {
    setBusy(view);
    writes.setBenchSlot.mutate(
      // `picture_id = 0` — ОСВОБОДИТЬ сторону, ничего не удаляя: плита остаётся на карточке и
      // остаётся в списке «renders of this card», откуда её можно поставить снова.
      { slot: sideRef(view), pictureId: 0, expectedSlotRev: slotRev },
      { onSettled: () => setBusy(null) },
    );
  };

  /**
   * ФАЙЛ ИЗ МЕДИАТЕКИ ПРЯМО В ПУСТУЮ СТОРОНУ — одной транзакцией (J-17, тот же жест, что у флэтов).
   *
   * `RegisterDesignUpload` заводит медиа в полосу И кладёт картинку в названный слот, поэтому
   * карточка не может остаться ни с плитой без строки, ни с загруженным файлом, который никуда не
   * встал. Поля названы поимённо и каждое — УТВЕРЖДЕНИЕ:
   *   · `kind: 'render'` — под заголовком «fabric render slots» приезжает рендер; пустое значило
   *     бы flat, и сервер отверг бы постановку по роду;
   *   · `colorwayId` — принесённый руками рендер это рендер КАКОГО-ТО цвета, и восстановить какого
   *     из пикселей нельзя ничем; дверь стоит внутри верстака выбранного колорвея и называет его;
   *   · `ghostView` — сторона, которую человек ТОЛЬКО ЧТО назвал, положив файл именно сюда;
   *   · `expectedSlotRev` — ревизия строки, прочитанная ЭТИМ рендером: чужая правка той же стороны
   *     обязана отказать, а не молча вытеснить плиту;
   *   · `clientRequestId` минтится ОДИН раз на намерение: повтор со свежим ключом сервер честно
   *     завёл бы второй пачкой.
   */
  const placeMedia = (media: common_MediaFull, view: string, expectedSlotRev: number) => {
    const mediaId = media.id ?? 0;
    if (!mediaId) return;
    setBusy(view);
    writes.registerUpload.mutate(
      {
        clientRequestId: newClientRequestId(),
        items: [uploadItem({ mediaId, ghostView: view, kind: 'render', colorwayId })],
        target: sideRef(view),
        expectedSlotRev,
      },
      { onSettled: () => setBusy(null) },
    );
  };

  /**
   * ═══ ЗАПОЛНИТЬ ПУСТЫЕ СТОРОНЫ КАДРАМИ КАРТОЧКИ — ОДНИМ ЖЕСТОМ ═══════════════════════════════
   *
   * Настоящий путь владельца: разрезал склеенный лист в «renders of this card» на четыре кадра —
   * и хочет, чтобы они встали по своим сторонам. Четыре выпадающих списка подряд для этого —
   * работа, которую машина умеет сделать сама, потому что каждый кадр СВОЮ сторону уже несёт
   * (`ghost_view`, её ставит сервер в транзакции разреза).
   *
   * ПОСЛЕДОВАТЕЛЬНО И ПО ОДНОМУ СЛОТУ: глагол верстака адресует РОВНО ОДИН слот, батча нет и
   * заведён он не будет (решение сервера). CAS у каждой стороны свой, читается ДО первой записи,
   * и стороны между собой не пересекаются — чужой токен ни одна из этих записей не трогает.
   *
   * ОТКАЗ ОДНОЙ СТОРОНЫ НЕ ОСТАНАВЛИВАЕТ ОСТАЛЬНЫЕ. Полноценной транзакции здесь быть не может,
   * значит выбор между двумя НЕПОЛНЫМИ исходами, и он не симметричен: стороны независимы, отказ на
   * `back` (сосед сдвинул её `slot_rev`) не говорит ничего о `side L`, а брошенный цикл оставляет
   * БОЛЬШЕ пустого, а не меньше. Отката нет и по той же причине: снятие уже поставленной стороны —
   * такая же запись, она может так же отказать, а «вернуть как было» она не умеет вовсе.
   *
   * ⚠ ВЫТЕСНИТЬ ЭТА ДВЕРЬ НЕ МОЖЕТ ПО ПОСТРОЕНИЮ — `renderPlacements` смотрит только на ПУСТЫЕ
   * стороны. Поэтому у неё нет ни абзаца «что будет вытеснено», ни разбора спора за сторону:
   * подпись кнопки исчерпывает то, что она делает. Замена стороны осталась отдельным жестом —
   * `mark ▸` на самой плитке, где видно, что именно вытесняется.
   */
  const fillEmpty = async () => {
    if (!placements.length || filling) return;
    setFilling(true);
    setOutcome(null);
    const done: string[] = [];
    const failed: { view: string; reason: string }[] = [];
    for (const placement of placements) {
      try {
        await writes.setBenchSlot.mutateAsync({
          slot: sideRef(placement.view),
          pictureId: placement.picture.id ?? 0,
          expectedSlotRev: placement.slotRev,
        });
        done.push(placement.view);
      } catch (error) {
        // ПРИЧИНА БЕРЁТСЯ С ОТКАЗА, А НЕ СОЧИНЯЕТСЯ: слова сервера («slot_rev mismatch», род кадра,
        // чужой колорвей) — единственное, из чего человек поймёт, повторять ему жест или нет.
        failed.push({
          view: placement.view,
          reason: (error as Error)?.message?.trim() || 'the server refused without saying why',
        });
      }
    }
    setFilling(false);
    // Полный успех не рапортуется: он ВИДЕН — стороны заполнились, счётчик дошёл до 4 of 4, дверь
    // исчезла. Полоса «всё хорошо» под уже случившимся хорошим учит не читать полосы.
    setOutcome(failed.length ? { done, failed } : null);
  };

  const named = colorwayLabel.trim();
  const fillTitle = `${placements
    .map((p) => viewLabel(p.view))
    .join(', ')} take the newest render of this card that names them. A side that already holds a render is not touched.`;

  return (
    <Section
      /* ЯКОРЬ ОБЪЯВЛЕН, потому что об этом блоке делаются утверждения ОТСУТСТВИЯ (его нет на 3D и
         на ON MODEL), а утверждение об отсутствии стоит ровно столько, сколько стоит объявленная
         коробка, по которой его можно проверить. Класс для этого не годится: он переживает правку
         смысла и оставляет пробу зелёной над сломанным экраном. */
      id='design-render-bench'
      title='fabric render slots'
      /* ВОПРОС И СЧЁТ — БЕЗ ДУБЛЕЙ (круг 17, F-14). «…3D is built from these and from nothing
         else» и «front is what 3D needs» повторяли то, что уже сказано на самой плите FRONT
         («3D cannot start without it») и в шапке зеркала на 3D; это тот же верстак, и оба его
         экрана теперь говорят одно и то же одинаково коротко. */
      question={
        named
          ? `— the render of ${named}, one per side; the input of 3D`
          : '— the render of this card, one per side; the input of 3D'
      }
      action={
        <span className='flex items-center gap-3'>
          <Text size='micro' variant='label' component='span' className='uppercase'>
            {filled} of 4
          </Text>
          {/* ⚠ ДВЕРЬ ЗАПОЛНЕНИЯ НА ЧИТАЕМОЙ КАРТОЧКЕ РИСУЕТСЯ ИНЕРТНОЙ С ПРИЧИНОЙ, а не пропадает:
              предмет есть (кадры лежат и называют свои стороны), нет ПРАВА, — и это разные вещи.
              Пропадающая дверь учит, что механизма нет вовсе. */}
          {placements.length > 0 &&
            (disabled ? (
              <InertDoor
                label={`fill ${placements.length} empty side${placements.length === 1 ? '' : 's'} ▸`}
                reason='this card is read-only for you — putting a render into a side is an edit of the card'
              />
            ) : (
              <Button
                variant='secondary'
                size='xs'
                loading={filling}
                onClick={fillEmpty}
                title={fillTitle}
              >
                fill {placements.length} empty side{placements.length === 1 ? '' : 's'} ▸
              </Button>
            ))}
        </span>
      }
    >
      {/* ТА ЖЕ СЕТКА И ТОТ ЖЕ ШАГ, ЧТО У FLAT SLOTS (`Tiles min={190}`) — «one editor grammar» из
          PRODUCT.md, а не совпадение числа. Обёртка вокруг плиты законна: `Tiles` вешает
          `min-w-0` на ДЕТЕЙ грида, поэтому дорожка держит ширину и с ней. */}
      <Tiles min={190}>
        {sides.map((side) => {
          const origin = slotOrigin(band, side);
          const line = slotOriginLine(origin);
          return (
            <div key={side.view} className='flex min-w-0 flex-col gap-1'>
              <BenchSlot
                band={band}
                techCardId={techCardId}
                slotRef={sideRef(side.view)}
                slot={side.slot}
                label={viewLabel(side.view)}
                picture={side.picture}
                slotRev={side.slotRev}
                /* ОБЯЗАТЕЛЕН ТОЛЬКО ФРОНТ, И ТРЕБОВАНИЕ — СЕРВЕРНОЕ. `no_front_render` отвергает
                   прогон ДО резерва; остальные три стороны прогон не отвергают вовсе, и красное
                   слово на них учило бы пролистывать красное. */
                required={side.view === 'front'}
                requiredNote='3D cannot start without it'
                saving={busy === side.view}
                picking={false}
                disabled={disabled}
                shelfOrdinals={shelfOrdinals}
                /* ВЕКТОРНЫЙ РЕДАКТОР ЗДЕСЬ НЕ ОТКРЫВАЕТСЯ — довод у пропа в `bench-slot.tsx`. */
                editable={false}
                onPlaceMedia={(media) => placeMedia(media, side.view, side.slotRev)}
                onCancelPick={() => {}}
                onUnmark={() => unmark(side.view, side.slotRev)}
                galleryItem={
                  side.picture?.media
                    ? mediaFullToViewerItem(side.picture.media as common_MediaFull)
                    : undefined
                }
              />
              {/* ═══ ЧТО ИМЕННО СТОИТ В СТОРОНЕ — СО ШТАМПА СЛОТА, А НЕ С ЛЕНТЫ ═══════════════
                  Ревизия рендера и род прогона едут на самой строке верстака (`run_rrev`,
                  `run_kind`, круг 15). До них ответ выводился постраничным поиском прогона и на
                  плите старше двенадцати строк ленты молчал — то есть чаще всего.
                  Строка появляется, только когда ей есть что сказать: `r3`, либо признание, что
                  плита пришла не из фабрик-рендера. Пустая подпись под каждой плитой была бы
                  четырьмя строками шума на самом частом состоянии. */}
              {side.picture && line && (
                <Text
                  size='nano'
                  component='span'
                  data-slot-origin={`${side.view}:${origin.runKind || 'none'}:${origin.rrev}`}
                  className={origin.foreign ? 'text-warning' : 'text-labelColor'}
                >
                  {line}
                </Text>
              )}
            </div>
          );
        })}
      </Tiles>

      {outcome && (
        <CalloutBox tone='error'>
          <Text size='micro' component='p' className='normal-case'>
            <b>
              {outcome.done.length} of {outcome.done.length + outcome.failed.length} sides took a
              render.
            </b>{' '}
            {outcome.done.length > 0 && <>Now filled: {outcome.done.map(viewLabel).join(', ')}. </>}
            {outcome.failed.length === 1 ? 'This one did not: ' : 'These did not: '}
            {outcome.failed.map((f) => `${viewLabel(f.view)} — ${f.reason}`).join('; ')}. Nothing was
            undone: the sides are separate slots, and taking a good one back would be another write
            that can fail in its turn. Press the door again — it now offers only what is left.
          </Text>
        </CalloutBox>
      )}
    </Section>
  );
}
