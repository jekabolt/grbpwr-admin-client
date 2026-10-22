// «По выкройкам» — норма расхода из площади деталей, без раскладки (`consumption_source='dxf'`, 0294).
//
// ЗАЧЕМ ОН РЯДОМ С «ИЗ РАСКЛАДКИ». Раскладка — лучший ответ: её длина ИЗМЕРЕНА, в ней уже лежат
// межлекальные выпады, и костинг такую норму не гроссит. Но раскладки на карточке может не быть
// вовсе — а себестоимость стиля и потребность до первого прогона считаются уже сейчас, и до сих
// пор единственным выходом был ручной ввод: число «на глаз», умноженное на процент раскроя «на
// глаз». Выкройки в этот момент есть, и площадь каждой детали в них — факт.
//
// ЧТО ДИАЛОГ ПОКАЗЫВАЕТ: таблицу «размер · netto» и одно действие. Процента раскроя в BOM больше
// нет (решение владельца: отход раскроя принадлежит раскладке), поэтому ни колонки гросса, ни
// двери к нему здесь нет. Всё, что мешает применить, — в шапке модалки (HeaderWarnings с дверью
// к полю), причина серой кнопки
// — строкой в подвале. Условия замера (слой, припуск) — за складкой «details»: они предзаполнены
// замером файла и почти всегда верны; при запрете условий складка открыта сама.
//
//   • число NETTO — пишется как было, без межлекальных выпадов.
//   • КРОМКИ В ПРОЦЕНТЕ НЕТ — это арифметика: netto-длина = площадь ÷ РАСКРОЙНАЯ ширина
//     (рулон − 2×кромка), купленная кромка уже сидит в делении, ровно один раз. Кг = netto-длина ×
//     ПОЛНАЯ ширина × плотность. Формула — в `title` колонки netto.
//
// РЕЖИМ ОДИН — ПО РАЗМЕРАМ, и это не упущение. План материалов прогона ходит по линиям
// (изделие × размер) и берёт норму размера, а при её отсутствии — скаляр НА ЛЮБОЙ размер: одна
// цифра, снятая с площади M, поехала бы в потребность XL. Скаляр здесь был бы ровно той
// нечестностью, за которую сервер отказывает смешанной раскладке в средней норме.
import { useMemo, useState } from 'react';
import { useWatch, type Control } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import {
  Button,
  ConfirmationModal,
  DataTable,
  EmptyCell,
  FoldCaret,
  HeaderWarnings,
  type HeaderWarning,
  Text,
} from 'ui';
import { parseDecimalNumber } from 'utils/decimal';
import { revealField } from 'utils/field-errors';
import { mmToEngineCm } from './nesting/allowance-units';
import { notify } from 'lib/stores/store';
import { publishPieceAreas, useUnsavedAreaSource } from './piece-areas';
import { serverKeyOfScope } from './piece-areas-state';
import { bindingScopes, fabricScopes, isRollGoodsSection, scopeKeyOfBinding } from './bom-purpose';
import { sizeTokensOf } from './nesting/block-code';
import {
  DxfMeasureConditionsFields,
  useDxfMeasureConditions,
} from './nesting/dxf-measure-conditions';
import { dxfNormAreas, dxfNormValueRows, type DxfNormPiece } from './nesting/dxf-consumption';
import { type WeightBasisResolution } from './nesting/fabric-weight';
import { bomUnitKind } from './nesting/marker-io';
import type { TechCardFormData } from './schema';

export default function DxfApplyDialog({
  control,
  pieces,
  unaliasedPieces,
  unit,
  articleWidth,
  weightBasis,
  sizeIds,
  sizeNameById,
  canEdit,
  techCardId,
  lineKey,
  onClose,
  onApply,
}: {
  /** id карточки; 0 = ещё не сохранена, публиковать площади некуда. */
  techCardId: number;
  /** line_key строки BOM этой ткани — из него резолвится скоуп словами сервера. */
  lineKey: string;
  // Форма приходит ЯВНЫМ control'ом, а не через useFormContext ЗДЕСЬ: два поля ниже читаются
  // именно из неё, и пробрасывать их сквозь обёртку значило бы дублировать. (Пачку DXF собирает
  // useCardDxfPack, и она контекст всё-таки берёт — у неё нет другого способа, и она вызвана в
  // компоненте, который монтируется только внутри формы.)
  control: Control<TechCardFormData>;
  /** Детали кроя этой ткани с количеством на изделие — разрешены лёгкой обёрткой (dxf-apply.tsx). */
  pieces: DxfNormPiece[];
  /** Детали этой же ткани БЕЗ связи с блоком чертежа — расчёт на них отказывает, см. dxfNormAreas. */
  unaliasedPieces: string[];
  unit: string;
  /** РАСКРОЙНАЯ ширина эффективного артикула, см (рулон − 2×кромка). '' = неизвестна. */
  articleWidth: string;
  /**
   * Основа веса кг-слота (Ф3): ПОЛНАЯ ширина рулона × плотность артикула. Резолвит строка
   * рецепта (weightBasisOf) — у диалога нет ни артикула, ни пина, и выбирать числа сам он не
   * имеет права. Netto-длина по-прежнему делится на РАСКРОЙНУЮ ширину; полная нужна только весу.
   */
  weightBasis: WeightBasisResolution;
  sizeIds: number[];
  sizeNameById: Map<number, string>;
  canEdit: boolean;
  /** Диалог монтируется ТОЛЬКО открытым — обёртка держит состояние, чтобы геометрия не грузилась. */
  onClose: () => void;
  onApply: (patch: {
    consumption?: string;
    quantity?: string;
    sizeConsumptions?: { sizeId: number; consumption: string }[];
    consumptionSource?: string;
    wasteSelvedgePct?: string;
    wasteCutPct?: string;
    normMarkerId?: number;
  }) => void;
}) {
  // УСЛОВИЯ ЗАМЕРА — ОБЩИМ КОДОМ с отдельным действием «замерить площади деталей» на вкладке
  // выкроек (nesting/dxf-measure-conditions.tsx): разбор пачки, выбор слоя, прифилл припуска и все
  // запреты. Оба входа пишут ОДНУ И ТУ ЖЕ таблицу площадей, и мерить они обязаны по одному контуру
  // — иначе одна карточка, померенная двумя кнопками, дала бы две площади без единого слова о том,
  // почему. Из формы там читается стандарт припуска карточки; детали кроя и скоуп ткани сюда
  // приходят готовыми от лёгкой обёртки.
  const conditions = useDxfMeasureConditions(control);
  const { index, layer: chosenLayer, seamMm: seamValue } = conditions;

  const widthCm = parseDecimalNumber(articleWidth);
  const unitKind = bomUnitKind(unit);
  const fabric = weightBasis.ok ? weightBasis.basis : undefined;

  const outcome = useMemo(() => {
    if (!index) return null;
    return dxfNormAreas({
      index,
      pieces,
      unaliasedPieces,
      sizeIds,
      tokensOfSize: (id) => sizeTokensOf(sizeNameById.get(id)),
      contourLayer: chosenLayer,
      allowanceCm: mmToEngineCm(seamValue) ?? 0,
    });
  }, [index, pieces, unaliasedPieces, sizeIds, sizeNameById, chosenLayer, seamValue]);

  // Строки применения: размер → netto в единице линии — общей функцией с пересчётом по текущим
  // данным (dxfNormValueRows), включая правило «ноль после округления — не норма»: `toBomUnit` округляет
  // метры до трёх знаков (колонка DECIMAL(10,3)), и крошечная площадь честно превращается в 0.000 —
  // строка сохранилась бы «с нормой», которая ничего не требует, и дефицит на прогоне вышел бы
  // нулевым. Полное покрытие ряда или ничего — частичный ряд заставил бы план подставлять скаляр
  // (которого не будет) на непокрытые размеры.
  const rows = useMemo(() => {
    if (!outcome?.ok || !(widthCm > 0)) return [];
    return dxfNormValueRows(outcome.areas.rows, widthCm, unit, fabric);
  }, [outcome, widthCm, unit, fabric]);
  const complete = rows.length === sizeIds.length && rows.every((r) => r.value != null);
  // Запреты УСЛОВИЙ ЗАМЕРА (припуск не число, припуск выше потолка, двойной припуск, частично
  // скачанная пачка, ещё не прочитанные настройки цеха) держит общий хук — они одни и те же для
  // любого, кто мерит по DXF. Здесь остаётся то, что есть только у нормы: полный ряд и право
  // писать в карточку.
  const applicable = complete && canEdit && !conditions.blocked;

  const queryClient = useQueryClient();
  const patternRows = (useWatch({ control, name: 'patterns' }) ?? []) as {
    lineKey?: string;
    fabricPurpose?: string;
    bomLineKey?: string;
  }[];
  const bomRows = (useWatch({ control, name: 'bomItems' }) ?? []) as {
    lineKey?: string;
    purpose?: string;
    name?: string;
    section?: string;
  }[];
  // Скоуп ЭТОЙ строки — РАЗРЕШЁННЫЙ по разбиению карточки, а не прочитанный с самой строки:
  // прокладка — свой скоуп при любом назначении (L11), и её ключ на сервере — line_key, а не
  // назначение. Остальные — назначение, иначе собственный line_key.
  const scopes = useMemo(
    () =>
      fabricScopes(
        bomRows
          .filter((b) => isRollGoodsSection(b.section) && !!b.lineKey)
          .map((b) => ({
            lineKey: b.lineKey as string,
            purpose: b.purpose,
            name: b.name,
            section: b.section,
          })),
      ),
    [bomRows],
  );
  const lineScope = useMemo(
    () => scopes.find((s) => s.lines.some((l) => l.lineKey === lineKey)),
    [scopes, lineKey],
  );
  // ...словами сервера.
  const lineScopeKey = lineScope ? serverKeyOfScope(lineScope) : '';

  const sizeName = (id: number) => sizeNameById.get(id) ?? `#${id}`;

  // КУДА ПУБЛИКОВАТЬ ПЛОЩАДИ, И ПО КАКИМ ЛИСТАМ ОТВЕЧАТЬ.
  //
  // Скоуп называется ТЕМ ЖЕ словом, что на сервере (`serverKeyOfScope`), а не ключом строки
  // BOM: сервер собирает состав скоупа по СВОИМ строкам, и ключ, написанный не тем словом, не
  // найдёт ни одного листа. Карточка без id (ещё не сохранена) публиковать не может.
  //
  // ЛИСТЫ БЕРУТСЯ ПО РАЗРЕШЁННОМУ СКОУПУ, А НЕ ПО СЫРОМУ КЛЮЧУ, и это правка, а не стиль. Геометрия
  // приходит из карточного индекса, который группирует файлы по РАЗРЕШЁННОМУ скоупу (лист строки L
  // принадлежит назначению P, если L разложена в P). Прежний фильтр по сырому ключу отбирал из них
  // подмножество и публиковал его как полный набор: площадь считалась в том числе по листу, за
  // который отпечаток не отвечал, — перезалив его, оператор менял площади и НЕ делал замер
  // устаревшим. Теперь набор один и тот же, а расхождение сырых привязок внутри него — отказ, общий
  // с отдельным действием на вкладке выкроек (`pieceAreaSheetsRefusal`).
  //
  // Листы берутся ВСЕ, включая наследие в PDF: отпечаток сервер считает по своим строкам
  // `tech_card_size_pattern`, а они форматом не отбираются.
  // Правлен ли ИСТОЧНИК замера и не сохранён — общее правило обеих точек публикации (piece-areas.ts).
  const sourceDirty = useUnsavedAreaSource(control);
  const publishTarget = useMemo(() => {
    const id = Number(techCardId) || 0;
    if (id <= 0 || !lineScope || !lineScopeKey) return null;
    // Over the card's WHOLE sheet set: an interlining line with sheets of its own does not read
    // its legacy purpose-only ones (bindingScopes) — never both into one measurement.
    const sheets = bindingScopes(scopes, patternRows ?? []);
    const mine = (patternRows ?? []).filter(
      (sh) => scopeKeyOfBinding(sh.fabricPurpose, sh.bomLineKey, sheets) === lineScope.key,
    );
    if (mine.length === 0) return null;
    return { techCardId: id, scopeKey: lineScopeKey, scopes, sheets: mine };
  }, [techCardId, patternRows, scopes, lineScope, lineScopeKey]);

  const apply = () => {
    if (!applicable) return;
    // ПЛОЩАДИ УЕЗЖАЮТ НА СЕРВЕР ЗДЕСЬ, И ИМЕННО ЗДЕСЬ (Ф0/Ф1).
    //
    // Это единственная точка, где оператор ПОДТВЕРДИЛ условия замера — слой контура и припуск, — а
    // те же площади уже посчитаны для нормы. Писать их фоном при открытии вкладки значило бы
    // сохранять данные на действии чтения, да ещё с угаданными условиями: ошибка в слое молча
    // меняет площадь на величину припуска по всему периметру каждой детали.
    //
    // Публикация НЕ БЛОКИРУЕТ применение нормы и не может его отменить: норма уже посчитана и
    // подтверждена, а площади — это то, из чего сервер потом выведет ОЦЕНКУ для слотов, где нормы
    // никто не вписал. Отказ сервера (например, неполный комплект скоупа) остаётся сообщением, а не
    // провалом операции, которую человек только что подтвердил.
    //
    // …НО НЕ С НЕСОХРАНЁННЫМ ИСТОЧНИКОМ. Комплект деталей здесь собран из ФОРМЫ
    // (useFabricDxfPieces читает pieceDxfAliases), а полноту присланного набора сервер доказывает
    // против СВОИХ, сохранённых связей. Если деталь только что перепривязали к другому блоку, а
    // состав деталей не изменился, серверная сверка «в обе стороны» пройдёт против СТАРЫХ связей —
    // и площади, снятые с геометрии, которой сохранённая карточка не заявляет, лягут в базу МОЛЧА.
    // Отказаться после этого от правок формы значит остаться с неверными площадями без следа.
    //
    // Норму это НЕ отменяет: её человек только что подтвердил, она посчитана и применяется ниже.
    // Не уезжают только площади — и об этом говорится вслух, вместе с тем, что делать.
    if (publishTarget && outcome?.ok && sourceDirty) {
      notify({
        sev: 'warn',
        subject: 'PIECE AREAS',
        text: 'norm applied',
        bad: 'areas not saved',
        detail:
          'the patterns or the block→piece links have been edited and not saved — the server checks the set against the saved links. once the card has saved, measure the areas on the patterns tab',
      });
    } else if (publishTarget && outcome?.ok) {
      void publishPieceAreas({
        techCardId: publishTarget.techCardId,
        scopeKey: publishTarget.scopeKey,
        scopes: publishTarget.scopes,
        sheets: publishTarget.sheets,
        areas: outcome.areas.pieceRows,
        contourLayer: chosenLayer,
        seamAllowanceMm: Number(seamValue) || 0,
        nameOfPiece: (key) => pieces.find((p) => (p.lineKey ?? '').trim() === key)?.name ?? key,
      }).then((res) => {
        if (!res.ok) {
          notify({
            sev: 'warn',
            subject: 'PIECE AREAS',
            text: 'norm applied',
            bad: 'areas not saved',
            detail: res.reason,
          });
          return;
        }
        // Состояние замера показывает вкладка выкроек, и читает она его ИЗ ОТВЕТА СЕРВЕРА (свежесть
        // считает он). Без сброса чтения плитка ткани продолжала бы писать «площади не замерены»
        // над только что записанным замером — до перезагрузки страницы.
        queryClient.invalidateQueries({ queryKey: techCardKeys.detail(publishTarget.techCardId) });
      });
    }
    onApply({
      // Скаляр СНИМАЕТСЯ явно: одна оставшаяся строка заставила бы сервер игнорировать ряд.
      consumption: '',
      // КОЛИЧЕСТВО СНИМАЕТСЯ ТОЖЕ, И ЭТО НЕ УБОРКА. LineTotal читает Quantity ПЕРВЫМ (штук × цена,
      // без гросс-апа), а план материалов на той же строке берёт расход — строка с обоими полями
      // раскалывает себестоимость и потребность. Сервер такую форму на источнике 'dxf' прямо
      // отказывает (validateDxfNormShape), причём отказом на ВЕСЬ рецепт и позже, на сохранении
      // колорвея: без этой строки применение к легаси-строке (обоими полями заполненной с 0079)
      // выглядело бы удавшимся, а рушилось бы потом и в другом месте.
      quantity: '',
      sizeConsumptions: rows.map((r) => ({ sizeId: r.sizeId, consumption: r.value! })),
      consumptionSource: 'dxf',
      // Разложение отходов описывает измеренную раскладку — у площади деталей его нет, и сервер
      // отказывает паре (dxf + проценты). Штамп нормы снимается явно: 0, а не пропуск поля, иначе
      // прежний марочный штамп пережил бы применение и стал описывать не то число.
      wasteSelvedgePct: '',
      wasteCutPct: '',
      normMarkerId: 0,
    });
    onClose();
  };

  // Дверь из предупреждения: закрыть диалог и открыть поле строки BOM (bom-field ловит просьбу).
  const bomIndex = bomRows.findIndex((b) => (b.lineKey ?? '') === lineKey);
  const fabricName = bomIndex >= 0 ? (bomRows[bomIndex].name ?? '').trim() : '';
  const toBom = (field: string) =>
    bomIndex >= 0
      ? {
          label: 'open in bom',
          onClick: () => {
            onClose();
            requestAnimationFrame(() => revealField(`bomItems.${bomIndex}.${field}`));
          },
        }
      : undefined;

  const unconvertible = outcome?.ok && rows.some((r) => r.conv == null);
  const roundsToZero = outcome?.ok && rows.some((r) => r.conv != null && !(r.conv.value > 0));
  const warnings: (HeaderWarning | null | undefined | false)[] = [
    !(widthCm > 0) && {
      text: 'article has no cloth width',
      error: true,
      action: toBom('materialId'),
    },
    conditions.packSize === 0 && { text: 'no DXF on the card', error: true },
    conditions.parseError && { text: conditions.parseError.message, error: true },
    outcome && !outcome.ok && { text: outcome.reason, error: true },
    unconvertible && {
      text:
        unitKind === 'kg' && !weightBasis.ok
          ? 'article width or density missing for kg'
          : unit
            ? `unit “${unit}” takes neither length nor weight`
            : 'slot has no unit',
      error: true,
      action: toBom(unitKind === 'kg' ? 'materialId' : 'unit'),
    },
    roundsToZero && { text: `norm rounds to zero in “${unit || '—'}”`, error: true },
    outcome?.ok &&
      outcome.areas.sizesIncomplete.length > 0 && {
        text: `pieces missing for ${outcome.areas.sizesIncomplete.map((id) => formatSizeName(sizeName(id))).join(', ')}`,
        error: true,
      },
    outcome?.ok &&
      outcome.areas.hulled.length > 0 &&
      `convex hull used (area overstated): ${outcome.areas.hulled.join(', ')}`,
  ];

  const hint = !canEdit
    ? 'read only'
    : conditions.blocked
      ? 'check measurement details'
      : outcome?.ok && rows.length > 0 && !complete
        ? 'every size needs a norm'
        : undefined;

  const [detailsOpen, setDetailsOpen] = useState(false);
  const showDetails = detailsOpen || conditions.blocked;
  const nettoTitle = `net = Σ(piece area × count) ÷ cutting width ${widthCm > 0 ? `${widthCm} cm` : ''} (roll − 2×selvedge)`;

  return (
    <ConfirmationModal
      open
      onOpenChange={(o: boolean) => {
        if (!o) onClose();
      }}
      onConfirm={apply}
      onCancel={onClose}
      hideCancel
      title={fabricName ? `apply norm from patterns · ${fabricName}` : 'apply norm from patterns'}
      headerActions={<HeaderWarnings items={warnings} />}
      confirmLabel='apply per size'
      confirmDisabled={!applicable}
      footerHint={hint}
      closeOnConfirm={false}
    >
      <div className='space-y-2.5'>
        {!outcome && conditions.packSize > 0 && conditions.parsePending && (
          <Text size='micro' variant='label' component='p'>
            reading patterns…
          </Text>
        )}

        {outcome?.ok && rows.length > 0 && (
          <DataTable>
            <thead>
              <tr>
                <th>size</th>
                <th title={nettoTitle}>net{unit ? `, ${unit}` : ''} ?</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.sizeId}>
                  <td>{formatSizeName(sizeName(r.sizeId))}</td>
                  <td>{r.conv ? r.conv.value : <EmptyCell />}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}

        <div>
          <Button
            type='button'
            variant='underline'
            size='xs'
            aria-expanded={showDetails}
            disabled={conditions.blocked}
            onClick={() => setDetailsOpen((o) => !o)}
          >
            details
            <FoldCaret open={showDetails} />
          </Button>
          {showDetails && (
            <div className='flex max-w-md flex-col gap-1.5 pt-1'>
              <DxfMeasureConditionsFields state={conditions} />
            </div>
          )}
        </div>
      </div>
    </ConfirmationModal>
  );
}
