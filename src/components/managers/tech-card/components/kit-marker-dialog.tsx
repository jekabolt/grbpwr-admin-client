// «РАСКЛАДКА КОМПЛЕКТА» — ТЯЖЁЛАЯ ПОЛОВИНА: разбор выкроек, прогон движка, запись, применение.
//
// Лёгкая половина (кнопка и решение, показывать ли её вовсе) живёт в `kit-marker.tsx` и остаётся в
// чанке рецепта; сюда приезжает ДИНАМИЧЕСКИМ импортом при открытии — тот же приём и та же причина,
// что у `dxf-apply.tsx`: движок раскладки тянет за собой воркер, dxf-parser и clipper, а платить за
// них должен тот, кто их попросил. Компонент монтируется только открытым, поэтому «взвести разбор»
// — это сам факт монтирования, и отдельного флага про это внутри нет.
//
// ═══ ЧТО ЗДЕСЬ СЧИТАЕТСЯ, А ЧТО ПЕРЕИСПОЛЬЗУЕТСЯ ═══════════════════════════════════════════════
//
// Считается ровно ОДНО: вход. Скоуп ткани (какие листы и какие связи блок→деталь принадлежат ЭТОЙ
// строке рецепта), одна клетка партии (этот колорвей, базовый размер, одно изделие) и ширина ЭТОГО
// пина. Всё остальное — планировщик `batch-marker-plan` (отбор деталей, UNI-дедуп, слой контура,
// долевая, припуск, направление, потолки сервера, имя, оценка времени), движок в воркере,
// `marker-save` (пэйлоад) и `markerNormProvenance` (что уезжает в рецепт вместе с числом).
//
// ═══ ПОЧЕМУ ПРОГОН НЕ СТАРТУЕТ САМ ═════════════════════════════════════════════════════════════
//
// Цена поиска растёт как КВАДРАТ числа уникальных деталей: предпросчёт платится за пары контуров.
// Сорок деталей на бюджете в 20 с съедают весь бюджет предпросчётом и не делают ни одного
// поколения. Молчаливый прогон на открытии повесил бы вкладку, поэтому запуск — явная кнопка, и
// рядом с ней стоит СОБСТВЕННАЯ оценка этого задания, посчитанная той же функцией, которую движок
// зовёт внутри себя. Разбор DXF (мегабайты с CDN) при открытии всё же делается: без него сказать,
// сколько будет стоить прогон, нечем — а диалог открывают, чтобы это узнать.
//
// ═══ ЧИСЛО БЕРЁТСЯ У СЕРВЕРА, А НЕ СЧИТАЕТСЯ ЗДЕСЬ ═════════════════════════════════════════════
//
// После записи раскладка перечитывается (`GetTechCardMarker`), и расход на изделие берётся из
// `consumption_per_unit_cm` — того самого поля, которое сервер публикует и придерживает, когда
// публиковать его нельзя (черновик, смешанный состав). Поделить `used_length_cm` на единицу здесь
// было бы арифметически тем же числом ровно до первого случая, когда сервер откажется его выдавать
// — и тогда клиент выдал бы норму, которую сервер только что запретил.
import { useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { common_TechCardMarkerSummary } from 'api/proto-http/admin';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { techCardKeys } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useWorkshopSettings } from 'components/managers/workshop/useWorkshopSettings';
import { fetchMediaBlob } from 'lib/features/media-blob';
import { NEST_DEFAULTS, type NestResult } from 'lib/nesting/types';
import { NestingWorkerClient } from 'lib/nesting/worker/client';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useWatch, type Control } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { extractFieldViolations } from 'utils/field-errors';
import { aliasInScope, fabricScopes, isRollGoodsSection } from './bom-purpose';
import type { MarkerJob, PlanRefusal } from './nesting/batch-marker-plan';
import { sizeTokensOf } from './nesting/block-code';
import type { MarkerColorway } from './nesting/colorway-widths';
import { dxfSheetsByScope } from './nesting/dxf-by-scope';
import { weightRefusalText, type WeightBasisResolution } from './nesting/fabric-weight';
import {
  kitBoundNote,
  kitInputDrift,
  kitProvenanceNote,
  kitScopeSkeleton,
  kitWidthDisagreement,
  planKitMarker,
  type KitRollLine,
} from './nesting/kit-marker-plan';
import {
  bomUnitKind,
  consumptionCm,
  draftRefusal,
  isDraftMarker,
  markerNormProvenance,
  scalarNormRefusal,
  toBomUnit,
} from './nesting/marker-io';
import { saveMarkerJob } from './nesting/marker-save';
import { useDictionarySizeTokens } from './nesting/use-block-sizes';
import type { TechCardFormData } from './schema';

const HARD_STOP_MS = 1500;
const PROGRESS_MIN_MS = 250;

type Phase = 'parsing' | 'ready' | 'running' | 'saving' | 'applied' | 'stuck';

type Progress = {
  nfp: { done: number; total: number } | null;
  generation: number;
  bestPct: number | null;
};

export type KitMarkerApplyPatch = {
  consumption?: string;
  sizeConsumptions?: { sizeId: number; consumption: string }[];
  consumptionSource?: string;
  wasteSelvedgePct?: string;
  wasteCutPct?: string;
  normMarkerId?: number;
};

export default function KitMarkerDialog({
  control,
  techCardId,
  lineKey,
  colorwayId,
  colorwayPins,
  unit,
  articleWidth,
  weightBasis,
  sizeNameById,
  cardMarkersAllColorways,
  stampedMarker,
  onApply,
  onClose,
}: {
  control: Control<TechCardFormData>;
  techCardId: number;
  /** Слот строки рецепта — ИМЕННО он решает скоуп ткани и на него ляжет длина. */
  lineKey: string;
  colorwayId: number;
  /**
   * Колорвеи карточки с шириной их ПИНОВ по слотам — `markerColorways` из СОХРАНЁННОГО чтения
   * карточки, тот же вход, которым считает очередь раскроя партии и модалка раскладки. Собирать
   * его здесь из черновика строки было бы вторым правилом «что такое пин»: явный пин на тот же
   * артикул, что у слота, черновик посчитал бы «не пином» и померил по ширине СТРОКИ BOM.
   */
  colorwayPins: readonly MarkerColorway[];
  unit: string;
  /**
   * РАСКРОЙНАЯ ширина эффективного артикула строки ПО ЧЕРНОВИКУ, см. Служит СВЕРКОЙ, а не
   * источником: расходится она с шириной пина ровно тогда, когда артикул сменили и не сохранили.
   */
  articleWidth: string;
  weightBasis: WeightBasisResolution;
  sizeNameById: Map<number, string>;
  /**
   * ВСЕ карточные раскладки, а не только свои: планировщик засевает ими занятые имена (ключ
   * уникальности у сервера — (карточка, прогон, размер, имя)) и находит ту, которую пересъёмка
   * заменит по id.
   */
  cardMarkersAllColorways?: common_TechCardMarkerSummary[];
  /** Раскладка, из которой снята СЕГОДНЯШНЯЯ норма строки (штамп Ф6.8); undefined = штампа нет. */
  stampedMarker?: common_TechCardMarkerSummary;
  onApply: (patch: KitMarkerApplyPatch) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const workshop = useWorkshopSettings();
  const dictTokens = useDictionarySizeTokens();

  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as Array<{
    section?: string;
    name?: string;
    unit?: string;
    lineKey?: string;
    purpose?: string;
    fabricDirection?: string;
    isSample?: boolean;
    fabricWidth?: string;
    effectiveFabricWidthCm?: string;
    selvedgeCm?: string;
    materialId?: number;
  }>;
  const patterns = (useWatch({ control, name: 'patterns' }) ?? []) as Array<{
    url?: string;
    name?: string;
    filename?: string;
    bomLineKey?: string;
    fabricPurpose?: string;
  }>;
  const pieceDxfAliases = (useWatch({ control, name: 'pieceDxfAliases' }) ?? []) as Array<{
    bomLineKey?: string;
    fabricPurpose?: string;
    blockName?: string;
    pieceLineKey?: string;
  }>;
  const cardSeamRaw = (useWatch({ control, name: 'requiredSeamAllowanceMm' }) ?? null) as
    | string
    | null;
  const baseSizeId = Number(useWatch({ control, name: 'baseSampleSizeId' }) ?? 0);

  const rollLines: KitRollLine[] = useMemo(
    () =>
      bomItems
        .filter((b) => isRollGoodsSection(b.section) && !!b.lineKey)
        .map((b) => ({
          lineKey: b.lineKey as string,
          purpose: b.purpose ?? '',
          name: b.name ?? '',
          section: b.section ?? '',
          unit: b.unit ?? '',
          fabricDirection: b.fabricDirection ?? '',
          isSample: !!b.isSample,
          fabricWidth: b.fabricWidth ?? '',
          effectiveFabricWidthCm: b.effectiveFabricWidthCm ?? '',
          selvedgeCm: b.selvedgeCm ?? '',
          materialId: Number(b.materialId ?? 0),
        })),
    [bomItems],
  );
  const scopeDefs = useMemo(() => fabricScopes(rollLines), [rollLines]);
  // Скоуп ЭТОЙ строки. Резолвится через `fabricScopes`, а не сравнением ключей: строка, которую
  // потом разложили в назначение, принадлежит теперь назначению — и лист, привязанный к ней, тоже.
  const scopeDef = useMemo(
    () => scopeDefs.find((s) => s.lines.some((l) => l.lineKey === lineKey)),
    [scopeDefs, lineKey],
  );
  const sheetsByScope = useMemo(() => dxfSheetsByScope(patterns, scopeDefs), [patterns, scopeDefs]);

  const skeleton = useMemo(() => {
    if (!scopeDef) return null;
    return kitScopeSkeleton({
      scope: scopeDef,
      rollLines,
      sheets: sheetsByScope.get(scopeDef.key) ?? [],
      aliases: pieceDxfAliases.filter((a) => aliasInScope(a, scopeDef)),
      // Имя артикула СЛОТА — только для текста отказа о ширине; ширину даёт `colorwayPins`.
      slotArticleName: '',
    });
  }, [scopeDef, rollLines, sheetsByScope, pieceDxfAliases]);

  const sizeLabelOf = (id: number) => formatSizeName(sizeNameById.get(id) ?? `#${id}`);

  // ── жизненный цикл воркера ────────────────────────────────────────────────────────────────
  const clientRef = useRef<NestingWorkerClient | null>(null);
  const aliveRef = useRef(true);
  const cancelRef = useRef<(() => void) | null>(null);
  const hardStopRef = useRef<number | null>(null);
  const client = () => {
    if (!clientRef.current) clientRef.current = new NestingWorkerClient();
    return clientRef.current;
  };

  const [phase, setPhase] = useState<Phase>('parsing');
  // БЮДЖЕТ ПОИСКА, с. Правится, потому что иначе задание с большим числом деталей — тупик: цена
  // предпросчёта растёт как КВАДРАТ контуров, и на двадцати секундах сорок деталей не дают ни
  // одного поколения. Оценка ниже пересчитывается вместе с ним, так что цена решения видна ДО
  // нажатия. Значения те же, что у очереди раскроя партии.
  const [budgetS, setBudgetS] = useState(NEST_DEFAULTS.timeBudgetMs / 1000);
  const [parseError, setParseError] = useState('');
  const [scopeWithPieces, setScopeWithPieces] = useState<ReturnType<
    typeof kitScopeSkeleton
  > | null>(null);
  const [parseId, setParseId] = useState(0);
  const [progress, setProgress] = useState<Progress>({ nfp: null, generation: 0, bestPct: null });
  const [stopping, setStopping] = useState(false);
  const [result, setResult] = useState<NestResult | null>(null);
  const [saveError, setSaveError] = useState('');
  const [savedSummary, setSavedSummary] = useState<common_TechCardMarkerSummary | null>(null);
  const [appliedText, setAppliedText] = useState('');

  // РАЗМОНТИРОВАНИЕ ОСТАНАВЛИВАЕТ ЦИКЛ, а не только глушит воркер. Прогон — обычная асинхронная
  // функция, она НЕ привязана к жизненному циклу: убить воркер мало, продолжение сохранило бы
  // раскладку на карточку, с которой оператор уже ушёл.
  //
  // `aliveRef` ВЗВОДИТСЯ В САМОМ ЭФФЕКТЕ, а не только в инициализаторе рефа, и это не педантизм:
  // под StrictMode React в разработке прогоняет цикл setup → cleanup → setup, то есть уборка
  // случается на живом компоненте. Без перевзвода флаг оставался бы `false` навсегда, и разбор
  // выкроек, стартовавший вторым заходом, молча выходил бы на первой же проверке — окно висело бы
  // в «разбираем…» вечно, но только в дев-сборке.
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      cancelRef.current?.();
      cancelRef.current = null;
      // Таймер жёсткого стопа, который только что мог взвести `cancelRef`, снимается ЗДЕСЬ: воркер
      // всё равно убивается строкой ниже, а выстрел через полторы секунды нашёл бы уже ничьё.
      if (hardStopRef.current != null) window.clearTimeout(hardStopRef.current);
      hardStopRef.current = null;
      clientRef.current?.terminate();
      clientRef.current = null;
    };
  }, []);

  // ── разбор выкроек ткани: ОДИН РАЗ, ПРИ ОТКРЫТИИ ──────────────────────────────────────────
  //
  // РАЗБОР — ЭТО СНИМОК, и снимается он в момент открытия окна. Зависеть от объекта `skeleton`
  // здесь нельзя дважды: во-первых, `useWatch` отдаёт НОВЫЙ массив на каждый рендер формы, так что
  // ссылка на скелет меняется постоянно — эффект перекачивал бы мегабайты с CDN на каждое нажатие
  // клавиши в соседней вкладке; во-вторых, менять вход ПОСЛЕ того, как оператор увидел оценку и
  // нажал «посчитать», значило бы посчитать не то, что он видел. Данные карточки, изменившиеся
  // после открытия, — повод закрыть и открыть окно заново, и это видно: снимок берётся один.
  const skeletonRef = useRef(skeleton);
  skeletonRef.current = skeleton;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const skeleton = skeletonRef.current;
    if (!skeleton) return;
    let dead = false;
    const sheets = skeleton.sheets;
    if (sheets.length === 0) {
      // Планировщик по такому скоупу откажет и так, а качать нечего — сразу к вердикту.
      setScopeWithPieces(skeleton);
      setPhase('ready');
      return;
    }
    setPhase('parsing');
    (async () => {
      try {
        // allSettled — не «терпимость к сбою», а способ узнать ИМЯ пропавшего листа: разбор по
        // остатку уложил бы изделие без деталей с этого листа, и все счётчики сошлись бы.
        const settled = await Promise.allSettled(
          sheets.map(async (s) => new File([await fetchMediaBlob(s.url)], s.name)),
        );
        if (dead || !aliveRef.current) return;
        const files: File[] = [];
        const failed: string[] = [];
        settled.forEach((r, i) => {
          if (r.status === 'fulfilled') files.push(r.value);
          else failed.push(sheets[i].name);
        });
        if (failed.length > 0 || files.length === 0) {
          setScopeWithPieces({
            ...skeleton,
            failedSheets: failed.length > 0 ? failed : sheets.map((s) => s.name),
            parseWarnings: [`sheets didn't download: ${failed.join(', ') || 'all'}`],
          });
          setPhase('ready');
          return;
        }
        const res = await client().parse(files, {
          unit: 'auto',
          tol: NEST_DEFAULTS.tol,
          tolChain: NEST_DEFAULTS.tolChain,
        });
        if (dead || !aliveRef.current) return;
        setParseId(res.parseId);
        setScopeWithPieces({
          ...skeleton,
          pieces: res.pieces,
          detectedUnit: res.detectedUnit,
          parseWarnings: res.warnings,
        });
        setPhase('ready');
      } catch (e) {
        if (dead || !aliveRef.current) return;
        setParseError(e instanceof Error && e.message ? e.message : "couldn't parse the patterns");
        setPhase('stuck');
      }
    })();
    return () => {
      dead = true;
    };
  }, []);

  // РАСКЛАДКА, КОТОРУЮ МЫ ТОЛЬКО ЧТО ЗАПИСАЛИ, ВХОДИТ В ПЛАН СРАЗУ, не дожидаясь рефетча карточки.
  //
  // Иначе второй прогон в том же окне (первый вернул черновик или норму не удалось применить)
  // планировался бы так, будто первой раскладки нет: `replaces` пуст, имя то же самое — и сервер
  // отверг бы дубль ПОСЛЕ полностью оплаченного поиска, по ключу (карточка, прогон, размер, имя).
  // Список карточки приезжает асинхронно и на этот момент ещё старый.
  const markersForPlan = useMemo(() => {
    const savedId = Number(savedSummary?.id ?? 0);
    const base = (cardMarkersAllColorways ?? []).filter((m) => Number(m.id ?? 0) !== savedId);
    return savedSummary ? [...base, savedSummary] : base;
  }, [cardMarkersAllColorways, savedSummary]);

  // ── план ──────────────────────────────────────────────────────────────────────────────────
  //
  // ПОСЛЕ ЗАПУСКА ПЛАН НЕ ПЕРЕСЧИТЫВАЕТСЯ, и это не оптимизация ради оптимизации. Планирование
  // стоит дорого — разворот по долевой, раздутие припуском и ВЫПУКЛОЕ РАЗЛОЖЕНИЕ каждого контура
  // ради оценки, — а сохранение раскладки инвалидирует карточку, то есть список раскладок приезжает
  // новый ровно в момент успеха. Без заморозки главный поток замирал бы на секунды прямо на
  // «готово». Заморозка снимается, как только диалог возвращается в 'ready' (прогон не удался или
  // норму применить не вышло): там пересчёт нужен — среди раскладок появился только что записанный
  // черновик, и следующий прогон обязан ЗАМЕНИТЬ его, а не завести второй.
  const planRef = useRef<ReturnType<typeof planKitMarker> | null>(null);
  const planFrozen = phase === 'running' || phase === 'saving' || phase === 'applied';
  const plan = useMemo(() => {
    if (planFrozen) return planRef.current;
    if (!scopeWithPieces || baseSizeId <= 0) return null;
    return planKitMarker({
      scope: scopeWithPieces,
      colorwayId,
      baseSizeId,
      colorways: colorwayPins,
      sizeLabel: sizeLabelOf,
      sizeTokensOf: (id) => sizeTokensOf(sizeNameById.get(id)),
      dictTokens,
      markers: markersForPlan,
      timeBudgetMs: Math.max(1, budgetS) * 1000,
      cardSeamAllowanceRaw: cardSeamRaw,
      workshopSeamAllowance: workshop.data?.settings?.defaultSeamAllowanceMm,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    planFrozen,
    scopeWithPieces,
    baseSizeId,
    budgetS,
    colorwayId,
    colorwayPins,
    sizeNameById,
    markersForPlan,
    dictTokens,
    cardSeamRaw,
    workshop.data,
  ]);
  planRef.current = plan;

  const job: MarkerJob | null = plan?.job ?? null;
  const refusals: PlanRefusal[] = plan?.refusals ?? [];

  // ── отказы, которые планировщик знать не может ────────────────────────────────────────────
  //
  // БАЗОВЫЙ РАЗМЕР НАЗЫВАЕТСЯ ПЕРВЫМ. Себестоимость считается по нему (base_sample_size_id, без
  // фолбэка), и раскладка «какого-нибудь» размера была бы нормой не того изделия. Подставить
  // средний размер ряда — ровно та молчаливая догадка, которой здесь быть не должно.
  const noBaseSize =
    baseSizeId <= 0
      ? 'the card has no BASE size picked (card header, “base sample size”). Cost is computed from it, with no fallback, so the kit is cut in exactly that size — substituting the middle size of the range would mean measuring the norm of a different garment'
      : '';
  const baseSizeName = baseSizeId > 0 ? sizeLabelOf(baseSizeId) : '';
  const noScope =
    !scopeDef && !noBaseSize
      ? "the BOM line of this fabric is not among the card's roll-goods sections — nothing to make a marker on"
      : '';
  const widthDisagreement = job
    ? kitWidthDisagreement(job.widthCm, Number((articleWidth || '').replace(',', '.')))
    : '';
  // ЕДИНИЦА СЛОТА — ПРЕДПРОВЕРКА, А НЕ РАЗБОР ПОЛЁТОВ ПОСЛЕ. Норма пишется в единице СТРОКИ BOM, и
  // если та не принимает ни длину, ни вес (либо кг-слот не даёт основы веса — нет ширины рулона
  // или плотности), применить измеренную длину нечем. Без этой проверки прогон отрабатывал бы
  // полный бюджет, раскладка сохранялась бы, и только потом экран говорил бы «применить не могу»:
  // отказ верный, но минуты уже потрачены, а починка лежит на вкладке BOM.
  const unitKind = bomUnitKind(unit);
  const unitRefusal = !unit
    ? "the BOM line has no unit — the norm is written in the slot's unit, and there's nothing to apply the measured length in. Fill in the unit on the BOM tab"
    : unitKind == null
      ? `the BOM line's unit (“${unit}”) accepts neither length nor weight — the norm can be written in meters, centimeters or kilograms`
      : unitKind === 'kg' && !weightBasis.ok
        ? weightRefusalText(weightBasis.missing, weightBasis.pinned)
        : '';
  const blocked = noBaseSize || noScope || parseError || widthDisagreement || unitRefusal;

  // ── ЧТО ИЗМЕНИЛОСЬ С ТЕХ ПОР, КАК СНЯЛИ СЕГОДНЯШНЮЮ НОРМУ ────────────────────────────────
  //
  // Точная половина вердикта о протухании: сверяет ОТПЕЧАТОК ВХОДА — число экземпляров деталей и
  // ширину — с тем, что записано в раскладке, из которой снята норма строки. Здесь за разбор уже
  // заплачено, поэтому сверка честная; на строке рецепта живёт дешёвая половина
  // (`markerNormStaleness`: серверный отпечаток набора и ширина артикула).
  const drift =
    stampedMarker && job
      ? kitInputDrift({
          marker: stampedMarker,
          todayInstances: job.instanceCount,
          todayWidthCm: job.widthCm,
        })
      : '';

  // Строки списка деталей: имя контура, сколько экземпляров ляжет и площадь одного. Считается по
  // `job.config.pieces` — по тому самому списку, который уедет в движок, — а не по разбору: в
  // разборе лежит вся градация на всех слоях, и половина её в этот настил не поедет.
  const kitPieceLines = useMemo(() => {
    if (!job) return [] as { key: string; text: string }[];
    const byId = new Map(job.pieces.map((p) => [p.id, p]));
    return job.config.pieces
      .map((c) => {
        const p = byId.get(c.pieceId);
        const name = p?.name?.trim() || p?.blockName?.trim() || `piece ${c.pieceId}`;
        const area = p ? ` · ${p.areaCm2.toFixed(0)} cm² each` : '';
        return { key: String(c.pieceId), name, text: `${name} × ${c.quantity}${area}` };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [job]);

  // ── прогон ────────────────────────────────────────────────────────────────────────────────
  const run = async () => {
    if (!job || !parseId || blocked) return;
    setResult(null);
    setSaveError('');
    // `savedSummary` НЕ сбрасывается: это не «результат прошлого показа», а ЗНАНИЕ О ТОМ, ЧТО МЫ
    // УЖЕ ЗАПИСАЛИ. Пока рефетч карточки не приехал, только оно и держит связь со своей раскладкой
    // (markersForPlan), и обнулить его значило бы дать следующему прогону завести дубль имени.
    // Показ им не управляет — экран смотрит на фазу.
    setAppliedText('');
    setStopping(false);
    setProgress({ nfp: null, generation: 0, bestPct: null });
    setPhase('running');
    let last = 0;
    const { id, done } = client().nest(parseId, job.config, (p) => {
      const now = Date.now();
      if (p.phase === 'ga' && now - last < PROGRESS_MIN_MS) return;
      last = now;
      if (!aliveRef.current) return;
      if (p.phase === 'nfp') {
        setProgress({
          nfp: { done: p.nfpDone ?? 0, total: p.nfpTotal ?? 0 },
          generation: 0,
          bestPct: null,
        });
      } else {
        setProgress({
          nfp: null,
          generation: p.generation ?? 0,
          bestPct: p.best ? Math.min(100, p.best.efficiency * 100) : null,
        });
      }
    });
    let settled = false;
    // ОТМЕНА ГОВОРИТ ТОЛЬКО С ЖИВЫМ ВОРКЕРОМ — `clientRef.current`, а не `client()`. Ленивый
    // конструктор поднял бы НОВЫЙ воркер, чтобы отправить в него «отмену» задания, которого там
    // нет, — и делал бы это в том числе на размонтировании, ровно когда мы всё гасим.
    cancelRef.current = () => {
      clientRef.current?.cancel(id);
      // Жёсткий стоп: воркер, застрявший внутри непрерываемой геометрии, убивается. Вместе с ним
      // умирает разбор — поэтому после него диалог не предлагает «запустить» молча, а честно
      // говорит, что выкройки надо разобрать заново (окно закрывают и открывают).
      //
      // Таймер живёт В РЕФЕ, а не в замыкании: размонтирование обязано его снять, иначе он
      // выстрелит через полторы секунды после того, как от диалога ничего не осталось.
      if (hardStopRef.current != null) window.clearTimeout(hardStopRef.current);
      hardStopRef.current = window.setTimeout(() => {
        hardStopRef.current = null;
        if (settled) return;
        clientRef.current?.terminate();
        clientRef.current = null;
        if (!aliveRef.current) return;
        setParseId(0);
        setPhase('stuck');
        setParseError(
          "the search didn't answer “stop”, and the worker had to be killed. The pattern parse died with it — close and reopen the window to parse them again",
        );
      }, HARD_STOP_MS);
    };
    let out: NestResult | null = null;
    try {
      out = await done;
    } catch {
      out = null;
    } finally {
      settled = true;
      if (hardStopRef.current != null) window.clearTimeout(hardStopRef.current);
      hardStopRef.current = null;
      cancelRef.current = null;
    }
    if (!aliveRef.current) return;
    if (!out || out.placements.length === 0) {
      setPhase('ready');
      setSaveError(
        out
          ? "the search placed no piece at all — there's nothing to save. That happens when the budget wasn't even enough for the geometry prepass: run it again"
          : 'the search was aborted — no result',
      );
      return;
    }
    setResult(out);
    await save(job, out);
  };

  const stop = () => {
    setStopping(true);
    cancelRef.current?.();
  };

  // ── запись и применение ───────────────────────────────────────────────────────────────────
  const save = async (j: MarkerJob, r: NestResult) => {
    setPhase('saving');
    try {
      const urlBySource = new Map(
        (sheetsByScope.get(j.scopeKey) ?? []).map((s) => [s.name, s.url]),
      );
      const id = await saveMarkerJob(techCardId, {
        job: j,
        result: r,
        urlBySource,
        provenanceNote: kitProvenanceNote(j.sizeLabel, j.scopeLabel),
      });
      if (!aliveRef.current) return;
      // ЧИСЛО — У СЕРВЕРА. Перечитываем ровно ту строку, которую он только что записал: расход на
      // изделие он публикует сам и придерживает, когда публиковать его нельзя.
      const read = await adminService.GetTechCardMarker({ id });
      if (!aliveRef.current) return;
      const summary = read.marker?.summary;
      if (!summary) {
        setSaveError('the marker is saved, but re-reading it failed — apply the norm by hand');
        setPhase('ready');
        invalidate();
        return;
      }
      setSavedSummary(summary);
      // ПРИМЕНЕНИЕ ИДЁТ ПЕРЕД ИНВАЛИДАЦИЕЙ, И ПОРЯДОК ЗДЕСЬ — ЭТО ЗАЩИТА ОТ ГОНКИ, А НЕ ВКУС.
      //
      // Редактор рецепта пере-сеет черновик с сервера, пока черновик ЧИСТ (`if (dirty) return;
      // setUsages(baseline)` в ColorwayRecipeEditor). Инвалидация карточки заставляет её
      // перечитаться, и если ответ приезжает раньше, чем применён патч, пере-сев затирает норму —
      // а окно при этом уже отрапортовало «применено». `onApply` ставит `dirty` синхронно, так что
      // после него пере-сев не случится ни при каком порядке.
      apply(summary);
      invalidate();
    } catch (e) {
      if (!aliveRef.current) return;
      const vs = extractFieldViolations(e);
      setSaveError(
        vs.length > 0
          ? vs.map((v) => v.description).join('; ')
          : e instanceof Error && e.message
            ? e.message
            : "couldn't save the marker",
      );
      setPhase('ready');
    }
  };

  /** Список раскладок карточки едет внутри GetTechCard — без этого новая не появится нигде. */
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: techCardKeys.detail(techCardId) });
    qc.invalidateQueries({ queryKey: techCardKeys.lists() });
  };

  const apply = (summary: common_TechCardMarkerSummary) => {
    // ЧЕРНОВИК НОРМОЙ НЕ БЫВАЕТ, и отказывает в этом сервер: у неполной укладки длина короче
    // настоящей ровно на то, что заняли бы неуложенные детали. Слова берём его же.
    if (isDraftMarker(summary)) {
      setPhase('ready');
      setSaveError(draftRefusal(summary));
      return;
    }
    const refusal = scalarNormRefusal(summary);
    if (refusal) {
      setPhase('ready');
      setSaveError(refusal);
      return;
    }
    const cm = consumptionCm(summary);
    if (cm == null) {
      setPhase('ready');
      setSaveError(
        'the server published no per-unit consumption for this marker — nothing to apply',
      );
      return;
    }
    const conv = toBomUnit(cm, unit, weightBasis.ok ? weightBasis.basis : undefined);
    if (!conv) {
      setPhase('ready');
      setSaveError(
        unit
          ? `the marker is captured (${cm} cm per unit), but the BOM line's unit “${unit}” accepts neither length nor weight — the norm can be written in meters, centimeters or kilograms`
          : "the marker is captured, but the BOM line has no unit — the norm is written in the slot's unit. Fill in the unit on the BOM tab and apply the marker from the “from a marker” hint",
      );
      return;
    }
    // НОЛЬ ПОСЛЕ ОКРУГЛЕНИЯ — НЕ НОРМА: записанный строкой «0», он читался бы как «ткань не нужна».
    if (!(conv.value > 0)) {
      setPhase('ready');
      setSaveError(
        `converted into “${unit}” the norm rounds to zero (measured ${cm} cm per unit) — zero would read as “no fabric needed”. The marker is saved; check the slot's unit and the article width`,
      );
      return;
    }
    onApply({
      consumption: String(conv.value),
      // Скалярная норма ОБЯЗАНА гасить пер-размерный ряд: сервер игнорирует скаляр, пока в строке
      // жива хоть одна пер-размерная запись.
      sizeConsumptions: [],
      ...markerNormProvenance([summary], Number(summary.id ?? 0)),
    });
    setAppliedText(`${conv.value} ${conv.unit}`);
    setPhase('applied');
    showMessage(
      'the norm is applied into the recipe draft — it goes out when the card is saved',
      'success',
    );
  };

  // ── экран ─────────────────────────────────────────────────────────────────────────────────
  const forecast = job?.estimate;
  const forecastText = !forecast
    ? 'nothing to estimate'
    : forecast.outlook === 'starved'
      ? `the budget won't even cover the geometry prepass: there will be no search at all, and the run would return an empty lay. A budget from ${Math.ceil(forecast.budgetToFitMs / 1000)} s is needed — raise it higher; if even 180 s is not enough, the job is too big for the browser, and the marker has to be captured from the “patterns” tab with the pieces picked by hand`
      : forecast.outlook === 'squeezed'
        ? `prepass ~${Math.round(forecast.predictedPrepassMs / 1000)} s, ~${Math.round(forecast.searchMsLeft / 1000)} s left for the search`
        : `up to ${Math.ceil((forecast.predictedElapsedMs ?? forecast.timeBudgetMs) / 1000)} s (prepass ~${Math.round(forecast.predictedPrepassMs / 1000)} s)`;
  // «Поиска не будет вовсе» — не предупреждение, а бесполезно потраченные минуты: предпросчёт не
  // успевает построить ни одной пары NFP, и укладывать нечем. Кнопка гаснет, причина стоит рядом.
  const starved = forecast?.outlook === 'starved';
  const busy = phase === 'running' || phase === 'saving';

  return (
    <ConfirmationModal
      open
      onOpenChange={(o: boolean) => {
        // ЗАПИСЬ ИДЁТ — ЗАКРЫТЬ НЕЛЬЗЯ. `SaveTechCardMarker` — обычный fetch, отменить его нечем;
        // закрытое посреди записи окно оставило бы раскладку на сервере, а норму — неприменённой,
        // и оператор не увидел бы ни успеха, ни отказа. Окно самих секунд стоит одну-две.
        if (!o && phase !== 'saving') onClose();
      }}
      onConfirm={onClose}
      title={`kit marker${baseSizeName ? ` · size ${baseSizeName}` : ''}`}
      hideActions
    >
      <div className='space-y-2.5'>
        {/* ЧТО МЕШАЕТ — ПЕРВЫМ И БЕЗ ИСКЛЮЧЕНИЙ: отказ, лежащий под числами, читается после того,
            как оператор уже поверил числу. */}
        {noBaseSize && <CalloutBox tone='error'>{noBaseSize}</CalloutBox>}
        {noScope && <CalloutBox tone='error'>{noScope}</CalloutBox>}
        {parseError && <CalloutBox tone='error'>{parseError}</CalloutBox>}
        {widthDisagreement && <CalloutBox tone='error'>{widthDisagreement}</CalloutBox>}
        {unitRefusal && <CalloutBox tone='error'>{unitRefusal}</CalloutBox>}
        {refusals.map((r) => (
          <CalloutBox key={r.key} tone='error'>
            {[r.scopeLabel, r.sizeLabel].filter(Boolean).join(' · ')}: {r.reason}
          </CalloutBox>
        ))}

        {phase === 'parsing' && (
          <Text size='nano' variant='label' component='p'>
            downloading and parsing this fabric's patterns…
          </Text>
        )}

        {/* ЧТО ИМЕННО БУДЕТ ПОСЧИТАНО — до нажатия, числами. Раскладка стоит минуты, и «что мы
            вообще кроим» обязано быть видно ДО того, как их потратят. */}
        {job && (
          <>
            <GroupLabel>job</GroupLabel>
            <div className='flex flex-wrap items-center gap-1.5'>
              <Pill tone='mut'>{job.scopeLabel}</Pill>
              <Pill tone='mut'>{job.pinned ? `pin: ${job.articleName}` : job.articleName}</Pill>
              <Pill tone='mut'>cloth {job.widthCm} cm</Pill>
              <Pill tone='mut'>
                {job.pieceCount} contours · {job.instanceCount} instances
              </Pill>
            </div>
            <Text size='nano' variant='label' component='p'>
              {`contour layer ${job.contourLayer || '—'}, grainline ${job.grainLayer || 'no rotation'}, seam allowance ${job.seamAllowanceMm} mm (${job.seamAllowanceWhy}), selvedge ${job.selvedgeCm} cm per side`}
            </Text>
            {/* ЧТО ИМЕННО КРОИМ — СПИСКОМ, А НЕ ОДНИМ СЧЁТЧИКОМ.
                Ради этого списка всё и затевалось: одна и та же ткань в роли основной и в роли
                карманки даёт РАЗНЫЕ числа, и разницу обязано объяснять не «настройка», а вот эти
                строки — у двух слотов они разные. Без списка два числа на одном артикуле выглядели
                бы расхождением расчёта. Свёрнуто: на большой ткани это сорок строк, а вопрос
                «сколько это будет стоить» задают чаще, чем «из чего именно». */}
            <details>
              <summary className='cursor-pointer'>
                <Text size='nano' variant='label' component='span' className='uppercase'>
                  kit pieces ({job.pieceCount})
                </Text>
              </summary>
              <div className='flex flex-col gap-0.5 pt-1'>
                {kitPieceLines.map((l) => (
                  <Text key={l.key} size='nano' variant='label' component='span'>
                    {l.text}
                  </Text>
                ))}
              </div>
            </details>
            {job.notes.map((n, i) => (
              <CalloutBox key={i} tone='warning'>
                {n}
              </CalloutBox>
            ))}
            {job.replaces && (
              <CalloutBox tone='note'>
                {`a recompute will REPLACE the marker “${job.replaces.name}”${job.replaces.isNorm ? ' (it is set as the norm of this fabric)' : ''}${job.replaces.isDraft ? " — right now it's a draft, some pieces were not placed" : ''}: it has the same slot, the same colorway and the same size, and a second one just like it would pile up beside it`}
              </CalloutBox>
            )}
            {/* ПРОТУХАНИЕ — ТОЧНАЯ ПОЛОВИНА. Сравнивается отпечаток входа: экземпляры и ширина. */}
            {drift && (
              <CalloutBox tone='warning'>
                {`the line's norm was captured from the marker “${stampedMarker?.name ?? ''}”, and the input has changed since: ${drift}. The number on the line stays true for those conditions — recompute it if you need today's`}
              </CalloutBox>
            )}
          </>
        )}

        {/* ГРАНИЦА НАЗЫВАЕТСЯ ГРАНИЦЕЙ — и до прогона, и после. Без этой строки число неотличимо
            от измеренного настила партии: у них одинаковы все поля раскладки. */}
        {job && <CalloutBox tone='note'>{kitBoundNote(job.sizeLabel)}</CalloutBox>}

        {phase === 'ready' && job && !blocked && (
          <>
            <ChipRow>
              {[20, 60, 180].map((s) => (
                <Chip
                  key={s}
                  selected={budgetS === s}
                  pressed={budgetS === s}
                  onClick={() => setBudgetS(s)}
                >
                  budget {s} s
                </Chip>
              ))}
            </ChipRow>
            <div className='flex flex-wrap items-center gap-1.5'>
              <Button
                type='button'
                variant='secondary'
                size='xs'
                disabled={starved}
                title={starved ? forecastText : undefined}
                onClick={run}
              >
                compute the marker
              </Button>
              <Text size='nano' variant='label' component='span'>
                {forecastText}
              </Text>
            </div>
          </>
        )}

        {phase === 'running' && (
          <div className='flex flex-wrap items-center gap-1.5'>
            <Button type='button' variant='secondary' size='xs' disabled={stopping} onClick={stop}>
              {stopping ? 'stopping…' : 'stop'}
            </Button>
            <Text size='nano' variant='label' component='span'>
              {progress.nfp
                ? `geometry prepass ${progress.nfp.done}/${progress.nfp.total}`
                : `generation ${progress.generation}${progress.bestPct != null ? ` · efficiency ${progress.bestPct.toFixed(1)}%` : ''}`}
            </Text>
            <Text size='nano' variant='label' component='span'>
              “stop” gives back the best found so far — it doesn't throw the computation away
            </Text>
          </div>
        )}

        {phase === 'saving' && (
          <Text size='nano' variant='label' component='p'>
            saving the marker and re-reading the consumption from the server…
          </Text>
        )}

        {result && (
          <Text size='nano' variant='label' component='p'>
            {`placed ${result.placedCount} of ${result.totalCount} · lay length ${result.usedLengthCm.toFixed(0)} cm · efficiency ${(result.efficiency * 100).toFixed(1)}%${result.cancelled ? ' · the search was stopped, this is the best found' : ''}`}
          </Text>
        )}
        {result?.warnings.map((w, i) => (
          <CalloutBox key={i} tone='warning'>
            {w}
          </CalloutBox>
        ))}

        {saveError && <CalloutBox tone='error'>{saveError}</CalloutBox>}

        {phase === 'applied' && savedSummary && (
          <>
            <CalloutBox tone='note'>
              {`the norm ${appliedText} is applied into the recipe line from the marker “${savedSummary.name}” with the source “from a marker”: costing does NOT add the slot's wastage percent on top of it — the waste is already measured. The write goes out when the card is saved.`}
            </CalloutBox>
            <div className='flex flex-wrap items-center gap-1.5'>
              <Button type='button' variant='secondary' size='xs' onClick={onClose}>
                done
              </Button>
            </div>
          </>
        )}

        {phase === 'stuck' && (
          <div className='flex flex-wrap items-center gap-1.5'>
            <Button type='button' variant='secondary' size='xs' onClick={onClose}>
              close
            </Button>
          </div>
        )}

        {!busy && phase !== 'applied' && phase !== 'stuck' && (
          <Text size='nano' variant='label' component='p'>
            the marker is computed IN THIS BROWSER: there is no other executor — nothing on the
            server can parse DXF. Closing the window or leaving the page stops the computation
          </Text>
        )}
      </div>
    </ConfirmationModal>
  );
}
