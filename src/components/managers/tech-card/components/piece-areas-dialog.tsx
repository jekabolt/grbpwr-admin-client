// «ЗАМЕРИТЬ ПЛОЩАДИ ДЕТАЛЕЙ» — отдельный вход в замер, на вкладке выкроек, по одной ткани.
//
// ЗАЧЕМ ОН НУЖЕН, ЕСЛИ ПЛОЩАДИ УЖЕ ПИШЕТ ДИАЛОГ НОРМЫ. Потому что до этого файла площади можно
// было записать ТОЛЬКО применив норму «по выкройкам», а применяется она на строке рецепта «на
// изделие» — то есть на строке, которой у проблемной карточки нет. Круг замыкался буквально:
// серверная ОЦЕНКА снизу существует ровно для слота, у которого нормы «на изделие» никто не вписал,
// но чтобы дать ей площади, надо было сначала завести такую строку и применить к ней норму — после
// чего оценка уже не нужна. На карточке 38 (девять деталей назначены на ткань, ни одной строки «на
// изделие») это выглядело как «карточка стоит ноль и сделать нечего»; во всей бете таблица площадей
// была пуста.
//
// ЧТО ЭТО ДЕЙСТВИЕ ДЕЛАЕТ И ЧЕГО НЕ ДЕЛАЕТ. Пишет ТОЛЬКО площади деталей (SaveTechCardPieceAreas).
// Ни нормы, ни рецепта, ни единой строки формы карточки оно не трогает: замер — факт о ФАЙЛАХ, и
// смешивать его с деньгами строки означало бы, что «посмотреть геометрию» меняет себестоимость.
//
// КОМПЛЕКТ ДЕТАЛЕЙ БЕРЁТСЯ ИЗ СВЯЗЕЙ БЛОК→ДЕТАЛЬ ЭТОГО СКОУПА, а не из назначения ткани в рецепте,
// и это главное отличие от диалога нормы. Причина не в удобстве: вкладка выкроек не знает колорвея
// (рецепт живёт на колорвее и приезжает отдельным RPC), зато сервер проверяет присланный комплект
// именно против привязок блоков своего скоупа — В ОБЕ СТОРОНЫ. То есть здесь собирается ровно тот
// набор, который сервер и ждёт, а не его приблизительный родственник.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useSnackBarStore } from 'lib/stores/store';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { DataTable } from 'ui/components/data-table';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import type { FabricScope, RollGoodsLine } from './bom-purpose';
import { mmToEngineCm } from './nesting/allowance-units';
import { sizeTokensOf } from './nesting/block-code';
import { dxfNormAreas, nettoLengthCm, type DxfNormPiece } from './nesting/dxf-consumption';
import {
  DxfMeasureConditionsFields,
  useDxfMeasureConditions,
} from './nesting/dxf-measure-conditions';
import {
  pieceAreaSheetsRefusal,
  pieceAreaSizeRangeRefusal,
  publishPieceAreas,
} from './piece-areas';
import { serverKeyOfScope, type ScopeAreaState } from './piece-areas-state';
import type { TechCardFormData } from './schema';

// Ширина ПОДПИСЫВАЕТ то же число, на которое делят. Округление до целого расходилось с делением
// (139.4 читалось как «при 139 см» и подпись утверждала «139 = рулон − 2×кромка»), а полкирпича
// разницы на этой величине — это полпроцента нормы, то есть ровно тот класс, который потом не
// объяснить. Дробная часть печатается только когда она есть.
const fmtWidth = (cm: number) => (Number.isInteger(cm) ? String(cm) : cm.toFixed(1));

type SheetRow = { lineKey?: string; fabricPurpose?: string; bomLineKey?: string };
type AliasRow = { blockName?: string; pieceLineKey?: string };

export default function PieceAreasDialog({
  techCardId,
  scope,
  scopeLabel,
  sheets,
  aliases,
  sizeIds,
  savedSizeIds,
  sizeNameById,
  current,
  sourceDirty = false,
  cuttingWidthCm,
  onClose,
}: {
  /** id карточки; сюда попадает только > 0 — площадям иначе не на чем висеть. */
  techCardId: number;
  /** Скоуп ткани панели: по его ключу ищутся контуры в разобранной пачке. */
  scope: FabricScope<RollGoodsLine>;
  scopeLabel: string;
  /** Листы ЭТОЙ группы — из них выводится серверное имя скоупа и набор, который сверит сервер. */
  sheets: readonly SheetRow[];
  /** Связи блок→деталь этого скоупа, уже отфильтрованные панелью. */
  aliases: readonly AliasRow[];
  /** Ряд размеров ФОРМЫ — по нему и меряют: строка на каждый размер каждой градуируемой детали. */
  sizeIds: number[];
  /**
   * Ряд размеров, СОХРАНЁННЫЙ на сервере. Не для замера, а для сверки с рядом формы: принимает
   * замер сервер по своему ряду, и разойтись эти два ряда могут без единой осознанной правки —
   * см. pieceAreaSizeRangeRefusal. undefined = карточка не прочитана, сверять не с чем.
   */
  savedSizeIds?: number[];
  sizeNameById: Map<number, string>;
  /** Что сервер знает про площади этой ткани сейчас — чтобы повтор замера не выглядел первым. */
  current: ScopeAreaState;
  /**
   * Выкройки или связи блок→деталь правлены и ещё не сохранены (форма грязная по patterns /
   * pieceDxfAliases). Замер тогда НЕ ЗАПУСКАЕТСЯ — см. простыню у плашки ниже.
   */
  sourceDirty?: boolean;
  /**
   * Раскройная ширина скоупа, см — ТОЛЬКО для подписи под таблицей, чтобы порядок величины читался.
   * В расчёт площадей не входит ничем. undefined — ширины нет либо строки скоупа о ней не
   * договорились; тогда длина не печатается вовсе (см. простыню у таблицы).
   */
  cuttingWidthCm?: number;
  /** Диалог монтируется ТОЛЬКО открытым: сам факт монтирования взводит разбор пачки. */
  onClose: () => void;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const { showMessage } = useSnackBarStore();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  // Жив ли ЭТОТ диалог. Нужен только записи: она асинхронна, а `onClose` из пропсов после
  // размонтирования закрывает уже ЧУЖОЙ открытый скоуп.
  const aliveRef = useRef(true);
  useEffect(
    () => () => {
      aliveRef.current = false;
    },
    [],
  );

  // Условия замера — тем же кодом и теми же словами, что у диалога нормы «по выкройкам».
  const conditions = useDxfMeasureConditions(control);

  const pieceRows = (useWatch({ control, name: 'pieces' }) ?? []) as {
    lineKey?: string;
    name?: string;
    piecesPerGarment?: number;
    // Галка «не градуируется» — второй источник того же заявления, что токен UNI в имени блока
    // (см. DxfNormPiece.ungraded). Замер площадей обязан читать её тем же способом, что диалог
    // нормы: иначе два экрана по одной карточке дали бы разные отказы.
    ungraded?: boolean;
  }[];

  // Детали ЭТОГО скоупа: те, у кого есть связь с блоком его чертежа. Дедуп по имени блока — тот же,
  // что в useFabricDxfPieces: одна деталь законно названа несколькими блоками (разные листы), и
  // побеждает первая нашедшаяся связь.
  const pieces = useMemo<DxfNormPiece[]>(() => {
    const byPiece = new Map<string, { block: string; scopeKey: string }[]>();
    for (const a of aliases) {
      const key = (a.pieceLineKey ?? '').trim().toLowerCase();
      const block = (a.blockName ?? '').trim();
      if (!key || !block) continue;
      const list = byPiece.get(key) ?? [];
      if (!list.some((r) => r.block === block)) list.push({ block, scopeKey: scope.key });
      byPiece.set(key, list);
    }
    const out: DxfNormPiece[] = [];
    for (const p of pieceRows) {
      const key = (p.lineKey ?? '').trim().toLowerCase();
      if (!key) continue;
      const refs = byPiece.get(key);
      if (!refs || refs.length === 0) continue;
      out.push({
        name: p.name?.trim() || key,
        lineKey: (p.lineKey ?? '').trim(),
        // Количество на изделие в ПЛОЩАДИ ОДНОГО КОНТУРА не участвует (её умножает читатель), но
        // входит в объяснение разбора ниже — поэтому берётся честное, а не единица.
        perGarment: Math.max(1, Math.round(Number(p.piecesPerGarment ?? 1) || 1)),
        refs,
        ungraded: !!p.ungraded,
      });
    }
    return out;
  }, [aliases, pieceRows, scope.key]);

  const outcome = useMemo(() => {
    if (!conditions.index) return null;
    return dxfNormAreas({
      index: conditions.index,
      pieces,
      // Пусто ПО ПОСТРОЕНИЮ: комплект собран из самих связей, и детали без связи в него не
      // попадают. У диалога нормы иначе — там комплект приходит из назначения ткани в рецепте, и
      // деталь этой ткани, которую забыли связать с блоком, обязана быть НАЗВАНА, иначе площадь
      // изделия молча выйдет неполной. Здесь такой детали просто нет в предмете разговора: замер
      // отвечает за геометрию связанных деталей, а полноту комплекта сверяет сервер — он знает
      // привязки блоков своего скоупа и отвергает расхождение в обе стороны.
      unaliasedPieces: [],
      sizeIds,
      tokensOfSize: (id) => sizeTokensOf(sizeNameById.get(id)),
      contourLayer: conditions.layer,
      allowanceCm: mmToEngineCm(conditions.seamMm) ?? 0,
    });
  }, [conditions.index, conditions.layer, conditions.seamMm, pieces, sizeIds, sizeNameById]);

  // КУДА ПИШЕМ: серверное имя скоупа СО СТОРОНЫ BOM — под ним слот и будет искать площади.
  // Сходятся ли с ним сырые привязки листов, решает общая с диалогом нормы проверка: обе точки
  // входа обязаны отвечать за ОДИН набор листов и писать под ОДИН ключ.
  const scopeKey = serverKeyOfScope(scope);
  const sheetsRefusal = useMemo(() => pieceAreaSheetsRefusal(sheets, scopeKey), [sheets, scopeKey]);

  // ДЕТАЛЬ БЕЗ КЛЮЧА — ЭТО ДЫРА В НАБОРЕ, А НЕ МЕЛОЧЬ. Площадь ложится на деталь по её line_key;
  // у детали, заведённой в форме и ещё не сохранённой, ключа нет, и проекция для сервера её просто
  // не содержит — набор уехал бы неполным, а «полным» его объявили бы мы.
  const unsavedPieces = useMemo(
    () => pieces.filter((p) => !(p.lineKey ?? '').trim()).map((p) => p.name),
    [pieces],
  );

  // НЕПОЛНЫЙ РАЗМЕРНЫЙ НАБОР — ОТКАЗ ПО ВСЕМУ СКОУПУ. `dxfNormAreas` отдаёт ok и для случая, когда
  // деталь нарисована не во всех размерах ряда: норме этого хватает (диалог нормы отдельно требует
  // полного ряда и без него не применяет), а замеру — нет. Записанный набор без размера L выглядел
  // бы на сервере полным, оценка по нему считалась бы заниженной, и заметить это было бы негде.
  const incompleteSizes = outcome?.ok ? outcome.areas.sizesIncompleteWhy : [];

  const sizeName = (id: number) => sizeNameById.get(id) ?? `#${id}`;

  // РЯД ФОРМЫ ПРОТИВ РЯДА СЕРВЕРА — отдельная остановка, потому что расходятся они молча: модалка
  // «↔ детали кроя» заводит размеры из чертежа в форму сама. Правило живёт рядом с публикацией, и
  // судит оно НЕ ряды сами по себе, а то, чем расхождение грозит ЭТОМУ замеру, — поэтому получает
  // его строки: набор из одних безразмерных строк сервер примет при любом ряде.
  //
  // Без useMemo сознательно: это разность двух множеств из единиц элементов, и мемоизация стоила бы
  // дороже самой разности — зато список зависимостей не пришлось бы держать в согласии с `sizeName`.
  const sizeRangeRefusal = pieceAreaSizeRangeRefusal(
    sizeIds,
    savedSizeIds,
    sizeName,
    outcome?.ok ? outcome.areas.pieceRows : [],
  );

  const rows = outcome?.ok ? outcome.areas.rows : [];
  const runnable =
    !!outcome?.ok &&
    !conditions.blocked &&
    !sheetsRefusal &&
    !sizeRangeRefusal &&
    !sourceDirty &&
    unsavedPieces.length === 0 &&
    incompleteSizes.length === 0 &&
    !busy &&
    pieces.length > 0;

  const run = async () => {
    if (!runnable || !outcome?.ok) return;
    setBusy(true);
    const res = await publishPieceAreas({
      techCardId,
      scopeKey,
      sheets: [...sheets],
      areas: outcome.areas.pieceRows,
      contourLayer: conditions.layer,
      seamAllowanceMm: Number(conditions.seamMm) || 0,
      nameOfPiece: (key) => pieces.find((p) => (p.lineKey ?? '').trim() === key)?.name ?? key,
    });
    // ЗАПИСЬ ПЕРЕЖИВАЕТ СВОЙ ДИАЛОГ, ЕСЛИ ЕЙ ПОЗВОЛИТЬ. Закрытие на время записи запрещено (см.
    // guard'ы ниже), но диалог всё равно может исчезнуть — сменилась вкладка, ушёл скоуп из BOM.
    // Тогда ни состояние трогать, ни закрывать НЕЧЕГО: `onClose` здесь уже принадлежит другому
    // открытому скоупу, и вызов закрыл бы ЕГО. Отменить сам запрос нельзя — он уже на сервере, и
    // делать вид, что «отменили», было бы враньём: сброс кэша ниже всё равно покажет правду.
    if (!aliveRef.current) {
      queryClient.invalidateQueries({ queryKey: techCardKeys.detail(techCardId) });
      return;
    }
    setBusy(false);
    if (!res.ok) {
      showMessage(`the areas were not saved: ${res.reason}`, 'error');
      return;
    }
    // Свежесть замера считает СЕРВЕР и отдаёт её на чтении карточки — без этого сброса плитка
    // ткани продолжала бы писать «площади не замерены» над только что записанным замером.
    queryClient.invalidateQueries({ queryKey: techCardKeys.detail(techCardId) });
    showMessage(
      `piece areas saved (${res.stored}) — costing will compute a lower-bound estimate from the piece area`,
      'success',
    );
    onClose();
  };

  return (
    <ConfirmationModal
      open
      // ЗАКРЫТЬ ВО ВРЕМЯ ЗАПИСИ НЕЛЬЗЯ. Запрос уже на сервере, отменить его нечем, и «отмена»,
      // которая на самом деле ничего не отменяет, — худший вид кнопки: оператор уходит уверенный,
      // что замера не было, а замер записался.
      onOpenChange={(o: boolean) => {
        if (!o && !busy) onClose();
      }}
      onConfirm={run}
      onCancel={() => {
        if (!busy) onClose();
      }}
      title={`piece areas · ${scopeLabel}`}
      confirmLabel={busy ? 'saving…' : 'measure and save'}
      confirmDisabled={!runnable}
      closeOnConfirm={false}
    >
      <div className='space-y-2'>
        <CalloutBox tone='note'>
          the area of every cut piece of this fabric is measured from its patterns. ONLY areas are
          written: neither the consumption norm nor the colourway recipe changes. what it buys you —
          costing computes a lower-bound estimate from the piece area: a slot that has cut pieces
          assigned to it gets a price even WITHOUT a “per garment” line — piece area ÷ cutting width.
          this is NET and a lower bound: the waste between pieces is not in it, only a marker knows
          that, and a marker will replace the estimate once there is one. the measurement fully
          replaces the previous one for this fabric.
        </CalloutBox>

        {current.phase !== 'none' && (
          <Text size='nano' variant='label' component='p'>
            {`on the server right now: ${current.pieces} pieces, layer ${
              current.contourLayer || '—'
            }, seam allowance ${current.seamMm || '—'} mm${
              current.phase === 'stale'
                ? ' — the server considers the measurement stale: the patterns or the links changed after it'
                : current.phase === 'partial'
                  ? ` — not every sheet of this fabric has been measured (unmeasured: ${current.missing})`
                  : ''
            }. a new measurement replaces it entirely.`}
          </Text>
        )}

        <DxfMeasureConditionsFields state={conditions} />

        {sheetsRefusal && <CalloutBox tone='warning'>{sheetsRefusal}</CalloutBox>}

        {/* РЯД РАЗМЕРОВ РАЗОШЁЛСЯ С СОХРАНЁННЫМ — ОТКАЗ, И ЕГО НАДО НАЗЫВАТЬ ЗДЕСЬ, А НЕ ОТДАВАТЬ
            СЕРВЕРУ. Сервер такой замер отвергает целиком (`size_not_in_range`), но отказ приходит
            на английском, называет ULID детали вместо размера и ни словом не упоминает
            несохранённую карточку — то есть не даёт сделать ровно то единственное, что нужно. */}
        {sizeRangeRefusal && <CalloutBox tone='warning'>{sizeRangeRefusal}</CalloutBox>}

        {/* НЕСОХРАНЁННЫЙ ИСТОЧНИК — ОТКАЗ, А НЕ ПРИМЕЧАНИЕ, и это не осторожность, а арифметика:
            сопоставление «↔ детали кроя» пишет ТОЛЬКО в форму (setValue), а полноту присланного
            комплекта сервер сверяет против СВОИХ привязок блоков — тех, что лежат в базе. Связи,
            созданные минуту назад и не сохранённые, для него не существуют, и он отвечает
            `scope_has_no_block_links`: «у этого скоупа нет связей блок→деталь». Оператор при этом
            смотрит в модалку, где все блоки связаны, и читает отказ как поломку — он прав, потому
            что отказ описывает не то, что человек видит.

            Это ВТОРОЙ, независимый путь к тому же отказу (первый — легаси-скоуп связей, чинится на
            сервере). Здесь он неустраним ничем, кроме этой остановки: обещать сохранение того, чего
            сервер не может увидеть, нельзя. */}
        {sourceDirty && (
          <CalloutBox tone='warning'>
            the patterns or the block→piece links have been edited and not saved yet. the server
            checks the set against the SAVED links, so it will not count the unsaved ones: if the
            links of this fabric were edited it refuses, citing the absence of block→piece links; if
            the edits touched another fabric the measurement is written, but against the old links.
            there is nothing here to tell those two cases apart, and the cost of the mistake is areas
            recorded for the wrong geometry. save the card and retry the measurement.
          </CalloutBox>
        )}

        {unsavedPieces.length > 0 && (
          <CalloutBox tone='warning'>
            {`these pieces are not saved on the server yet: ${unsavedPieces.join(', ')}. an area lands on a piece by its key, and there is no key yet — the set would travel without them and look complete. save the card and retry the measurement.`}
          </CalloutBox>
        )}

        {/* НЕПОЛНЫЙ РЯД — ОТКАЗ, А НЕ ПРИМЕЧАНИЕ. Отказ называет пару (деталь, размер): искать её
            перебором по чертежу — это то же самое, что не сказать ничего. */}
        {incompleteSizes.length > 0 && (
          <CalloutBox tone='warning'>
            {`the set did not come together for every size in the range, so the measurement is not written at all: ${incompleteSizes
              .map(
                (s) =>
                  `${sizeName(s.sizeId)} — ${s.piece ? `piece “${s.piece}” is missing` : 'zero area'}`,
              )
              .join(
                '; ',
              )}. the server would take a partial set as a complete one, and the estimate from it would be understated by exactly what is missing.`}
          </CalloutBox>
        )}

        {pieces.length === 0 && (
          <CalloutBox tone='warning'>
            no cut piece is linked to a drawing block of this fabric — there is nothing to measure.
            link them with the “↔ cut pieces” button right here: the block→piece link is exactly what
            makes an area land on a piece.
          </CalloutBox>
        )}

        {/* Отказ расчёта — дословно. Кроме случая «деталей нет вовсе»: про него плашка выше
            говорит адреснее (куда идти связывать), и печатать оба значило бы сказать одно дважды. */}
        {outcome && !outcome.ok && pieces.length > 0 && (
          <CalloutBox tone='warning'>{outcome.reason}</CalloutBox>
        )}

        {outcome?.ok && rows.length > 0 && (
          <>
            <DataTable variant='grid' className='[&_td]:text-micro'>
              <thead>
                <tr>
                  <th>size</th>
                  <th>garment area, cm²</th>
                  <th>m²</th>
                  {/* Погонная длина — САМАЯ ПОНЯТНАЯ ИЗ ТРЁХ КОЛОНОК: «92 см полотна на изделие»
                      оператор проверяет опытом мгновенно, а квадратные сантиметры — никогда.
                      Ширина названа в заголовке, потому что без неё длина ничего не значит. */}
                  <th>
                    {cuttingWidthCm ? `net, cm at ${fmtWidth(cuttingWidthCm)} cm` : 'net, cm'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  // Длина считается ОБЩЕЙ функцией (nettoLengthCm: площадь ÷ раскройную ширину) —
                  // той же, которой считает норму диалог применения и пересчёт. Своё деление здесь
                  // было бы вторым определением одного числа.
                  const lengthCm = cuttingWidthCm
                    ? nettoLengthCm(r.areaCm2, cuttingWidthCm)
                    : null;
                  return (
                    <tr key={r.sizeId}>
                      <td>{sizeName(r.sizeId)}</td>
                      <td>{Math.round(r.areaCm2)}</td>
                      {/* КВАДРАТНЫЕ МЕТРЫ РЯДОМ С САНТИМЕТРАМИ — не украшение. «12832 см²» звучит
                          чудовищно, означая метр с четвертью: на бете это уже прочли как поломку
                          расчёта и пошли искать несуществующую ошибку в геометрии. Число одно и то
                          же, но в м² его порядок виден глазом. */}
                      <td>{(r.areaCm2 / 10000).toFixed(2)}</td>
                      <td>{lengthCm != null ? Math.round(lengthCm) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
            <Text size='nano' variant='label'>
              {`pieces: ${pieces.length} · graded: ${outcome.areas.gradedPieces}${
                outcome.areas.sizelessCm2 > 0
                  ? ` · sizeless pieces: ${Math.round(outcome.areas.sizelessCm2)} cm² in every size`
                  : ''
              }`}
            </Text>
            <Text size='nano' variant='label'>
              the table shows the GARMENT's area (with the number of pieces per garment); what
              travels to the server is the area of ONE instance of each piece, and the multiplier is
              applied by the reader — it lives on the piece and is edited separately
            </Text>
            {/* ОТСУТСТВИЕ ДЛИНЫ ОБЯЗАНО НАЗЫВАТЬ ПРИЧИНУ. Пустая колонка молча читается как «длина
                ноль» или как поломка; подставить сюда номинальные 140 см вместо неизвестной ширины
                нельзя — ошибка ширины входит в норму линейно и не видна потом ни в одном числе.
                Прочерк в ОТДЕЛЬНОЙ клетке при известной ширине означает нулевую площадь размера —
                там причину называют соседняя клетка с нулём и блокирующая плашка выше. */}
            <Text size='nano' variant='label'>
              {cuttingWidthCm
                ? `net — area ÷ cutting width (${fmtWidth(cuttingWidthCm)} cm = roll − 2×selvedge). this is a lower bound: the waste between pieces and the lay ends are not in it, only a marker knows those`
                : 'the running length is not shown: for this fabric the cloth width is empty on at least one BOM line of this purpose, or the lines name different widths — there is nothing to divide the area by, and substituting a nominal value for an unknown width would hide a mistake that is invisible in every number afterwards'}
            </Text>
            {outcome.areas.hulled.length > 0 && (
              <CalloutBox tone='note'>
                the contour was replaced with a convex hull (the area is overstated):{' '}
                {outcome.areas.hulled.join(', ')}
              </CalloutBox>
            )}
            {outcome.areas.ambiguousPickPieces.length > 0 && (
              <CalloutBox tone='note'>
                pieces {outcome.areas.ambiguousPickPieces.map((n) => `“${n}”`).join(', ')} have
                several copies of matching area on the layer — the first one went into the
                measurement, which means the choice depends on the order of the sheets in the pack.
                such a row is flagged on the server.
              </CalloutBox>
            )}
          </>
        )}

        <Pill tone='mut'>only areas are written — the norm and the recipe don't change</Pill>
      </div>
    </ConfirmationModal>
  );
}
