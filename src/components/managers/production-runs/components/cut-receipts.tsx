import {
  common_ProductionRun,
  common_ProductionRunCutReceipt,
  common_ProductionRunCutReceiptInsert,
  common_ProductionRunLay,
} from 'api/proto-http/admin';
import { wireInt } from 'components/managers/tech-card/components/schema';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { DataTable, EmptyCell, TotalRow } from 'ui/components/data-table';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import {
  ClothReport,
  buildClothReport,
  clothRefusalText,
  fmtDeltaPct,
  fmtQty,
  isLayFactFrozen,
  layClothInput,
  normBasisText,
  normRefusalText,
  pairNormInput,
} from '../utils/cloth-per-unit';
import { runDate } from './options';
import {
  cutReceiptErrorMessage,
  useCutReceipts,
  useDeleteCutReceipt,
  useSaveCutReceiptRows,
} from './useCutReceipts';
import { layActualQty, useRunLays } from './useLays';
import { useRunNormCard } from './useRunNormCard';

// ПРИЁМКА КРОЯ (Ф5б.5) — дыра между «раскроили» и «детали дошли до пошива», закрытая двумя числами.
//
// ЦЕПОЧКА ЧИСЕЛ ПРОГОНА, целиком (называется в прото один раз, здесь только показывается):
//   заказано (production_run_line.planned_qty)
//     → ВЫКРОЕНО (cut_qty)
//       → ПРИНЯТО В ПОШИВ (accepted_qty)
//         → сдано готовым (production_run_line.received_qty)
//           → брак (production_run_line.defect_qty)
// Приёмка кроя вставляет два новых числа МЕЖДУ заказанным и сданным; существующие поля не
// переозначены — «принято в пошив» и «сдано готовым» это разные события.
//
// ЧИСЛА НЕ ВАЛИДИРУЮТСЯ ДРУГ ПРОТИВ ДРУГА, ни здесь, ни на сервере. «Заказано 10, выкроено 12» —
// законный перекрой; «выкроено 12, принято 10» — законный брак раскроя. Задача экрана — СДЕЛАТЬ
// РАСХОЖДЕНИЕ ВИДНЫМ, а не запретить его: запрет превратил бы отчёт о том, что произошло со столом,
// в спор с формой ввода.
//
// ЕДИНИЦА — ИЗДЕЛИЯ (комплекты кроя), а не детали. Это то, что делает сравнение с «заказано» и
// «сдано готовым» осмысленным, и то, из-за чего слоты сводятся минимумом (см. ЛОВУШКУ ниже).

// ─────────────────────────────────────────────────────────────────────────────
// ЛОВУШКА СОЕДИНЕНИЯ — прочти раньше, чем будешь «упрощать» join
//
// `planned_qty` и `received_qty` живут на СТРОКЕ ПРОГОНА, чей ключ — (колорвей, размер).
// Ключ настила — (колорвей, СЛОТ BOM). У одного колорвея законно НЕСКОЛЬКО настилов, и они бывают
// двух разных природ:
//
//   а) разные размерные блоки ОДНОГО слота — настил №1 кроит 10 шт M, настил №2 ещё 10 шт M.
//      Правильная свёртка внутри слота — СУММА (всего выкроено 20).
//   б) разные СЛОТЫ — основная ткань и подкладка. Оба настила кроят «M», но это не 20 изделий, а
//      одни и те же 10: изделию нужны ОБА слоя. Правильная свёртка между слотами — МИНИМУМ, ровно
//      как в матрице покрытия (lay-coverage-table.tsx: «минимумом по всем деталям всех тканей»).
//
// Отсюда правило join'а, и оно нарушается двумя разными способами:
//   * «показать заказанное рядом с каждой строкой приёмки» УДВОИТ ЗАКАЗ — одно и то же плановое
//     число размножится по настилам. Поэтому `planned/received/defect` берутся РОВНО ОДИН РАЗ, из
//     строки прогона по паре (колорвей, размер), и не участвуют ни в какой агрегации по настилам.
//   * «просуммировать выкроенное по всем настилам пары» УДВОИТ КРОЙ на любом колорвее с двумя
//     слотами. Поэтому сумма берётся ВНУТРИ слота, а между слотами — минимум.
// На колорвее с одним слотом оба правила вырождаются в обычную сумму — и именно поэтому ошибку
// легко не заметить: она появляется ровно тогда, когда у изделия есть подкладка.
// ─────────────────────────────────────────────────────────────────────────────

/** Свёртка одного слота по паре (колорвей, размер): сумма его настилов. */
type SlotTally = { label: string; cut: number; accepted: number };

/** Строка цепочки — ОДНА на пару (колорвей, размер), сколько бы настилов её ни кроило. */
type ChainRow = {
  sizeId: number;
  /** Из строки прогона. undefined = такой строки в плане нет (кроили размер, которого не заказывали). */
  planned?: number;
  received?: number;
  defect?: number;
  /** Минимум по слотам, у которых приёмка введена. undefined = не введена ни у одного. */
  cut?: number;
  accepted?: number;
  /** Настилов, кроящих этот размер. */
  expected: number;
  /** Из них с введённой приёмкой. */
  reported: number;
  /** Разбор по слотам — для подсказки, когда слоты разошлись. */
  slots: SlotTally[];
};

type Draft = { cut: string; accepted: string; note: string };

const rowKey = (layKey: string, sizeId: number) => `${layKey}:${sizeId}`;
const digits = (v: string) => v.replace(/[^0-9]/g, '');

// Имя настила ВНУТРИ пары — для отказов и оговорок агрегата: колорвей и слот у всех настилов пары
// одинаковы, различают их собственное имя либо рулон. На уровне модуля, а не компонента: функцию
// читают useMemo, стоящие в коде РАНЬШЕ места, где const в теле компонента успел бы объявиться.
const layShortName = (lay: common_ProductionRunLay) =>
  (lay.name ?? '').trim() || (lay.lotCode ? `настил (${lay.lotCode})` : `настил #${wireInt(lay.id)}`);

// Идентификатор СЛОТА настила; '' = идентификатора нет ВОВСЕ (легаси-запись без bomLineKey и
// bomItemId — текущий редактор таких не создаёт). Пустоту обязан обрабатывать вызывающий сам:
// прежний фолбэк `... || '—'` был недостижим — String(wireInt(undefined)) даёт '0', а строка '0'
// truthy, — и два безымянных настила РАЗНЫХ слотов (ткань и подкладка) молча склеивались в одну
// пару с общим числом под именем первого.
const laySlotKey = (lay: common_ProductionRunLay): string =>
  lay.bomLineKey || (wireInt(lay.bomItemId) > 0 ? String(wireInt(lay.bomItemId)) : '');

export function CutReceipts({
  run,
  canEdit,
  locked,
  id,
}: {
  run: common_ProductionRun;
  canEdit: boolean;
  /**
   * Партия в терминальном статусе (received/closed).
   *
   * НЕ ЗАПРЕЩАЕТ ВВОД, и это не недосмотр, а зеркало серверного решения (productionrun/
   * cut_receipt.go, решение 1): у приёмки кроя нет статусного гейта ни в какую сторону. Настил —
   * ПЛАН, и править план законченной партии значит переписывать историю; приёмка кроя —
   * ПРОТИВОПОЛОЖНЫЙ ПО ПРИРОДЕ объект, отчёт о том, что физически произошло за столом, а крой
   * всегда предшествует пошиву, пошив — приёмке. Требовать открытую партию значило бы: факт можно
   * внести только пока он неизвестен, и нельзя исправить, когда он выяснился. Отменённая партия —
   * самый острый случай: раскроенная ткань это ровно тот убыток, который кто-то обязан посчитать.
   * Флаг используется только чтобы СКАЗАТЬ это вслух — иначе редактируемый блок на замороженной
   * странице читался бы как баг.
   */
  locked: boolean;
  /** Якорь блока; шаг «раскрой» отдаёт свой id ПЕРВОМУ блоку региона — плану настилов, не этому. */
  id?: string;
}) {
  const runId = run.id ?? 0;
  const techCardId = run.run?.techCardId ?? 0;
  const { dictionary } = useDictionary();
  const { showMessage } = useSnackBarStore();
  // isError нужен отдельно от data: «карточка ещё читается» и «запрос карточки упал» — разные
  // состояния, и сравнение с нормой обязано назвать второе словами, а не молчать как при первом.
  const { data: techCard, isError: techCardFailed } = useTechCard(techCardId || undefined);
  // НОРМА — из снапшота ревизии прогона, живая карточка только фолбэком (и подпись сравнения
  // его называет). Градация размеров, ярлыки колорвеев и прочее на этом экране остаются живыми:
  // приёмка — отчёт о сегодняшнем крое, а норма — обещание той ревизии, по которой партию кроят.
  const { normCard, normBasis, releasePending } = useRunNormCard(run, techCard);

  // Настилы читаются ТЕМ ЖЕ ключом, что план настилов рядом (layKeys.list), поэтому лишнего запроса
  // нет: React Query отдаёт оба блока из одного ответа, и два блока одного шага не могут разойтись
  // в том, какие настилы у прогона есть.
  const { data: layData } = useRunLays(runId, runId > 0);
  const { data, isLoading, isError } = useCutReceipts(runId, runId > 0);

  const save = useSaveCutReceiptRows();
  const del = useDeleteCutReceipt();

  const [draft, setDraft] = useState<Record<string, Draft>>({});
  // Размеры, ДОБАВЛЕННЫЕ к настилу вручную. Сервер принимает любой размер, который градуирует
  // КАРТОЧКА, и отказывается судить план: «выкроили размер, которого не заказывали» — это
  // расхождение, которое надо показать, а не ввод, который надо отклонить (cut_receipt.go:144-150).
  // Без этой строки состояния экран был бы строже сервера и такой факт записать было бы негде.
  const [extraSizes, setExtraSizes] = useState<Record<string, number[]>>({});
  const [savingLay, setSavingLay] = useState('');
  const [deleting, setDeleting] = useState<{ lay: common_ProductionRunLay; sizeId: number } | null>(
    null,
  );

  const lays = useMemo(() => layData?.lays ?? [], [layData?.lays]);
  const receipts = useMemo(() => data?.receipts ?? [], [data?.receipts]);
  const lines = useMemo(() => run.run?.lines ?? [], [run.run?.lines]);

  const sizeLabel = useMemo(
    () => (sizeId: number) => String(findInDictionary(dictionary, sizeId, 'size') || sizeId),
    [dictionary],
  );

  // Колорвей = продукт (R1), имя резолвится из словаря по коду цвета — тем же способом, что
  // lines-grid.tsx и lay-plan.tsx, чтобы блоки одной страницы не называли цвет по-разному.
  const colorwayLabel = useMemo(() => {
    const byId = new Map<number, string>();
    for (const cw of techCard?.colorways ?? []) {
      const dc = dictionary?.colors?.find((c) => c.code === cw.colorCode);
      const name = dc?.name ?? cw.colorCode ?? '';
      byId.set(wireInt(cw.colorwayId), `${cw.colorCode ? `${cw.colorCode} · ` : ''}${name}`);
    }
    return (cwId: number) => byId.get(cwId) || (cwId > 0 ? `#${cwId}` : '(без колорвея)');
  }, [techCard?.colorways, dictionary?.colors]);

  // Порядок размеров — градация карточки; всё, что встретилось помимо неё (настил или строка
  // приёмки на размер вне градации), приезжает следом, а не теряется.
  const sizeOrder = useMemo(() => {
    const order = new Map<number, number>();
    (techCard?.techCard?.sizeIds ?? []).forEach((s, i) => order.set(wireInt(s), i));
    return (sizeId: number) => order.get(sizeId) ?? 1000 + sizeId;
  }, [techCard?.techCard?.sizeIds]);

  const receiptByRow = useMemo(() => {
    const m = new Map<string, common_ProductionRunCutReceipt>();
    for (const r of receipts) m.set(rowKey(r.layKey ?? '', wireInt(r.sizeId)), r);
    return m;
  }, [receipts]);

  const receiptsByLay = useMemo(() => {
    const m = new Map<string, common_ProductionRunCutReceipt[]>();
    for (const r of receipts) {
      const k = r.layKey ?? '';
      const list = m.get(k);
      if (list) list.push(r);
      else m.set(k, [r]);
    }
    return m;
  }, [receipts]);

  // Сколько ИЗДЕЛИЙ каждого размера кроит сам настил — план настила (живой снимок; исторический
  // берётся только если живого нет). Он же решает, какие строки предлагать ко вводу.
  const layPlanQty = useMemo(() => {
    const m = new Map<string, number>();
    for (const lay of lays) {
      const entries = (lay.qtyCurrent?.length ? lay.qtyCurrent : lay.qtySnapshot) ?? [];
      for (const e of entries) {
        const s = wireInt(e.sizeId);
        if (s > 0) m.set(rowKey(lay.layKey ?? '', s), wireInt(e.qty));
      }
    }
    return m;
  }, [lays]);

  // Размеры настила = его состав ПЛЮС размеры, на которые уже введена приёмка. Второе слагаемое не
  // избыточно: состав настила могли поменять после того, как крой посчитали, и строка приёмки,
  // выпавшая из состава, обязана остаться видимой — иначе счёт есть в базе и его нет на экране.
  const laySizes = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const lay of lays) {
      const key = lay.layKey ?? '';
      const s = new Set<number>();
      const entries = (lay.qtyCurrent?.length ? lay.qtyCurrent : lay.qtySnapshot) ?? [];
      for (const e of entries)
        if (wireInt(e.qty) > 0 && wireInt(e.sizeId) > 0) s.add(wireInt(e.sizeId));
      for (const r of receiptsByLay.get(key) ?? [])
        if (wireInt(r.sizeId) > 0) s.add(wireInt(r.sizeId));
      m.set(
        key,
        [...s].sort((a, b) => sizeOrder(a) - sizeOrder(b)),
      );
    }
    return m;
  }, [lays, receiptsByLay, sizeOrder]);

  // Строка прогона по паре (колорвей, размер) — ЕДИНСТВЕННЫЙ источник заказанного и сданного.
  const lineByPair = useMemo(() => {
    const m = new Map<string, { planned: number; received?: number; defect?: number }>();
    for (const l of lines) {
      m.set(`${wireInt(l.productId)}:${wireInt(l.sizeId)}`, {
        planned: wireInt(l.plannedQty),
        received: l.receivedQty == null ? undefined : wireInt(l.receivedQty),
        defect: l.defectQty == null ? undefined : wireInt(l.defectQty),
      });
    }
    return m;
  }, [lines]);

  // Колорвеи блока — те, у кого есть настилы, в порядке настилов (сервер отдаёт их по display_order).
  // Колорвей без настилов сюда не попадает СОЗНАТЕЛЬНО: приёмка кроя висит на настиле, значит для
  // него не существует ни одной строки, а «непокрытые пары» уже названы планом настилов выше — второй
  // список тех же пар разошёлся бы с первым при первом же изменении правил.
  const colorwayIds = useMemo(() => {
    const seen: number[] = [];
    for (const lay of lays) {
      const cw = wireInt(lay.colorwayId);
      if (cw > 0 && !seen.includes(cw)) seen.push(cw);
    }
    return seen;
  }, [lays]);

  const laysByColorway = useMemo(() => {
    const m = new Map<number, common_ProductionRunLay[]>();
    for (const lay of lays) {
      const cw = wireInt(lay.colorwayId);
      const list = m.get(cw);
      if (list) list.push(lay);
      else m.set(cw, [lay]);
    }
    return m;
  }, [lays]);

  // Колорвеи, которые прогон планирует, но настилов у них нет — считаются только чтобы честно
  // сказать, что блок показывает не весь заказ.
  const plannedWithoutLays = useMemo(() => {
    const planned = new Set<number>();
    for (const l of lines)
      if (wireInt(l.plannedQty) > 0 && wireInt(l.productId) > 0) planned.add(wireInt(l.productId));
    return [...planned].filter((cw) => !colorwayIds.includes(cw)).length;
  }, [lines, colorwayIds]);

  // Строки плана БЕЗ продукта (колорвей ещё не опубликован — «(unassigned)» в шаге 1). Их заказ
  // сопоставить с колорвеем настила НЕЧЕМ: ключ строки прогона — product_id, а он нулевой, тогда как
  // настил знает свой colorway_id. Угадать по размеру — это ровно та подстановка, которую шаг 1
  // делает только по явной команде человека; здесь она молча приписала бы заказ чужому цвету.
  // Поэтому такие строки не соединяются, а НАЗЫВАЮТСЯ.
  const unassignedPlanned = useMemo(
    () => lines.filter((l) => wireInt(l.plannedQty) > 0 && wireInt(l.productId) === 0).length,
    [lines],
  );

  // ЦЕПОЧКА. Здесь и только здесь заказанное встречается со свёрткой по настилам.
  const chain = useMemo(() => {
    return colorwayIds.map((cw) => {
      const cwLays = laysByColorway.get(cw) ?? [];
      const sizes = new Set<number>();
      for (const lay of cwLays) for (const s of laySizes.get(lay.layKey ?? '') ?? []) sizes.add(s);
      // Размеры, заказанные у этого колорвея, но не попавшие ни в один настил, — тоже строка
      // цепочки: «заказали, не кроили» это и есть то расхождение, ради которого блок существует.
      for (const l of lines)
        if (wireInt(l.productId) === cw && wireInt(l.plannedQty) > 0) sizes.add(wireInt(l.sizeId));

      const rows: ChainRow[] = [...sizes]
        .filter((s) => s > 0)
        .sort((a, b) => sizeOrder(a) - sizeOrder(b))
        .map((sizeId) => {
          const line = lineByPair.get(`${cw}:${sizeId}`);
          const bySlot = new Map<string, SlotTally>();
          let expected = 0;
          let reported = 0;
          for (const lay of cwLays) {
            if (!(laySizes.get(lay.layKey ?? '') ?? []).includes(sizeId)) continue;
            expected += 1;
            const r = receiptByRow.get(rowKey(lay.layKey ?? '', sizeId));
            if (!r) continue;
            reported += 1;
            // Слот BOM, а не настил: внутри слота настилы складываются, между слотами берётся
            // минимум (см. ЛОВУШКУ вверху файла). Настил БЕЗ идентификатора слота (laySlotKey='')
            // — сам себе слот: сложить его с другим безымянным значило бы угадать, что они кроят
            // один и тот же слой, а минимум — направление матрицы покрытия; разъезд слотов при
            // этом виден в подсказке «слоты расходятся» с именами.
            const slotKey = laySlotKey(lay) || `lay:${lay.layKey ?? ''}`;
            const acc = bySlot.get(slotKey) ?? {
              label: lay.bomItemName || lay.materialName || layShortName(lay),
              cut: 0,
              accepted: 0,
            };
            acc.cut += wireInt(r.cutQty);
            acc.accepted += wireInt(r.acceptedQty);
            bySlot.set(slotKey, acc);
          }
          const slots = [...bySlot.values()];
          return {
            sizeId,
            planned: line?.planned,
            received: line?.received,
            defect: line?.defect,
            // Минимум ТОЛЬКО по слотам с введённой приёмкой: слот, по которому ещё не отчитались,
            // не «выкроил ноль» — по нему просто нет счёта, и уронить им минимум в ноль значило бы
            // нарисовать недокрой там, где никто ничего не мерил.
            cut: slots.length ? Math.min(...slots.map((s) => s.cut)) : undefined,
            accepted: slots.length ? Math.min(...slots.map((s) => s.accepted)) : undefined,
            expected,
            reported,
            slots,
          };
        });
      return { colorwayId: cw, rows };
    });
  }, [colorwayIds, laysByColorway, laySizes, lineByPair, receiptByRow, lines, sizeOrder]);

  // ── ТКАНЬ НА ИЗДЕЛИЕ (Ф4) ──────────────────────────────────────────────────────────────
  // Арифметика и слова отказов — utils/cloth-per-unit, ОБЩИЕ с карточками настилов в плане выше:
  // две копии формулы на двух экранах разошлись бы молча.

  // Запись факта настила закрыта статусом партии ШИРЕ, чем `locked` (плюс cancelled): на закрытой
  // партии знаменатель (приёмку кроя) ещё уточняют, а невнесённый числитель не внести уже никогда.
  const factFrozen = isLayFactFrozen(run.run?.status);

  // Норма для отчёта: ревизия прогона ещё читается → undefined (сравнение молчит, а не мерится
  // «пока» живой картой); карточка (снапшот ревизии или живая) есть → вход нормы с подписью,
  // ОТКУДА она; карточка упала и снапшота нет → 'card-failed' (отказ словами). Без ветки
  // 'card-failed' 500 от GetTechCard был бы неотличим от вечной загрузки, и строка «к норме»
  // пропадала бы молча.
  const normFor = (colorwayId: number, bomLineKey: string, bomItemId: number) =>
    releasePending
      ? undefined
      : normCard
        ? pairNormInput(normCard, colorwayId, bomLineKey, bomItemId, normBasis)
        : techCardFailed
          ? ('card-failed' as const)
          : undefined;

  // Отчёт по ОДНОМУ настилу — итожная строка его таблицы ввода.
  const clothByLay = useMemo(() => {
    const m = new Map<string, ClothReport>();
    for (const lay of lays) {
      const key = lay.layKey ?? '';
      m.set(
        key,
        buildClothReport(
          [layClothInput(lay, receiptsByLay.get(key) ?? [], layShortName(lay))],
          factFrozen,
          normFor(wireInt(lay.colorwayId), lay.bomLineKey ?? '', wireInt(lay.bomItemId)),
        ),
      );
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- normFor — чистая функция от normCard/normBasis/releasePending/techCardFailed
  }, [lays, receiptsByLay, factFrozen, normCard, normBasis, releasePending, techCardFailed]);

  // Пары (колорвей × слот) — единственная законная агрегация: внутри слота настилы суммируются,
  // между слотами не складывается ничего (изделию нужны ВСЕ слои — см. ЛОВУШКУ вверху файла).
  const pairGroups = useMemo(() => {
    const m = new Map<
      string,
      {
        key: string;
        colorwayId: number;
        bomLineKey: string;
        bomItemId: number;
        slotName: string;
        /** У настила нет НИ ОДНОГО идентификатора слота (легаси-запись): он не агрегируется ни с
         *  кем — «пара» из него одного, — и таблица говорит это вслух вместо молчаливого слияния
         *  с другим таким же безымянным. */
        slotless: boolean;
        lays: common_ProductionRunLay[];
      }
    >();
    for (const lay of lays) {
      const cw = wireInt(lay.colorwayId);
      // Тот же слотовый ключ, что у свёртки цепочки выше — пары обоих блоков не могут разойтись;
      // и там, и тут настил без идентификатора слота ни с кем не склеивается (ключ — его layKey).
      const slotId = laySlotKey(lay);
      const key = `${cw}:${slotId || `lay:${lay.layKey ?? ''}`}`;
      const g = m.get(key);
      if (g) g.lays.push(lay);
      else
        m.set(key, {
          key,
          colorwayId: cw,
          bomLineKey: lay.bomLineKey ?? '',
          bomItemId: wireInt(lay.bomItemId),
          slotName: lay.bomItemName || lay.materialName || layShortName(lay),
          slotless: slotId === '',
          lays: [lay],
        });
    }
    return [...m.values()];
  }, [lays]);

  const pairCloth = useMemo(() => {
    const m = new Map<string, ClothReport>();
    for (const p of pairGroups) {
      m.set(
        p.key,
        buildClothReport(
          p.lays.map((l) =>
            layClothInput(l, receiptsByLay.get(l.layKey ?? '') ?? [], layShortName(l)),
          ),
          factFrozen,
          normFor(p.colorwayId, p.bomLineKey, p.bomItemId),
        ),
      );
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- normFor — чистая функция от normCard/normBasis/releasePending/techCardFailed
  }, [pairGroups, receiptsByLay, factFrozen, normCard, normBasis, releasePending, techCardFailed]);

  const anyFact = useMemo(() => lays.some((l) => layActualQty(l) !== ''), [lays]);

  // Настил не применим к aux-карточке — там нет ни колорвеев, ни деталей, ни раскладок, значит нет
  // и пары (настил, размер). Гейт дублирует тот, что убирает шаг «раскрой» из ленты: блок,
  // смонтированный по ошибке, обязан молчать сам.
  if (layData?.applicable === false) return null;

  const editable = canEdit;

  const serverDraft = (layKey: string, sizeId: number): Draft => {
    const r = receiptByRow.get(rowKey(layKey, sizeId));
    // ПУСТО ≠ НОЛЬ, но только до сохранения: базовая линия ненабранной строки — пустые поля, и
    // явно набранный «0» от неё отличим. При сохранении различие умирает — saveLay сериализует
    // пустое поле нулём (обе колонки NOT NULL, «пусто» серверу не передать), и хранёный ноль уже
    // не говорит, был ли он набран. Поэтому все тексты про «выкроено 0» / «принято 0» обязаны
    // признавать обе причины, а не утверждать «посчитанный ноль».
    if (!r) return { cut: '', accepted: '', note: '' };
    return {
      cut: String(wireInt(r.cutQty)),
      accepted: String(wireInt(r.acceptedQty)),
      note: r.note ?? '',
    };
  };

  const shownDraft = (layKey: string, sizeId: number): Draft =>
    draft[rowKey(layKey, sizeId)] ?? serverDraft(layKey, sizeId);

  const isDirty = (layKey: string, sizeId: number): boolean => {
    const d = draft[rowKey(layKey, sizeId)];
    if (!d) return false;
    const s = serverDraft(layKey, sizeId);
    return d.cut !== s.cut || d.accepted !== s.accepted || d.note !== s.note;
  };

  const setField = (layKey: string, sizeId: number, field: keyof Draft, value: string) => {
    const k = rowKey(layKey, sizeId);
    setDraft((prev) => ({
      ...prev,
      [k]: { ...(prev[k] ?? serverDraft(layKey, sizeId)), [field]: value },
    }));
  };

  // Строки таблицы ввода одного настила: его размеры плюс добавленные вручную.
  const layRows = (layKey: string): number[] => {
    const s = new Set<number>(laySizes.get(layKey) ?? []);
    for (const extra of extraSizes[layKey] ?? []) s.add(extra);
    return [...s].sort((a, b) => sizeOrder(a) - sizeOrder(b));
  };

  // Что можно добавить: градация КАРТОЧКИ — ровно то, что сервер проверяет через
  // LoadTechCardSizeRange. Предлагать размер вне градации значило бы приглашать в отказ.
  const addableSizes = (layKey: string): number[] => {
    const shown = new Set(layRows(layKey));
    return (techCard?.techCard?.sizeIds ?? [])
      .map((s) => wireInt(s))
      .filter((s) => s > 0 && !shown.has(s));
  };

  const dirtySizes = (lay: common_ProductionRunLay) =>
    layRows(lay.layKey ?? '').filter((s) => isDirty(lay.layKey ?? '', s));

  const saveLay = async (lay: common_ProductionRunLay) => {
    const layKey = lay.layKey ?? '';
    const sizes = dirtySizes(lay);
    if (sizes.length === 0) return;
    const rows: common_ProductionRunCutReceiptInsert[] = sizes.map((sizeId) => {
      const d = shownDraft(layKey, sizeId);
      return {
        sizeId,
        cutQty: Number(d.cut || 0),
        acceptedQty: Number(d.accepted || 0),
        note: d.note.trim(),
      };
    });
    setSavingLay(layKey);
    try {
      const res = await save.mutateAsync({ runId, layKey, rows });
      // Черновики снимаются ТОЛЬКО с принятых строк: отвергнутая строка обязана остаться на экране
      // с тем, что человек набрал, иначе исправлять будет нечего.
      if (res.saved.length > 0) {
        setDraft((prev) => {
          const next = { ...prev };
          for (const s of res.saved) delete next[rowKey(layKey, s)];
          return next;
        });
      }
      if (res.failed.length === 0) {
        showMessage(`Приёмка сохранена — строк: ${res.saved.length}`, 'success');
      } else {
        // Частичный успех называется вслух: без «сохранено N» оператор не знает, надо ли повторять
        // весь настил или только оставшиеся красными строки.
        const saved = res.saved.length > 0 ? `сохранено ${res.saved.length}; ` : '';
        showMessage(
          `${saved}${res.failed.map((f) => `${sizeLabel(f.sizeId)}: ${f.message}`).join('; ')}`,
          'error',
        );
      }
    } catch (e) {
      showMessage(cutReceiptErrorMessage(e), 'error');
    } finally {
      setSavingLay('');
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const layKey = deleting.lay.layKey ?? '';
    const sizeId = deleting.sizeId;
    try {
      await del.mutateAsync({ runId, layKey, sizeId });
      setDraft((prev) => {
        const next = { ...prev };
        delete next[rowKey(layKey, sizeId)];
        return next;
      });
      showMessage('Строка приёмки удалена', 'success');
    } catch (e) {
      showMessage(cutReceiptErrorMessage(e), 'error');
    } finally {
      setDeleting(null);
    }
  };

  const layTitle = (lay: common_ProductionRunLay) => {
    const slot = lay.bomItemName || lay.materialName || 'слот';
    const own = (lay.name ?? '').trim();
    return `${colorwayLabel(wireInt(lay.colorwayId))} · ${slot}${own ? ` · ${own}` : ''}`;
  };

  return (
    <Section
      id={id}
      title='приёмка кроя'
      question='Что реально вышло со стола: выкроено и принято в пошив, в ИЗДЕЛИЯХ. Расхождение с заказом показывается, а не запрещается.'
    >
      {isLoading ? (
        <Text size='small' variant='inactive'>
          приёмка кроя читается…
        </Text>
      ) : isError ? (
        <Text size='small' className='text-error'>
          приёмка кроя не читается — обновите страницу
        </Text>
      ) : lays.length === 0 ? (
        <Text size='small' variant='inactive'>
          настилов ещё нет — принимать нечего
        </Text>
      ) : (
        <>
          {locked ? (
            <CalloutBox tone='note'>
              <Text size='small'>
                Партия закрыта, но приёмку кроя вносить МОЖНО: крой предшествует пошиву, а пошив —
                приёмке, и раскроенная ткань отменённой партии это ровно тот убыток, который кто-то
                обязан посчитать.
              </Text>
            </CalloutBox>
          ) : null}

          <GroupLabel flush>цепочка чисел</GroupLabel>
          <Text size='micro' variant='label'>
            заказано → выкроено → принято в пошив → сдано готовым → брак. Заказанное и сданное
            берутся из строки партии РОВНО ОДИН РАЗ на пару (колорвей, размер); выкроенное и
            принятое складываются по настилам внутри слота и сводятся минимумом между слотами —
            изделию нужны все его слои.
          </Text>

          {/* Колорвей, у которого настилы есть, но ни одного размера в них ещё нет, пропускается:
              заголовок над пустотой обещает таблицу, которой нет. */}
          {chain
            .filter((group) => group.rows.length > 0)
            .map((group) => (
              <div key={group.colorwayId} className='flex flex-col'>
                <GroupLabel>{colorwayLabel(group.colorwayId)}</GroupLabel>
                <ChainTable rows={group.rows} sizeLabel={sizeLabel} />
              </div>
            ))}

          {plannedWithoutLays > 0 ? (
            <Text size='micro' variant='label'>
              ещё {plannedWithoutLays} колорвей(ев) заказано, но не настелено — они в плане настилов
              выше, приёмке кроя их предъявить нечего.
            </Text>
          ) : null}
          {unassignedPlanned > 0 ? (
            <Text size='micro' variant='label'>
              в плане партии {unassignedPlanned} строк(и) без продукта — их заказ не сопоставим с
              колорвеем настила, поэтому в колонке «заказано» у соответствующих размеров стоит «—».
            </Text>
          ) : null}

          {/* ТКАНЬ НА ИЗДЕЛИЕ (Ф4): норма расхода в карточке — план; здесь факт полотна настилов
              впервые встречается с выкроенным. ЭТО НЕ ДРЕЙФ НАСТИЛА (actualDriftPercent — факт
              против геометрии настила, его владелец — сервер): здесь другая пара чисел — факт на
              изделие против нормы на изделие. */}
          <GroupLabel>ткань на изделие · пары (колорвей × слот)</GroupLabel>
          <Text size='micro' variant='label'>
            факт полотна ÷ выкроено — сколько ткани стоил КРОЙ (брак кроя внутри: ткань на него
            потрачена); факт ÷ принято в пошив — сколько стоило ГОДНОЕ изделие; разница — цена брака
            кроя в ткани. Настилы складываются только ВНУТРИ пары; полотно разных слотов и разных
            единиц не складывается — изделию нужны все его слои.
          </Text>
          {!anyFact ? (
            factFrozen ? (
              // Необратимость называется вслух: иначе оператор ищет кнопку, которой нет.
              <CalloutBox tone='note'>
                <Text size='small'>
                  Замеров полотна нет, а запись факта закрыта статусом партии — «ткань на изделие»
                  по этим настилам не посчитается уже никогда: приёмка кроя правится и на закрытой
                  партии (знаменатель уточняем), но числитель уже не появится.
                </Text>
              </CalloutBox>
            ) : (
              <Text size='small' variant='inactive'>
                замеры полотна ещё не внесены — «на изделие» посчитается после замера (факт расхода
                вносится на настиле в плане настилов выше)
              </Text>
            )
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <th>пара</th>
                  <th>полотно</th>
                  <th>выкроено / годных</th>
                  <th>на крой</th>
                  <th>на годное</th>
                  <th className='w-full'>оговорки</th>
                </tr>
              </thead>
              <tbody>
                {pairGroups.map((p) => {
                  const report = pairCloth.get(p.key);
                  const label = `${colorwayLabel(p.colorwayId)} · ${p.slotName}`;
                  if (!report) return null;
                  const { perUnit, norm } = report;
                  if (!perUnit.ok) {
                    // Отказ агрегата НАЗЫВАЕТ настилы без замера (clothRefusalText) — смешанная
                    // пара, где часть настилов с фактом, дала бы число ни о чём.
                    return (
                      <tr key={p.key}>
                        <td className='text-left'>{label}</td>
                        <td>
                          <EmptyCell />
                        </td>
                        <td>
                          <EmptyCell />
                        </td>
                        <td>
                          <EmptyCell />
                        </td>
                        <td>
                          <EmptyCell />
                        </td>
                        <td className='text-left'>
                          {p.slotless ? (
                            <Text size='micro' component='span' className='block text-warning'>
                              у настила нет идентификатора слота BOM (легаси-запись) — строка
                              показана отдельно и ни с чем не складывается
                            </Text>
                          ) : null}
                          <Text size='micro' component='span' className='block text-labelColor'>
                            {clothRefusalText(perUnit.refusal, { pair: true })}
                          </Text>
                        </td>
                      </tr>
                    );
                  }
                  const u = perUnit.unitLabel;
                  const notes: { text: string; tone: 'error' | 'warning' | 'label' }[] = [];
                  if (p.slotless)
                    notes.push({
                      text: 'у настила нет идентификатора слота BOM (легаси-запись) — строка показана отдельно и ни с чем не складывается',
                      tone: 'warning',
                    });
                  if (perUnit.mixed) notes.push({ text: 'среднее по составу пары', tone: 'label' });
                  // Признака «добор» в данных нет: настил, кроивший ЗАМЕНУ бракованных панелей, а
                  // не новые комплекты, раздувает знаменатель, и посчитать правильно НЕЛЬЗЯ —
                  // поэтому каждый агрегат из >1 настила несёт оговорку с направлением ошибки.
                  // Эвристику «угадать добор по соотношению» не заводим: она ошибалась бы молча,
                  // а оговорка — нет.
                  if (perUnit.layCount > 1)
                    notes.push({
                      text: `настилов в паре: ${perUnit.layCount} — если какой-то из них добор (замена бракованных панелей, а не новые комплекты), знаменатель раздут: «на изделие» и процент к норме занижены`,
                      tone: 'warning',
                    });
                  if (perUnit.unreportedLays.length > 0)
                    notes.push({
                      text: `крой не отчитан: «${perUnit.unreportedLays.join('», «')}» — знаменатель занижен`,
                      tone: 'warning',
                    });
                  if (perUnit.missingSizes.length > 0)
                    notes.push({
                      text: `нет приёмки по размерам: ${perUnit.missingSizes
                        .map(sizeLabel)
                        .join(', ')} — «на изделие» завышено и будет уменьшаться по мере ввода`,
                      tone: 'warning',
                    });
                  // «Принято больше выкроенного» — невозможное состояние данных, и никакая другая
                  // строка его не красит (цепочка чисел отмечает только принято < выкроено).
                  if (perUnit.acceptedOverCut)
                    notes.push({
                      text: `принято ${perUnit.acceptedTotal} при выкроенных ${perUnit.cutTotal} — так не бывает: какое-то из чисел врёт, проверьте строки приёмки`,
                      tone: 'error',
                    });
                  if (perUnit.scrapPerGood != null)
                    notes.push({
                      text: `цена брака кроя: +${fmtQty(perUnit.scrapPerGood)} ${u} на годное`,
                      tone: 'error',
                    });
                  // «Принято меньше выкроенного» имеет ДВЕ причины, и данные их не различают:
                  // accepted_qty — NOT NULL DEFAULT 0, поэтому незаполненная приёмка приезжает
                  // нулём. Признак — по ОТДЕЛЬНЫМ строкам (настил + размер), с именами ОБОИХ:
                  // сумма по размеру прятала бы незаполненную строку одного настила за принятыми
                  // соседнего, а без имени настила оператору в паре негде искать.
                  if (perUnit.acceptedZeroRows.length > 0)
                    notes.push({
                      text: `принято ровно 0: ${perUnit.acceptedZeroRows
                        .map((z) => `${sizeLabel(z.sizeId)} на «${z.lay}»`)
                        .join(', ')} — если приёмку там не заполнили, годное занижено и «цена брака» завышена`,
                      tone: 'warning',
                    });
                  if (norm) {
                    if (norm.ok) {
                      const d = fmtDeltaPct(norm.deltaPct);
                      // partlyGrossed: процент начислен только на слагаемые без отходов внутри —
                      // общая фраза «+10% раскроя» читалась бы как процент на всю норму.
                      notes.push({
                        text: `к норме ${fmtQty(norm.normPerUnit)} ${norm.unitLabel}/изд (${norm.sourceLabel}${
                          norm.grossed
                            ? norm.partlyGrossed
                              ? ` + ${fmtQty(norm.wastagePct ?? 0)}% раскроя только на часть без отходов внутри`
                              : ` + ${fmtQty(norm.wastagePct ?? 0)}% раскроя`
                            : ''
                        }${norm.weighted ? ', взвешенной по составу' : ''}): ${d.text}`,
                        tone: d.over ? 'error' : 'label',
                      });
                      // С ЧЕМ сравнивали — ревизия прогона или живая карточка. Отдельной строкой,
                      // потому что фолбэк на живую карту при нечитаемом снапшоте обязан звучать
                      // тревогой, а не терять слова внутри длинной подписи процента.
                      notes.push({
                        text: normBasisText(norm.basis),
                        tone: norm.basis.kind === 'live-broken-snapshot' ? 'warning' : 'label',
                      });
                    } else {
                      notes.push({
                        text: `к норме — ${normRefusalText(norm.refusal, sizeLabel)}`,
                        tone: 'label',
                      });
                      // Отказ тоже говорит, в ЧЬЕЙ рецептуре искали: «нормы на пару нет» в
                      // ревизии — не то же, что в живой карточке.
                      if (norm.basis)
                        notes.push({
                          text: normBasisText(norm.basis),
                          tone: norm.basis.kind === 'live-broken-snapshot' ? 'warning' : 'label',
                        });
                    }
                  }
                  return (
                    <tr key={p.key}>
                      <td className='text-left'>{label}</td>
                      <td>
                        {fmtQty(perUnit.factTotal)} {u}
                      </td>
                      <td>
                        {perUnit.cutTotal} / {perUnit.acceptedTotal}
                      </td>
                      <td>
                        {fmtQty(perUnit.perCut)} {u}
                      </td>
                      {/* «Годных 0» не утверждается: нулём приезжает и незаполненная приёмка
                          (accepted_qty NOT NULL DEFAULT 0). Клетка говорит про ЧИСЛО, оговорка —
                          в примечаниях. */}
                      <td className={perUnit.perAccepted == null ? 'text-error' : ''}>
                        {perUnit.perAccepted == null
                          ? 'принято 0'
                          : `${fmtQty(perUnit.perAccepted)} ${u}`}
                      </td>
                      <td className='text-left'>
                        {notes.length === 0 ? (
                          <EmptyCell />
                        ) : (
                          notes.map((n) => (
                            <Text
                              key={n.text}
                              size='micro'
                              component='span'
                              className={`block ${
                                n.tone === 'error'
                                  ? 'text-error'
                                  : n.tone === 'warning'
                                    ? 'text-warning'
                                    : 'text-labelColor'
                              }`}
                            >
                              {n.text}
                            </Text>
                          ))
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          )}

          <GroupLabel>ввод по настилам</GroupLabel>
          <Text size='micro' variant='label'>
            Строка приёмки — пара (настил, размер); повторное сохранение ПРАВИТ её, а не заводит
            вторую. Пустая клетка — «не считали», но лишь до сохранения строки: сохранённая хранит
            оба числа, и пустое поле уедет нулём, потом неотличимым от посчитанного. Чтобы сказать
            «этого размера на этом настиле не кроили», удалите строку.
          </Text>

          {lays.map((lay) => {
            const layKey = lay.layKey ?? '';
            const sizes = layRows(layKey);
            const addable = addableSizes(layKey);
            const dirty = dirtySizes(lay);
            return (
              <div key={layKey} className='flex flex-col'>
                <GroupLabel
                  action={
                    editable ? (
                      <Button
                        type='button'
                        variant='secondary'
                        size='xs'
                        disabled={dirty.length === 0 || savingLay === layKey}
                        onClick={() => saveLay(lay)}
                      >
                        {savingLay === layKey
                          ? 'сохраняем…'
                          : dirty.length > 0
                            ? `сохранить · ${dirty.length}`
                            : 'сохранить'}
                      </Button>
                    ) : null
                  }
                >
                  {layTitle(lay)}
                </GroupLabel>

                {sizes.length === 0 ? (
                  <Text size='small' variant='inactive'>
                    у настила ещё нет состава — добавьте секцию с раскладкой в плане настилов выше
                    {editable && addable.length > 0 ? ' или внесите размер вручную' : ''}
                  </Text>
                ) : (
                  <DataTable>
                    <thead>
                      <tr>
                        <th>размер</th>
                        <th title='сколько изделий этого размера кроит сам настил'>по настилу</th>
                        <th>выкроено</th>
                        <th>принято в пошив</th>
                        <th className='w-full'>заметка</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {sizes.map((sizeId) => {
                        const stored = receiptByRow.get(rowKey(layKey, sizeId));
                        const d = shownDraft(layKey, sizeId);
                        const plan = layPlanQty.get(rowKey(layKey, sizeId));
                        const label = `${layTitle(lay)} ${sizeLabel(sizeId)}`;
                        return (
                          <tr key={sizeId}>
                            <td>
                              {sizeLabel(sizeId)}
                              {isDirty(layKey, sizeId) ? (
                                <Text
                                  size='nano'
                                  tracking='label'
                                  component='span'
                                  className='ml-1 uppercase text-warning'
                                >
                                  не сохранено
                                </Text>
                              ) : null}
                            </td>
                            <td>{plan == null ? <EmptyCell /> : plan}</td>
                            <td>
                              {editable ? (
                                <Input
                                  className='ml-auto w-16 text-right'
                                  inputMode='numeric'
                                  aria-label={`${label} выкроено`}
                                  value={d.cut}
                                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                    setField(layKey, sizeId, 'cut', digits(e.target.value))
                                  }
                                />
                              ) : d.cut === '' ? (
                                <EmptyCell />
                              ) : (
                                d.cut
                              )}
                            </td>
                            <td>
                              {editable ? (
                                <Input
                                  className='ml-auto w-16 text-right'
                                  inputMode='numeric'
                                  aria-label={`${label} принято в пошив`}
                                  value={d.accepted}
                                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                    setField(layKey, sizeId, 'accepted', digits(e.target.value))
                                  }
                                />
                              ) : d.accepted === '' ? (
                                <EmptyCell />
                              ) : (
                                d.accepted
                              )}
                            </td>
                            <td>
                              {editable ? (
                                <Input
                                  className='text-left'
                                  aria-label={`${label} заметка`}
                                  value={d.note}
                                  maxLength={512}
                                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                                    setField(layKey, sizeId, 'note', e.target.value)
                                  }
                                />
                              ) : (
                                <span className='block text-left'>{d.note || <EmptyCell />}</span>
                              )}
                              {stored?.updatedBy ? (
                                <Text size='nano' variant='label' className='block text-left'>
                                  {stored.updatedBy}
                                  {runDate(stored.updatedAt)
                                    ? ` · ${runDate(stored.updatedAt)}`
                                    : ''}
                                </Text>
                              ) : null}
                            </td>
                            <td>
                              {editable && stored ? (
                                <Button
                                  type='button'
                                  variant='secondary'
                                  size='xs'
                                  aria-label={`удалить строку приёмки · ${label}`}
                                  onClick={() => setDeleting({ lay, sizeId })}
                                >
                                  ✕
                                </Button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                      <LayClothTotalRow
                        planTotal={sizes.reduce(
                          (s, sz) => s + (layPlanQty.get(rowKey(layKey, sz)) ?? 0),
                          0,
                        )}
                        stored={receiptsByLay.get(layKey) ?? []}
                        report={clothByLay.get(layKey)}
                        hasFact={layActualQty(lay) !== ''}
                      />
                    </tbody>
                  </DataTable>
                )}

                {editable && addable.length > 0 ? (
                  <div className='mt-1'>
                    <select
                      className='border border-borderColor bg-bgColor px-[7px] py-[3px] text-textBaseSize'
                      aria-label={`добавить размер в приёмку · ${layTitle(lay)}`}
                      value=''
                      onChange={(e) => {
                        const s = Number(e.target.value);
                        if (!s) return;
                        setExtraSizes((prev) => ({
                          ...prev,
                          [layKey]: [...(prev[layKey] ?? []), s],
                        }));
                      }}
                    >
                      <option value=''>+ размер…</option>
                      {addable.map((s) => (
                        <option key={s} value={s}>
                          {sizeLabel(s)}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
            );
          })}
        </>
      )}

      <ConfirmationModal
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        onConfirm={confirmDelete}
        title='удалить строку приёмки кроя'
        confirmLabel='удалить'
        closeOnConfirm={false}
        width='sm'
      >
        <Text size='small'>
          {deleting
            ? `${layTitle(deleting.lay)} · ${sizeLabel(deleting.sizeId)}. Удаление говорит «этого размера на этом настиле не кроили» — это не то же самое, что счёт, равный нулю.`
            : ''}
        </Text>
      </ConfirmationModal>
    </Section>
  );
}

/**
 * Итожная строка таблицы ввода ОДНОГО настила: Σ по колонкам + ткань на изделие.
 *
 * Суммы — по СОХРАНЁННЫМ строкам, тем же числам, что и «ткань на изделие» рядом: несохранённый
 * черновик уже помечен в своей строке словом «не сохранено», а итог, прыгающий от каждого нажатия
 * клавиши, врал бы про то, что знает база.
 */
function LayClothTotalRow({
  planTotal,
  stored,
  report,
  hasFact,
}: {
  planTotal: number;
  stored: common_ProductionRunCutReceipt[];
  report?: ClothReport;
  hasFact: boolean;
}) {
  // Ни строк, ни замера — итожить нечего, и строка из пустых клеток обещала бы счёт, которого нет.
  if (stored.length === 0 && !hasFact) return null;
  const cut = stored.reduce((s, r) => s + wireInt(r.cutQty), 0);
  const accepted = stored.reduce((s, r) => s + wireInt(r.acceptedQty), 0);
  return (
    <TotalRow>
      <td>Σ</td>
      <td>{planTotal > 0 ? planTotal : <EmptyCell />}</td>
      <td>{stored.length > 0 ? cut : <EmptyCell />}</td>
      <td>{stored.length > 0 ? accepted : <EmptyCell />}</td>
      <td className='text-left' colSpan={2}>
        <LayClothSummary report={report} />
      </td>
    </TotalRow>
  );
}

// Ткань на изделие одного настила — та же арифметика, что на его карточке в плане настилов;
// сравнение с нормой здесь СОЗНАТЕЛЬНО не повторяется: его несут карточка настила и таблица пар,
// а третья копия того же процента читалась бы как третий показатель. «Принято 0», а не «годных 0»:
// нулём приезжает и незаполненная приёмка (accepted_qty NOT NULL DEFAULT 0), утверждать «годных
// нет» строка права не имеет.
function LayClothSummary({ report }: { report?: ClothReport }) {
  if (!report) return null;
  const { perUnit } = report;
  if (!perUnit.ok) {
    const r = perUnit.refusal;
    if (r.kind === 'zero-cut') {
      return (
        <Text size='micro' component='span' className='block text-error'>
          выкроено 0 — полотно {fmtQty(r.factTotal)} {r.unitLabel} без записанных изделий; ноль мог
          быть и не введён (пустое поле сохраняется нулём)
        </Text>
      );
    }
    if (r.kind === 'no-receipts') {
      return (
        <Text size='micro' component='span' className='block text-labelColor'>
          полотно {fmtQty(r.factTotal)} {r.unitLabel} — крой не отчитан, «на изделие» делить не на
          что
        </Text>
      );
    }
    return (
      <Text size='micro' component='span' className='block text-labelColor'>
        {clothRefusalText(r)}
        {r.kind === 'no-fact' && !r.frozen ? ' — «на изделие» посчитается после замера' : ''}
      </Text>
    );
  }
  const u = perUnit.unitLabel;
  return (
    <Text size='micro' component='span' className='block text-labelColor'>
      полотно {fmtQty(perUnit.factTotal)} {u} → {fmtQty(perUnit.perCut)} {u}/изд кроя
      {perUnit.perAccepted != null
        ? ` · ${fmtQty(perUnit.perAccepted)} ${u}/изд годного`
        : ' · принято 0'}
      {perUnit.acceptedOverCut ? ' · принято больше выкроенного — так не бывает' : ''}
      {perUnit.missingSizes.length > 0 ? ' · не по всем размерам — завышено' : ''}
    </Text>
  );
}

/**
 * Цепочка одного колорвея. Каждая строка — пара (колорвей, размер), встречающаяся РОВНО ОДИН РАЗ.
 *
 * Цвет здесь никогда не идёт один: рядом с каждым красным числом стоит слово в колонке
 * «расхождение». Красный — потеря (недокрой, брак раскроя), синий — измеренный факт, требующий
 * решения человека (перекрой, расхождение слотов), серый — «не мерили».
 */
function ChainTable({ rows, sizeLabel }: { rows: ChainRow[]; sizeLabel: (id: number) => string }) {
  if (rows.length === 0) return null;

  const sum = (pick: (r: ChainRow) => number | undefined) =>
    rows.reduce((s, r) => s + (pick(r) ?? 0), 0);
  const anyIncomplete = rows.some((r) => r.reported < r.expected || r.reported === 0);

  return (
    <DataTable>
      <thead>
        <tr>
          <th>размер</th>
          <th>заказано</th>
          <th>выкроено</th>
          <th>принято в пошив</th>
          <th>сдано готовым</th>
          <th>брак</th>
          <th className='w-full'>расхождение</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const notes: { text: string; tone: 'error' | 'warning' | 'label' }[] = [];
          const undercut =
            r.cut != null && r.planned != null && r.reported === r.expected && r.cut < r.planned
              ? r.planned - r.cut
              : 0;
          const overcut =
            r.cut != null && r.planned != null && r.cut > r.planned ? r.cut - r.planned : 0;
          const cutScrap =
            r.cut != null && r.accepted != null && r.accepted < r.cut ? r.cut - r.accepted : 0;
          const slotSpread =
            r.slots.length > 1 &&
            Math.min(...r.slots.map((s) => s.cut)) < Math.max(...r.slots.map((s) => s.cut));

          if (r.expected === 0) {
            // Размер заказан, но ни один настил его не кроит. Это находка ПЛАНА настилов (там она и
            // красная, в матрице покрытия), а не приёмки: приёмке тут физически не о чем отчитаться.
            notes.push({ text: 'размер ни в одном настиле', tone: 'label' });
          } else if (r.reported === 0) {
            notes.push({ text: 'приёмка не введена', tone: 'label' });
          } else if (r.reported < r.expected) {
            // Недокрой при неполном вводе — не факт, а следствие незаполненной формы, и красным он
            // был бы ложной тревогой. Поэтому здесь говорится ровно то, что известно.
            notes.push({
              text: `введено по ${r.reported} из ${r.expected} настилов`,
              tone: 'label',
            });
          }
          if (undercut > 0) notes.push({ text: `недокрой ${undercut}`, tone: 'error' });
          if (overcut > 0) notes.push({ text: `перекрой ${overcut}`, tone: 'warning' });
          if (cutScrap > 0) notes.push({ text: `брак раскроя ${cutScrap}`, tone: 'error' });
          if (slotSpread)
            notes.push({
              text: `слоты расходятся: ${r.slots.map((s) => `${s.label} ${s.cut}`).join(' · ')}`,
              tone: 'warning',
            });

          const cutTone = undercut > 0 ? 'text-error' : overcut > 0 ? 'text-warning' : '';
          const acceptedTone = cutScrap > 0 ? 'text-error' : '';

          return (
            <tr key={r.sizeId}>
              <td>{sizeLabel(r.sizeId)}</td>
              <td>{r.planned == null ? <EmptyCell /> : r.planned}</td>
              <td className={cutTone}>{r.cut == null ? <EmptyCell /> : r.cut}</td>
              <td className={acceptedTone}>{r.accepted == null ? <EmptyCell /> : r.accepted}</td>
              <td>{r.received == null ? <EmptyCell /> : r.received}</td>
              <td>{r.defect == null ? <EmptyCell /> : r.defect}</td>
              <td className='text-left'>
                {notes.length === 0 ? (
                  <EmptyCell>сходится</EmptyCell>
                ) : (
                  notes.map((n) => (
                    <Text
                      key={n.text}
                      size='micro'
                      component='span'
                      className={`block ${n.tone === 'error' ? 'text-error' : n.tone === 'warning' ? 'text-warning' : 'text-labelColor'}`}
                    >
                      {n.text}
                    </Text>
                  ))
                )}
              </td>
            </tr>
          );
        })}
        <TotalRow>
          <td>Σ</td>
          <td>{sum((r) => r.planned)}</td>
          <td>{sum((r) => r.cut)}</td>
          <td>{sum((r) => r.accepted)}</td>
          <td>{sum((r) => r.received)}</td>
          <td>{sum((r) => r.defect)}</td>
          <td className='text-left'>
            {anyIncomplete ? (
              <Text size='micro' component='span' className='text-labelColor'>
                итог кроя неполный — не по всем настилам введено
              </Text>
            ) : null}
          </td>
        </TotalRow>
      </tbody>
    </DataTable>
  );
}
