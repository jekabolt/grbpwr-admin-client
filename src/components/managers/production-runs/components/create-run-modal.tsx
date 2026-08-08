import * as DialogPrimitives from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  CheckProductionRunReadinessRequest,
  ProductionRunReadinessCell,
  ProductionRunReadinessColorway,
  common_ProductionRunLine,
  common_ProductionRunStatus,
} from 'api/proto-http/admin';
import { techCardKeys, useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { ROUTES } from 'constants/routes';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { extractFieldViolations } from 'utils/field-errors';
import { decimalToInput, inputToDecimal, sanitizeDecimal } from 'utils/decimal';
import { ulid } from 'utils/ulid';
import { runDetailPath, runStatusLabel, runStatusOptions } from './options';
import {
  CoverageTable,
  FindingGroup,
  FindingRow,
  ReadinessCaveats,
  ReadinessVerdict,
  allFindings,
  isAuxShortCircuit,
  isBlocker,
  isOk,
  isUnchecked,
  isWarning,
  pluralRu,
} from './run-readiness';
import { useRunReadiness, useSaveProductionRun } from './useProductionRuns';

// СОЗДАНИЕ ПРОГОНА (Ф6.4) — новая поверхность, а не флаг в редакторе шапки.
//
// production-run-modal.tsx остаётся тем, чем был: read-modify-write ШАПКИ существующего прогона.
// Создание — другая работа: карточка → релиз → колорвеи → количества → покрытие, и на каждом шаге
// гейт готовности пересчитывает вердикт по ТОМУ ЖЕ payload'у, который уйдёт в CreateProductionRun.
// Один компонент на две формы сделал бы обе хуже.
//
// ГЕЙТ ЗДЕСЬ — ПОДСКАЗКА. Авторитет на сервере: CreateProductionRun пересчитывает вердикт над
// присланной сеткой, и это не перестраховка — сохранение раскладки не бампает tech_card.lock_version,
// значит пересъёмку нормы между открытием модалки и отправкой клиент обнаружить не может в принципе.
// Поэтому отказ create разбирается здесь как ПЕРВОКЛАССНЫЙ результат, а не как «неожиданная ошибка».

const cell = 'w-full border border-textInactiveColor bg-bgColor px-2 py-1.5 text-textBaseSize';
const qtyKey = (colorwayId: number, sizeId: number) => `${colorwayId}:${sizeId}`;
const dateToIso = (d: string) => (d ? new Date(`${d}T00:00:00Z`).toISOString() : undefined);
const ARCHIVED = 'COLORWAY_LIFECYCLE_STATUS_ARCHIVED';

type Draft = {
  techCardId: number;
  releaseId: number;
  status: common_ProductionRunStatus;
  startedAt: string;
  plannedStartAt: string;
  promisedAt: string;
  notes: string;
  actualWastagePercent: string;
};

const emptyDraft: Draft = {
  techCardId: 0,
  releaseId: 0,
  status: 'PRODUCTION_RUN_STATUS_PLANNED',
  startedAt: '',
  plannedStartAt: '',
  promisedAt: '',
  notes: '',
  actualWastagePercent: '',
};

export function CreateRunModal({
  open,
  onOpenChange,
  initialTechCardId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Seed the tech card from the spine's [plan run] deep link (?techCardId=…&new=1). */
  initialTechCardId?: number;
}) {
  const { showMessage } = useSnackBarStore();
  const { dictionary } = useDictionary();
  const navigate = useNavigate();
  const create = useSaveProductionRun();

  const [d, setD] = useState<Draft>(emptyDraft);
  const [selected, setSelected] = useState<number[]>([]);
  const [qty, setQty] = useState<Record<string, string>>({});
  // Отказ гейта на create — со списком нарушений, каждое со стабильным ключом впереди описания.
  // Остаётся на экране до следующей попытки: это факт о запросе, а не тост.
  const [refusal, setRefusal] = useState<{ message: string; rows: string[] } | null>(null);
  const [showPassed, setShowPassed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setD({ ...emptyDraft, techCardId: initialTechCardId ?? 0 });
    setSelected([]);
    setQty({});
    setRefusal(null);
  }, [open, initialTechCardId]);

  const { data: tcData } = useQuery({
    // Under techCardKeys.lists() so every tech-card mutation's invalidation reaches the picker.
    queryKey: [...techCardKeys.lists(), 'forRun'],
    queryFn: () =>
      adminService.ListTechCards({
        limit: 200,
        offset: 0,
        orderFactor: undefined,
        stage: undefined,
        gender: undefined,
        brand: undefined,
        name: undefined,
        purpose: undefined,
        skuSeason: undefined,
        productId: undefined,
        categoryIds: undefined,
      }),
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });
  const techCards = tcData?.techCards ?? [];

  const { data: relData } = useQuery({
    queryKey: ['techCardReleasesForRun', d.techCardId],
    queryFn: () => adminService.ListTechCardReleases({ techCardId: d.techCardId }),
    enabled: open && d.techCardId > 0,
  });
  const releases = relData?.releases ?? [];

  const { data: card } = useTechCard(open && d.techCardId > 0 ? d.techCardId : undefined);
  const isAux = card?.techCard?.purpose === 'TECH_CARD_PURPOSE_AUXILIARY';
  const sizeIds = useMemo(() => card?.techCard?.sizeIds ?? [], [card]);

  // Колорвеи карточки — тот же источник, что у сетки прогона на детальной странице
  // (techCard.colorways). Архивные не предлагаются: гейт судил бы их `colorway_live` блокером, а
  // предложить строку, единственный смысл которой — покраснеть, значит завести мёртвый контрол.
  // Колорвей без продукта тоже не предлагается: клетка сетки ключуется product_id, и без него
  // приёмке потом нечего засчитывать.
  const colorways = useMemo(
    () =>
      (card?.colorways ?? [])
        .filter((c) => (c.colorwayId ?? 0) > 0 && c.status !== ARCHIVED)
        .map((c) => {
          const dc = dictionary?.colors?.find((x) => x.code === c.colorCode);
          return {
            id: c.colorwayId!,
            label: `${c.colorCode ? `${c.colorCode} · ` : ''}${dc?.name ?? c.colorCode ?? `#${c.colorwayId}`}`,
          };
        }),
    [card?.colorways, dictionary?.colors],
  );
  const unpublishedCount = (card?.colorways ?? []).filter(
    (c) => (c.colorwayId ?? 0) === 0 && c.status !== ARCHIVED,
  ).length;
  const colorwayLabel = useMemo(() => {
    const m = new Map(colorways.map((c) => [c.id, c.label]));
    return (id: number) => m.get(id) ?? (id > 0 ? `#${id}` : '—');
  }, [colorways]);
  const sizeLabel = (id: number) => String(findInDictionary(dictionary, id, 'size') || id || '—');

  // Клетки — только положительные количества. Ноль в сетке значит «этот размер не шьём», а не
  // «шьём нисколько», и слать его гейту было бы просьбой судить строку, которой не будет.
  const cells: ProductionRunReadinessCell[] = useMemo(() => {
    const out: ProductionRunReadinessCell[] = [];
    for (const cw of selected) {
      for (const s of sizeIds) {
        const n = Number(qty[qtyKey(cw, s)]);
        if (Number.isFinite(n) && n > 0) out.push({ colorwayId: cw, sizeId: s, plannedQty: n });
      }
    }
    return out;
  }, [selected, sizeIds, qty]);

  // ─── ГЕЙТ: ДВА ВОПРОСА, ДВА ВЫЗОВА ──────────────────────────────────────────────────────────
  //
  // ОБЗОР (survey) спрашивает про ВСЕ живые колорвеи карточки и ни про одно количество. Отвечает
  // ровно на один вопрос — «какие колорвеи сегодня вообще можно запускать» — и используется ровно
  // для него: бейдж и доступность галочки в списке. Без него включение блокирующего режима стало бы
  // сюрпризом: красная метка на колорвее обязана быть видна ДО того, как его выбрали, иначе в день
  // включения оператор впервые узнаёт и о метке, и о запрете разом.
  //
  // ЗАПРОС (verdict) — это РОВНО то, что уйдёт в CreateProductionRun. Его `wouldBlock` и есть та
  // фраза, которую печатает модалка, и поэтому он отдельный вызов, а не фильтр по обзору: обзор
  // судит колорвеи, которых в этом прогоне может не быть, и его вердикт отвечал бы на другой вопрос.
  const surveyRequest: CheckProductionRunReadinessRequest | null =
    open && d.techCardId > 0
      ? {
          techCardId: d.techCardId,
          releaseId: d.releaseId || 0,
          colorwayIds: colorways.map((c) => c.id),
          cells: [],
          runId: 0,
        }
      : null;
  const survey = useRunReadiness(surveyRequest);
  const surveyColorway = useMemo(() => {
    const m = new Map<number, ProductionRunReadinessColorway>();
    for (const c of survey.data?.colorways ?? []) m.set(c.colorwayId ?? 0, c);
    return m;
  }, [survey.data]);

  // Дебаунс — по СОСТАВУ запроса, а не по каждому нажатию: набирая «120» оператор проходит через
  // 1 и 12, и три вердикта на одно число это три повода не поверить четвёртому.
  const liveRequest: CheckProductionRunReadinessRequest | null =
    open && d.techCardId > 0 && !isAux && selected.length > 0
      ? {
          techCardId: d.techCardId,
          releaseId: d.releaseId || 0,
          colorwayIds: selected,
          cells,
          runId: 0,
        }
      : null;
  const liveSignature = liveRequest ? JSON.stringify(liveRequest) : '';
  const [debounced, setDebounced] = useState<CheckProductionRunReadinessRequest | null>(null);
  useEffect(() => {
    if (!liveRequest) {
      setDebounced(null);
      return;
    }
    const t = setTimeout(() => setDebounced(JSON.parse(liveSignature)), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveSignature]);
  const verdict = useRunReadiness(debounced);

  // Для aux-карточки судящим ответом является сам обзор: сервер коротко замыкает гейт на
  // purpose=auxiliary и не выпускает ни одной колорвейной строки — колорвеев у такой карточки нет
  // по устройству. Второй вызов спросил бы то же самое.
  // `keepPreviousData` держит предыдущий ответ, чтобы панель не мигала на каждой цифре — но
  // предыдущий ответ ОТНОСИТСЯ К ПРЕДЫДУЩЕМУ ЗАПРОСУ. Как только вопроса нет (сняли все колорвеи,
  // сменили карточку), вердикт обязан исчезнуть, а не остаться висеть вердиктом о том, чего больше
  // никто не спрашивал.
  const report = isAux ? survey.data : debounced ? verdict.data : undefined;
  const auxShortCircuit = isAux && isAuxShortCircuit(survey.data);
  // Ответ относится к предыдущему составу запроса — держим его на экране, но подписываем.
  const recomputing = isAux
    ? survey.isFetching
    : verdict.isFetching || (!!liveRequest && liveSignature !== JSON.stringify(debounced));

  // ОДИН ФАКТ — ОДНО МЕСТО. Строки колорвея живут рядом со СВОИМ колорвеем и в общие группы не
  // попадают: повторить их здесь значило бы, что одна проблема читается как две — та же дисциплина,
  // которой сервер придерживается, не краснея дважды об одном факте.
  //
  // Счётчики в шапке при этом ГЛОБАЛЬНЫЕ (allFindings), поэтому под ними отдельной строкой сказано,
  // сколько блокеров сидит на колорвеях: число, которого не видно в списке под ним, — хуже, чем
  // отсутствие числа.
  const rows = useMemo(() => allFindings(report), [report]);
  // `release_frozen` печатается ПОД СЕЛЕКТОМ РЕЛИЗА, а не в общем списке: это единственная строка
  // гейта, которая чинится прямо здесь, в этой модалке, — и ответ «выберите релиз» рядом с
  // выпадающим списком релизов стоит больше, чем ссылка на вкладку history тремя экранами ниже.
  // Из общих групп она поэтому изъята: один факт — одно место.
  //
  // Берётся у ЗАПРОСА, а при его отсутствии — у ОБЗОРА: это карточная строка, она не зависит ни от
  // одного количества, и ждать первой выбранной галочки, чтобы сказать «прогон планируется от живой
  // карточки», значило бы промолчать ровно там, где решение о релизе и принимается.
  const releaseRow = ((report ?? survey.data)?.card ?? []).find((f) => f.key === 'release_frozen');
  const notRelease = (f: { key?: string }) => f.key !== 'release_frozen';
  const cardRunRows = useMemo(
    () => [...(report?.card ?? []).filter(notRelease), ...(report?.run ?? [])],
    [report?.card, report?.run],
  );
  const blockerRows = cardRunRows.filter(isBlocker);
  const warningRows = cardRunRows.filter(isWarning);
  const uncheckedRows = cardRunRows.filter(isUnchecked);
  const passedRows = rows.filter(isOk).filter(notRelease);
  const colorwayBlockers = (report?.colorways ?? []).reduce(
    (n, c) => n + (c.findings ?? []).filter(isBlocker).length,
    0,
  );

  // РЕЖИМ ГЕЙТА — настройка цеха, одна и та же в обоих ответах, поэтому берётся из любого пришедшего.
  // Читать его только из «запроса» значило бы, что до первой выбранной галочки модалка не знает, в
  // каком режиме живёт, — а именно там, на невыбранном колорвее, погашение галочки и работает.
  const blockingEnabled = !!(report ?? survey.data)?.blockingEnabled;

  // Что мешает СОЗДАТЬ. Блокирующий режим — единственное, что превращает вердикт в запрет; в режиме
  // отчёта оператор создаёт прогон и видит, что именно начнёт отбиваться.
  const blockedSelection = selected.filter((id) => {
    const c = (report?.colorways ?? []).find((x) => x.colorwayId === id);
    return c ? !c.ready : false;
  });
  // `wouldBlock` — ЭТО ТО, ЧТО СДЕЛАЕТ CreateProductionRun с этим запросом, и берётся оно только у
  // «запроса»: обзор судит колорвеи, которых в прогоне может не быть, и его wouldBlock запретил бы
  // создать законный прогон из-за колорвея, лежащего в стороне. Отдельным полем сервер его отдаёт
  // ровно потому, что «!ready && blockingEnabled» — предложение, в котором клиенту ошибаться нельзя.
  const gateBlocks = !!report?.blockingEnabled && !!report?.wouldBlock;

  const set = (patch: Partial<Draft>) => setD((prev) => ({ ...prev, ...patch }));
  const toggle = (id: number) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const setCell = (colorwayId: number, sizeId: number, v: string) =>
    setQty((prev) => ({ ...prev, [qtyKey(colorwayId, sizeId)]: v.replace(/[^0-9]/g, '') }));

  // Префилла «из типового тиража» здесь больше нет: тираж удалён с тех-карты, и подставлять
  // в план партии нечего. Замены нет НАРОЧНО — количества на прогоне набирают руками, это и был
  // смысл разделения: карточка описывает изделие, прогон — сколько его шьют в этот раз.

  const totalUnits = cells.reduce((s, c) => s + (c.plannedQty ?? 0), 0);

  const submit = () => {
    if (!d.techCardId) {
      showMessage('Выберите тех-карту', 'error');
      return;
    }
    setRefusal(null);
    // Сетка едет ВМЕСТЕ с прогоном: гейт судил именно её, и создавать пустой прогон, чтобы набрать
    // те же цифры второй раз на детальной странице, значило бы выбросить и работу, и вердикт.
    const lines: common_ProductionRunLine[] = cells.map((c) => ({
      productId: c.colorwayId,
      sizeId: c.sizeId,
      plannedQty: c.plannedQty,
      receivedQty: undefined,
      defectQty: undefined,
      outputVariantId: undefined,
      lineKey: ulid(),
    }));
    create.mutate(
      {
        run: {
          techCardId: d.techCardId,
          releaseId: d.releaseId || undefined,
          status: d.status,
          startedAt: dateToIso(d.startedAt),
          plannedStartAt: dateToIso(d.plannedStartAt),
          promisedAt: dateToIso(d.promisedAt),
          receivedAt: undefined,
          supplierId: 0,
          notes: d.notes.trim(),
          lines,
          costs: [],
          markerEfficiencyPct: undefined,
          markerNotes: undefined,
          actualWastagePercent: inputToDecimal(d.actualWastagePercent),
        },
      },
      {
        onSuccess: (res) => {
          showMessage('Прогон создан', 'success');
          onOpenChange(false);
          const id = (res as { id?: number })?.id;
          if (id) navigate(runDetailPath(id));
        },
        onError: (e) => {
          // Гейт отвечает FailedPrecondition со списком FieldViolation, по одному на блокер, и
          // описание каждого начинается СТАБИЛЬНЫМ КЛЮЧОМ. Показываем список целиком: смысл
          // серверного отказа именно в том, что он называет ВСЕ причины сразу, а не первую.
          const violations = extractFieldViolations(e);
          if (violations.length > 0) {
            setRefusal({
              message: e instanceof Error ? e.message : 'Гейт готовности отклонил создание',
              rows: violations.map((v) => `${v.field} — ${v.description}`),
            });
            return;
          }
          showMessage(e instanceof Error ? e.message : 'Не удалось создать прогон', 'error');
        },
      },
    );
  };

  return (
    <DialogPrimitives.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay className='fixed inset-0 z-[var(--z-modal)] h-screen bg-overlay' />
        <DialogPrimitives.Content className='fixed inset-x-2.5 top-1/2 z-50 flex max-h-[92vh] w-auto -translate-y-1/2 flex-col overflow-y-auto border border-textInactiveColor bg-bgColor text-textColor lg:inset-x-auto lg:left-1/2 lg:w-[860px] lg:-translate-x-1/2'>
          <div className='sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-textInactiveColor bg-bgColor px-4 py-3'>
            <DialogPrimitives.Title className='text-lg uppercase'>
              новый прогон
            </DialogPrimitives.Title>
            <DialogPrimitives.Close asChild>
              <Button type='button' className='shrink-0 cursor-pointer'>
                [x]
              </Button>
            </DialogPrimitives.Close>
          </div>
          <DialogPrimitives.Description className='sr-only'>
            Тех-карта, релиз, колорвеи и количества будущего прогона, с вердиктом гейта готовности.
          </DialogPrimitives.Description>

          <div className='flex flex-col gap-4 p-4'>
            {/* ── 1–2. карточка и релиз ───────────────────────────────────────────────────── */}
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
              <label className='flex flex-col gap-1'>
                <Text size='small'>тех-карта *</Text>
                <select
                  className={cell}
                  value={d.techCardId || 0}
                  onChange={(e) => {
                    set({ techCardId: Number(e.target.value) || 0, releaseId: 0 });
                    setSelected([]);
                    setQty({});
                    setRefusal(null);
                  }}
                >
                  <option value={0}>— выбрать —</option>
                  {techCards.map((t) => (
                    <option key={t.id} value={t.id}>
                      TC-{t.id} · {t.styleNumber || t.name || 'untitled'}
                    </option>
                  ))}
                </select>
              </label>
              <div className='flex flex-col gap-1'>
                <label className='flex flex-col gap-1'>
                  <Text size='small'>релиз (необязательно — план от снимка)</Text>
                  <select
                    className={cell}
                    value={d.releaseId || 0}
                    onChange={(e) => set({ releaseId: Number(e.target.value) || 0 })}
                  >
                    <option value={0}>— последняя версия карточки —</option>
                    {releases.map((r) => (
                      <option key={r.id} value={r.id}>
                        Rev.{r.releaseNumber ?? '—'}
                        {r.unitCost?.value
                          ? ` · ${decimalToInput(r.unitCost)} ${r.currency || ''}`
                          : ''}
                      </option>
                    ))}
                  </select>
                </label>
                {/* Строка гейта про релиз — ЗДЕСЬ, у контрола, который её гасит. «Последняя версия
                    карточки» остаётся законным выбором: релиз создаётся побочным эффектом перевода
                    карточки в RELEASED и создаётся best-effort, поэтому это ПРЕДУПРЕЖДЕНИЕ, а не
                    запрет — и предупреждение, которое называет цену (плановая себестоимость этого
                    прогона снимется с живой карточки), а не факт.

                    СНАРУЖИ <label>, а не внутри: у строки есть ссылка «починить», а клик по ссылке
                    внутри label браузер вдобавок переадресует контролу — то есть открыл бы список
                    релизов за только что открытой вкладкой. */}
                {releaseRow ? (
                  <FindingRow finding={releaseRow} techCardId={d.techCardId} />
                ) : null}
              </div>
            </div>

            {/* ── AUX: гейт коротко замкнут СЕРВЕРОМ ──────────────────────────────────────── */}
            {isAux ? (
              <div className='flex flex-col gap-2'>
                <GroupLabel flush>вспомогательная карточка</GroupLabel>
                <CalloutBox tone='note'>
                  <Text size='small'>
                    Эта карточка производит МАТЕРИАЛ, а не изделие: колорвеев у неё нет, и гейт норм
                    ткани к ней неприменим — сервер замыкает его накоротко, а не «проходит» проверки.
                    Цвета выпуска и количества планируются на странице прогона.
                  </Text>
                </CalloutBox>
                {auxShortCircuit ? (
                  <Text size='micro' variant='label'>
                    Сервер подтвердил короткое замыкание (card_auxiliary). Ни одна из проверок ткани
                    не выполнялась — и ни одна не считается пройденной.
                  </Text>
                ) : survey.isPending ? (
                  <Text size='micro' variant='label'>
                    спрашиваем гейт…
                  </Text>
                ) : null}
              </div>
            ) : (
              <>
                {/* ── 3. колорвеи ───────────────────────────────────────────────────────── */}
                <div className='flex flex-col gap-1'>
                  <GroupLabel
                    flush
                    action={
                      <Text size='micro' variant='label' component='span'>
                        выбрано {selected.length} из {colorways.length}
                      </Text>
                    }
                  >
                    колорвеи
                  </GroupLabel>
                  {d.techCardId === 0 ? (
                    <Text size='micro' variant='label'>
                      выберите тех-карту
                    </Text>
                  ) : colorways.length === 0 ? (
                    <Text size='micro' variant='label'>
                      у карточки нет живых колорвеев с продуктом
                    </Text>
                  ) : (
                    colorways.map((c) => {
                      const isSelected = selected.includes(c.id);
                      // Вердикт ЭТОГО прогона, если колорвей в него выбран; иначе — обзорный.
                      // Правила у них одни и те же, но судят они разное: обзор отвечает «можно ли
                      // этот колорвей запускать вообще», запрос — «пройдёт ли ИМЕННО ЭТОТ прогон».
                      const cw =
                        (report?.colorways ?? []).find((x) => x.colorwayId === c.id) ??
                        surveyColorway.get(c.id);
                      const known = cw ? !!cw.ready : undefined;
                      // ПОГАШЕНИЕ. В блокирующем режиме неготовый колорвей нельзя ДОБАВИТЬ — но
                      // всегда можно снять: disabled на уже отмеченной галочке запер бы оператора
                      // в состоянии, из которого нет выхода ни вперёд (create отобьют), ни назад.
                      const lockedOut = blockingEnabled && known === false && !isSelected;
                      const findings = (cw?.findings ?? []).filter((f) => !isOk(f));
                      return (
                        <div key={c.id} className='border-b border-hairline py-1'>
                          <label className='flex flex-wrap items-center gap-2'>
                            <input
                              type='checkbox'
                              checked={isSelected}
                              disabled={lockedOut}
                              aria-disabled={lockedOut}
                              onChange={() => toggle(c.id)}
                            />
                            <Text component='span'>{c.label}</Text>
                            {known === false ? (
                              <Pill tone='warn'>не готов</Pill>
                            ) : known === true ? (
                              <Pill tone='ok'>готов</Pill>
                            ) : (
                              <Pill tone='mut'>вердикта нет</Pill>
                            )}
                            {lockedOut ? (
                              <Text size='micro' variant='label' component='span'>
                                гейт блокирует — этот колорвей нельзя добавить в прогон
                              </Text>
                            ) : null}
                          </label>
                          {/* Причины печатаются и у НЕВЫБРАННОГО колорвея, если он не готов: иначе
                              «не готов» — метка без содержания, и узнать, что именно чинить, можно
                              только положив в прогон то, что в него класть нельзя. */}
                          {(isSelected || known === false) && findings.length > 0 ? (
                            <div className='pl-6'>
                              {findings.map((f, i) => (
                                <FindingRow
                                  key={`${f.key}-${i}`}
                                  finding={f}
                                  techCardId={d.techCardId}
                                />
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                  {unpublishedCount > 0 ? (
                    <Text size='micro' variant='label'>
                      ещё {unpublishedCount}{' '}
                      {pluralRu(unpublishedCount, 'колорвей', 'колорвея', 'колорвеев')} без продукта
                      — строку прогона ключует
                      product_id, поэтому сначала{' '}
                      <Link
                        to={ROUTES.addProduct}
                        target='_blank'
                        rel='noreferrer'
                        className='underline'
                      >
                        создайте продукт ↗
                      </Link>
                    </Text>
                  ) : null}
                </div>

                {/* ── 4. количества ─────────────────────────────────────────────────────── */}
                {selected.length > 0 && sizeIds.length > 0 ? (
                  <div className='flex flex-col gap-1'>
                    <GroupLabel flush>количества (колорвей × размер)</GroupLabel>
                    <div className='overflow-x-auto'>
                      <table className='border-collapse'>
                        <thead>
                          <tr>
                            <th className='border border-hairline px-2 py-1 text-left uppercase'>
                              колорвей
                            </th>
                            {sizeIds.map((s) => (
                              <th
                                key={s}
                                className='border border-hairline px-2 py-1 text-right uppercase'
                              >
                                {sizeLabel(s)}
                              </th>
                            ))}
                            <th className='border border-hairline px-2 py-1 text-right uppercase'>
                              Σ
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {selected.map((cw) => (
                            <tr key={cw}>
                              <td className='border border-hairline px-2 py-1'>
                                {colorwayLabel(cw)}
                              </td>
                              {sizeIds.map((s) => (
                                <td
                                  key={s}
                                  className='border border-hairline px-2 py-1 text-right'
                                >
                                  <input
                                    className='w-14 border border-textInactiveColor bg-bgColor px-1 text-right text-textBaseSize'
                                    inputMode='numeric'
                                    value={qty[qtyKey(cw, s)] ?? ''}
                                    onChange={(e) => setCell(cw, s, e.target.value)}
                                  />
                                </td>
                              ))}
                              <td className='border border-hairline px-2 py-1 text-right tabular-nums'>
                                {sizeIds.reduce(
                                  (sum, s) => sum + (Number(qty[qtyKey(cw, s)]) || 0),
                                  0,
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : selected.length > 0 ? (
                  <Text size='micro' variant='label'>
                    у карточки пустой размерный ряд — количества вводить не по чему
                  </Text>
                ) : null}
              </>
            )}

            {/* ── ВЕРДИКТ ГЕЙТА ───────────────────────────────────────────────────────────── */}
            <div className='flex flex-col gap-2'>
              <GroupLabel flush>готовность прогона</GroupLabel>
              {d.techCardId === 0 ? (
                <Text size='micro' variant='label'>
                  вердикт появится, когда выбрана карточка
                </Text>
              ) : (isAux ? survey : verdict).isError ? (
                <CalloutBox tone='error'>
                  <Text size='small'>
                    Проверить готовность не удалось. Это не «готово» и не «не готово» — вердикта
                    сейчас нет. Создать прогон всё ещё можно: гейт пересчитывается на сервере при
                    создании, и отказ придёт оттуда.
                  </Text>
                </CalloutBox>
              ) : !report ? (
                <Text size='micro' variant='label'>
                  {selected.length === 0 && !isAux
                    ? 'выберите хотя бы один колорвей — гейт судит тот прогон, который создастся'
                    : 'спрашиваем гейт…'}
                </Text>
              ) : (
                <>
                  <ReadinessVerdict data={report} stale={recomputing} />
                  {colorwayBlockers > 0 ? (
                    <Text size='micro' variant='label'>
                      Из них {colorwayBlockers} — на колорвеях: причина каждого напечатана рядом со
                      своим колорвеем выше.
                    </Text>
                  ) : null}
                  <FindingGroup
                    title='блокеры карточки и прогона'
                    findings={blockerRows}
                    techCardId={d.techCardId}
                  />
                  <FindingGroup
                    title='предупреждения карточки и прогона'
                    findings={warningRows}
                    techCardId={d.techCardId}
                  />
                  {/* НЕ ПРОВЕРЕНО — своя группа, своё слово, и она НИКОГДА не сворачивается вместе
                      с пройденными: «не проверяли» и «проверили, всё хорошо» — разные ответы. */}
                  <FindingGroup
                    title='не проверялось — у сервера нет инструмента'
                    findings={uncheckedRows}
                    techCardId={d.techCardId}
                  />
                  {passedRows.length > 0 ? (
                    <div>
                      <GroupLabel
                        flush
                        action={
                          <Button
                            type='button'
                            variant='underline'
                            size='xs'
                            onClick={() => setShowPassed((v) => !v)}
                          >
                            {showPassed ? 'скрыть' : 'показать'}
                          </Button>
                        }
                      >
                        {`пройдено — ${passedRows.length}`}
                      </GroupLabel>
                      {showPassed
                        ? passedRows.map((f, i) => (
                            <FindingRow
                              key={`${f.key}-${i}`}
                              finding={f}
                              techCardId={d.techCardId}
                            />
                          ))
                        : null}
                    </div>
                  ) : null}
                  <ReadinessCaveats caveats={report.caveats ?? []} />
                </>
              )}
            </div>

            {/* ── 5. покрытие ─────────────────────────────────────────────────────────────── */}
            {!isAux && report && (report.coverage?.length || report.unitCoverage?.length) ? (
              <div className='flex flex-col gap-2'>
                <GroupLabel flush>покрытие — оценка по норме</GroupLabel>
                <CoverageTable
                  coverage={report.coverage ?? []}
                  unitCoverage={report.unitCoverage ?? []}
                  colorwayName={colorwayLabel}
                  sizeName={sizeLabel}
                />
              </div>
            ) : null}

            {/* ── шапка прогона ───────────────────────────────────────────────────────────── */}
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
              <label className='flex flex-col gap-1'>
                <Text size='small'>статус</Text>
                <select
                  className={cell}
                  value={d.status}
                  onChange={(e) => set({ status: e.target.value as common_ProductionRunStatus })}
                >
                  {!runStatusOptions.some((o) => o.value === d.status) && (
                    <option value={d.status}>{runStatusLabel(d.status)}</option>
                  )}
                  {runStatusOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className='flex flex-col gap-1'>
                <Text size='small'>плановый старт</Text>
                <input
                  className={cell}
                  type='date'
                  value={d.plannedStartAt}
                  onChange={(e) => set({ plannedStartAt: e.target.value })}
                />
              </label>
              <label className='flex flex-col gap-1'>
                <Text size='small'>обещано</Text>
                <input
                  className={cell}
                  type='date'
                  value={d.promisedAt}
                  onChange={(e) => set({ promisedAt: e.target.value })}
                />
              </label>
              <label className='flex flex-col gap-1'>
                <Text size='small'>начато</Text>
                <input
                  className={cell}
                  type='date'
                  value={d.startedAt}
                  onChange={(e) => set({ startedAt: e.target.value })}
                />
                <Text variant='label' size='small'>
                  когда работа реально началась — факт, не план
                </Text>
              </label>
              <label className='flex flex-col gap-1'>
                <Text size='small'>фактический % раскроя</Text>
                <input
                  className={cell}
                  inputMode='decimal'
                  placeholder='напр. 12.5'
                  value={d.actualWastagePercent}
                  onChange={(e) => set({ actualWastagePercent: sanitizeDecimal(e.target.value) })}
                />
                <Text variant='label' size='small'>
                  пусто = оценка BOM; покрытие выше посчитано именно по ней
                </Text>
              </label>
              <label className='flex flex-col gap-1 sm:col-span-2'>
                <Text size='small'>заметки</Text>
                <textarea
                  className={cell}
                  rows={2}
                  value={d.notes}
                  onChange={(e) => set({ notes: e.target.value })}
                />
              </label>
            </div>

            {refusal ? (
              <CalloutBox tone='error'>
                <Text size='small'>
                  <b>Сервер отклонил создание.</b> {refusal.message}
                </Text>
                <ul className='list-disc pl-4'>
                  {refusal.rows.map((r, i) => (
                    <li key={i}>
                      <Text size='micro' component='span'>
                        {r}
                      </Text>
                    </li>
                  ))}
                </ul>
                <Text size='micro' variant='label'>
                  Причины пересчитаны сервером НА МОМЕНТ отправки и могут отличаться от вердикта
                  выше: карточку могли изменить, пока модалка была открыта.
                </Text>
              </CalloutBox>
            ) : null}
          </div>

          <div className='sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-textInactiveColor bg-bgColor px-4 py-3'>
            <Text size='micro' variant='label' className='mr-auto'>
              {totalUnits > 0
                ? `${totalUnits} ${pluralRu(totalUnits, 'изделие', 'изделия', 'изделий')} в плане`
                : 'количества не введены'}
              {/* ПОЧЕМУ КНОПКА ПОГАШЕНА — рядом с самой кнопкой. Вердикт печатает причину подробно,
                  но подвал липкий, а вердикт остаётся выше по прокрутке: погашенная кнопка, чьё
                  объяснение уехало за край экрана, читается как поломка интерфейса. Когда блокер
                  сидит не на колорвее, а на карточке, снимать нечего — и это надо сказать, а не
                  промолчать, иначе совет «снимите колорвеи» отправляет чинить не то. */}
              {gateBlocks
                ? blockedSelection.length > 0
                  ? ` · снимите ${blockedSelection.length} ${pluralRu(blockedSelection.length, 'неготовый колорвей', 'неготовых колорвея', 'неготовых колорвеев')}, чтобы создать`
                  : ' · гейт блокирует создание: причина не на колорвее, а на карточке или прогоне — см. вердикт выше'
                : ''}
            </Text>
            <Button type='button' variant='secondary' size='lg' onClick={() => onOpenChange(false)}>
              отмена
            </Button>
            <Button
              type='button'
              variant='main'
              size='lg'
              disabled={create.isPending || !d.techCardId || gateBlocks}
              onClick={submit}
            >
              {create.isPending ? 'создаём…' : 'создать'}
            </Button>
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
