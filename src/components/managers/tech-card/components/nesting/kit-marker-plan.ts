// РАСКЛАДКА КОМПЛЕКТА — задание на ОДНО изделие БАЗОВОГО размера, для ОДНОЙ ткани ОДНОГО колорвея.
//
// ═══ ПОЧЕМУ ЗДЕСЬ НЕТ НИ ОДНОЙ СТРОКИ ГЕОМЕТРИИ ════════════════════════════════════════════════
//
// Всё, что нужно этому заданию, планировщик партии (`batch-marker-plan.ts`) уже умеет и делает
// ровно так, как надо: режим `norms` кладёт НА ОДНО ИЗДЕЛИЕ каждого размера, берёт ширину с ПИНА
// колорвея (а не со слота), отбирает детали скоупа, дедуплицирует UNI-копии, выбирает контурный
// слой и долевую, меряет припуск, выводит политику переворота из направления ткани, моделирует
// серверный ключ уникальности имени и считает ЧЕСТНУЮ ОЦЕНКУ времени. Отличие «раскладки
// комплекта» от очереди раскроя — не в расчёте, а во ВХОДЕ: вместо клеток партии сюда приходит
// ровно одна клетка (этот колорвей, базовый размер, одно изделие) и ровно один скоуп.
//
// Поэтому модуль занимается ТОЛЬКО тремя вещами: собирает вход, называет отказы, которых
// планировщик знать не может (у карточки не задан базовый размер; ширина, которой мерили, не та,
// что показывает строка рецепта), и держит ЕДИНСТВЕННУЮ формулировку оговорки о границе — ту, что
// уезжает и на экран, и в блоб раскладки.
//
// ═══ ПОЧЕМУ ЧИСЛО — ГРАНИЦА СВЕРХУ, И ПОЧЕМУ ОБ ЭТОМ НЕЛЬЗЯ МОЛЧАТЬ ════════════════════════════
//
// Настил на ОДИН комплект — самая невыгодная укладка из возможных: межлекальные выпады одного
// изделия нечем заполнить. Цех кладёт многокомплектно, и мелкие детали одного размера садятся в
// выпады другого, так что реальный расход НИЖЕ измеренного здесь. Число поэтому правдиво как
// ВЕРХНЯЯ ГРАНИЦА и лживо как «расход»; названное без оговорки, оно неотличимо от измеренного
// настила партии, потому что все поля раскладки у них одинаковые. Следующая ступень точности —
// «настил партии» в очереди раскроя на вкладке костинга (тот же движок, состав партии).
import type { googletype_Decimal, common_TechCardMarkerSummary } from 'api/proto-http/admin';
import type { FabricScope, RollGoodsLine } from '../bom-purpose';
import { markerScopeDirection } from '../bom-purpose';
import {
  planBatchMarkers,
  type MarkerJob,
  type PlanRefusal,
  type PlanScope,
} from './batch-marker-plan';
import type { MarkerColorway } from './colorway-widths';
import { slotCutWidth } from './colorway-widths';
import type { ScopedSheet } from './dxf-by-scope';
import type { PieceAlias } from './piece-selection';
import { roleWord, scopeLabel } from './scope-label';

/** Строка BOM рулонной секции со всем, что нужно раскладке. Ровно та же форма, что у очереди. */
export type KitRollLine = RollGoodsLine & {
  unit?: string;
  fabricDirection?: string;
  isSample?: boolean;
  fabricWidth?: string;
  effectiveFabricWidthCm?: string;
  selvedgeCm?: string;
  materialId?: number;
};

/**
 * Скелет ткани для планировщика: всё, что известно ДО скачивания и разбора DXF.
 *
 * `pieces` пуст — их доложит вызывающий после разбора. Разделение существует, потому что скелет
 * нужен и до разбора: по нему решается, есть ли смысл вообще качать мегабайты (нет листов, нет
 * одной строки BOM — планировщик откажет и так, а разбор стоит CDN).
 */
export function kitScopeSkeleton(args: {
  scope: FabricScope<KitRollLine>;
  /** ВСЕ рулонные строки карточки — по ним резолвится направление скоупа (строгое побеждает). */
  rollLines: readonly KitRollLine[];
  sheets: readonly ScopedSheet[];
  aliases: readonly PieceAlias[];
  /** Имя артикула слота (не пина) — только для текста отказа о ширине. */
  slotArticleName: string;
}): PlanScope {
  const { scope } = args;
  const line = scope.lines.length === 1 ? scope.lines[0] : undefined;
  const slot = line ? slotCutWidth(line) : { cutCm: NaN, selvedgeCm: 0 };
  return {
    key: scope.key,
    label: scopeLabel(scope.key, scope.byPurpose, scope.lines),
    role: roleWord(scope.lines[0]?.section ?? ''),
    lineKey: line?.lineKey ?? '',
    lineCount: scope.lines.length,
    unit: line?.unit ?? '',
    slotCutCm: slot.cutCm,
    slotSelvedgeCm: slot.selvedgeCm,
    slotArticleName: args.slotArticleName || line?.name?.trim() || '',
    direction: markerScopeDirection(line?.lineKey ?? '', [...args.rollLines]),
    sheets: [...args.sheets],
    failedSheets: [],
    aliases: args.aliases,
    pieces: [],
    detectedUnit: 'mm',
    parseWarnings: [],
  };
}

export type KitPlan = {
  job: MarkerJob | null;
  refusals: PlanRefusal[];
};

/**
 * Задание «раскладка комплекта» — одна клетка, один скоуп, одно изделие.
 *
 * `markers` — ВСЕ карточные раскладки: планировщик засевает ими занятые имена (уникальность у
 * сервера — (карточка, прогон, размер, имя), и столкновение всплывает отказом ПОСЛЕ оплаченного
 * прогона) и находит по ним ту раскладку, которую это задание ПЕРЕСНИМЕТ (та же ткань, тот же
 * колорвей, тот же размер). Пересъёмка замещает прежнюю по id — иначе на карточке копились бы
 * близнецы, и «какая из них норма» решал бы календарь.
 */
export function planKitMarker(args: {
  scope: PlanScope;
  colorwayId: number;
  baseSizeId: number;
  colorways: readonly MarkerColorway[];
  sizeLabel: (sizeId: number) => string;
  sizeTokensOf: (sizeId: number) => string[];
  dictTokens: { has(token: string): boolean };
  markers: readonly common_TechCardMarkerSummary[];
  timeBudgetMs: number;
  cardSeamAllowanceRaw: number | string | null | undefined;
  workshopSeamAllowance: googletype_Decimal | undefined;
}): KitPlan {
  const plan = planBatchMarkers({
    mode: 'norms',
    // Норма может быть только КАРТОЧНОЙ: прогонной это запрещено CHECK'ом chk_tcm_run_not_norm.
    // В режиме норм планировщик это число не читает вовсе, но 0 здесь — утверждение, а не заглушка.
    productionRunId: 0,
    cells: [{ colorwayId: args.colorwayId, sizeId: args.baseSizeId, qty: 1 }],
    scopes: [args.scope],
    colorways: args.colorways,
    sizeLabel: args.sizeLabel,
    // Один размер — порядок градации не с чем сравнивать.
    sizeOrderOf: () => 0,
    sizeTokensOf: args.sizeTokensOf,
    dictTokens: args.dictTokens,
    markers: args.markers,
    // Прогонных раскладок у карточного задания не бывает: у них своё пространство имён (run_key),
    // столкнуться с карточным именем они не могут, и приписывать им чужую занятость значило бы
    // плодить «#2» на пустом месте.
    runMarkers: [],
    referencedMarkerIds: new Set<number>(),
    // Листы «без ткани» — забота панели выкроек и очереди раскроя, которые видят карточку целиком.
    // Эта поверхность отвечает за ОДНУ ткань, и жаловаться ей на чужие листы не за что.
    looseSheets: [],
    timeBudgetMs: args.timeBudgetMs,
    cardSeamAllowanceRaw: args.cardSeamAllowanceRaw,
    workshopSeamAllowance: args.workshopSeamAllowance,
  });
  return { job: plan.jobs[0] ?? null, refusals: plan.refusals };
}

/**
 * ШИРИНА, КОТОРОЙ БУДУТ МЕРИТЬ, ПРОТИВ ШИРИНЫ, КОТОРУЮ ПОКАЗЫВАЕТ СТРОКА РЕЦЕПТА.
 *
 * Числа приходят из ДВУХ РАЗНЫХ мест, и в этом весь смысл сверки. Планировщик берёт ширину у
 * `markerColorways` — то есть у СОХРАНЁННОГО пина колорвея и у самого артикула; строка рецепта
 * показывает её по своему ЧЕРНОВИКУ и по СТРОКЕ BOM. Совпадать они обязаны, и расходятся ровно в
 * двух случаях:
 *
 *   1) артикул на строке сменили и карточку ещё не сохранили — раскладка тогда посчиталась бы на
 *      ПРЕЖНЕЙ ткани, а записалась бы нормой на новую;
 *   2) у строки BOM заполнен СОБСТВЕННЫЙ override ширины, отличный от каталожной ширины артикула,
 *      и колорвей при этом прикалывает тот же артикул явно: строка верит override'у, а пин —
 *      каталогу. Кто из них прав, машина решить не может.
 *
 * ОБА СЛУЧАЯ — ОТКАЗ, и оба называются вслух: измерить на одном полотне и записать норму на другое
 * значит выдать правдоподобное неверное число, а такие глазом не ловятся. Допуск тот же, что у
 * сверки маркера с артикулом в marker-apply (0.5 см): дребезг округления — не смена ткани.
 */
export function kitWidthDisagreement(jobWidthCm: number, rowWidthCm: number): string {
  if (!Number.isFinite(rowWidthCm) || rowWidthCm <= 0) return '';
  if (!Number.isFinite(jobWidthCm) || jobWidthCm <= 0) return '';
  if (Math.abs(jobWidthCm - rowWidthCm) <= 0.5) return '';
  return `раскладку считали бы на полотне ${jobWidthCm} см, а строка рецепта показывает раскройную ширину ${rowWidthCm} см — это разные ткани, и выбрать за вас нельзя. Ширину для раскладки даёт СОХРАНЁННЫЙ пин колорвея (ширина и кромка самого артикула), строка — свой черновик и строку BOM. Причин ровно две: либо артикул на строке сменили и карточку не сохранили — сохраните и повторите; либо у строки BOM заполнена СВОЯ ширина, не совпадающая с каталожной шириной артикула, — сведите их на вкладке BOM`;
}

/** Оговорка о границе — ОДНА формулировка на экран и на блоб раскладки (см. шапку). */
export function kitBoundNote(sizeLabel: string): string {
  return `настил на ОДИН комплект размера ${sizeLabel || '—'}: это ВЕРХНЯЯ ГРАНИЦА расхода, а не расход. Многокомплектный настил кладётся плотнее — мелкие детали одного изделия садятся в межлекальные выпады соседнего, — поэтому в цехе выйдет меньше. Точнее меряет «настил партии» (очередь раскроя на вкладке костинга): тот же движок на реальном составе партии.`;
}

/** Провенанс в блоб: чем снята геометрия. Читается через месяцы, когда спросить будет некого. */
export function kitProvenanceNote(sizeLabel: string, scopeLabelText: string): string {
  return `снято «раскладкой комплекта» с карточки ткани «${scopeLabelText}» в рецепте колорвея: ${kitBoundNote(sizeLabel)}`;
}

/**
 * ОТПЕЧАТОК ВХОДА, СВЕРЕННЫЙ С ТЕМ, ЧТО ЛЕЖИТ В СОХРАНЁННОЙ РАСКЛАДКЕ.
 *
 * Отпечаток входа — это (набор деталей × их кратности) и ширина. ХРАНИТЬ его отдельным полем негде
 * и не нужно: раскладка уже несёт обе половины сама. `total_count` — это Σ экземпляров, которые
 * реально легли, то есть ровно «набор × кратности» (кратность детали входит в него множителем);
 * `fabric_width_cm` — ширина, на которой мерили. Оба поля приезжают в сводке, оба записаны
 * сервером, и ни одно не является нашей копией чужого факта.
 *
 * Сверка требует СЕГОДНЯШНЕГО задания, то есть разбора DXF, поэтому живёт она в диалоге (там за
 * разбор уже заплачено), а не на строке рецепта. На строке остаются два дешёвых признака —
 * серверный `piece_set_status` и ширина артикула (см. `norm-staleness.ts`).
 *
 * Пустая строка = сверка сошлась либо сверять нечем (у раскладки нет записанного счётчика).
 */
export function kitInputDrift(args: {
  marker: common_TechCardMarkerSummary;
  todayInstances: number;
  todayWidthCm: number;
}): string {
  const out: string[] = [];
  const was = Number(args.marker.totalCount ?? 0);
  if (was > 0 && args.todayInstances > 0 && was !== args.todayInstances) {
    out.push(
      `в раскладке ${was} экземпляров деталей, а сегодняшний комплект даёт ${args.todayInstances} — набор деталей этой ткани или их количество на изделие изменились`,
    );
  }
  const wasWidth = Number(args.marker.fabricWidthCm?.value ?? '');
  if (
    Number.isFinite(wasWidth) &&
    wasWidth > 0 &&
    args.todayWidthCm > 0 &&
    Math.abs(wasWidth - args.todayWidthCm) > 0.5
  ) {
    out.push(
      `раскладку мерили на полотне ${wasWidth} см, сегодня раскройная ширина ${args.todayWidthCm} см — расход не переносится между ширинами без пересчёта`,
    );
  }
  return out.join('; ');
}
