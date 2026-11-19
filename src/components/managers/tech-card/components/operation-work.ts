import type {
  GetOperationWorkCatalogResponse,
  OperationWorkCatalogItem,
} from 'api/proto-http/admin';
import { pressProfileFitsStep } from './equipment-options';
import {
  kindClears,
  kindWrites,
  operationHowKind,
  type OperationKind,
  type OperationKindStep,
} from './operation-kinds';
import type { OperationFormStringField } from './operation-options';
import workSnapshot from './operation-work-snapshot.json';
import { isWorkVariant } from '../op-icons/work-variants';
import { TOPSTITCH_EDGE_KINDS } from './step-icon-tiles/rules';

// The live catalog supplies the work vocabulary and user defaults. The same vocabulary is
// available offline as a committed snapshot generated from the backend's seed migrations.

/** Как работа отвечает на вопрос «на чём»: машинка следует из неё, спрашивается, либо не машинная. */
export type WorkMachineMode = 'fixed' | 'ask' | 'none';

/** Одна работа каталога. Все токены — КОРОТКИЕ, как их пишет сервер (`machine`, `lockstitch`). */
export type WorkItem = {
  token: string;
  verb: string;
  stage: string;
  label: string;
  machineMode: WorkMachineMode;
  defaultMachine: string;
  machines: readonly string[];
  syn: readonly string[];
  sort: number;
  retired: boolean;
};

export type WorkCatalog = {
  /** Whether the work vocabulary came from the server or the bundled snapshot. */
  source: 'server' | 'bundle';
  items: readonly WorkItem[];
  byToken: ReadonlyMap<string, WorkItem>;
  /** Глобальные дефолты: работа → имя КОЛОНКИ шага → значение (в серверном написании). */
  defaults: ReadonlyMap<string, ReadonlyMap<string, string>>;
  /**
   * ЗАКРЫТЫЙ РЕЕСТР ПОЛЕЙ ДЕФОЛТА — ИМЕНАМИ КОЛОНОК, И ПРИХОДИТ ОН С СЕРВЕРА.
   *
   * Жест «запомнить как дефолт» рисуется ПО НЕМУ и ни по чему другому. Клиентский
   * `KIND_PROPERTY_FIELDS` для этого негоден принципиально: он отвечает на два своих вопроса
   * («что переносится с прошлого шага» и «что обязано быть в CORE_STEP_FIELDS»), живёт своей
   * жизнью и уже переживал колонки, снятые миграцией. Кнопка, нарисованная по нему, стояла бы на
   * поле, которое RPC отвергает по имени, — то есть обещала бы жест, всегда отвечающий отказом.
   */
  defaultFields: readonly string[];
  /** Подсказка нормы времени по работе: «в прошлый раз было столько-то, на карточке N». */
  smvHints: ReadonlyMap<string, { smv: string; cardName: string }>;
};

// --- ПЕРЕВОД ТОКЕНОВ В ИМЕНА ПРОВОДА -------------------------------------------------------------
//
// Каталог говорит короткими токенами хранилища (`machine`, `lockstitch`), провод шага — именами
// членов enum (`TECH_CARD_OPERATION_TYPE_MACHINE`). Перевод МЕХАНИЧЕСКИЙ и в одну строку, потому
// что таким его и делает генератор protobuf: имя члена = префикс словаря + токен в верхнем
// регистре. Таблицы соответствий здесь нет НАМЕРЕННО — она была бы третьим списком тех же имён.
//
// Токен НОВЕЕ БАНДЛА переживает перевод целым: `machineTypeOptionsFor` и `operationTypeOptionsFor`
// уже умеют показать значение, которого нет в их словаре, строкой «unknown to this app version».

const OPERATION_TYPE_PREFIX = 'TECH_CARD_OPERATION_TYPE_';
const MACHINE_TYPE_PREFIX = 'TECH_CARD_MACHINE_TYPE_';

export const verbTokenToEnum = (token: string): string =>
  token ? `${OPERATION_TYPE_PREFIX}${token.toUpperCase()}` : '';
export const machineTokenToEnum = (token: string): string =>
  token ? `${MACHINE_TYPE_PREFIX}${token.toUpperCase()}` : '';
export const enumToMachineToken = (name: string): string =>
  name.startsWith(MACHINE_TYPE_PREFIX) ? name.slice(MACHINE_TYPE_PREFIX.length).toLowerCase() : '';

// --- ПОИСК ---------------------------------------------------------------------------------------

/**
 * НОРМАЛИЗАЦИЯ ПОИСКОВОЙ СТРОКИ. Регистр, обрамляющие пробелы и «ё» — не различия: технолог
 * печатает «Моско», «моско » и «ёлочка» как попало, а коллация синонимов на сервере тоже
 * регистронезависимая (ai_ci, 0329). Диакритика латиницы снимается тем же NFD-приёмом, что и в
 * поиске деталей: «façon» обязано находиться по «facon».
 */
export const normalizeWorkSearch = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ё/g, 'е')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');

/** Все слова, по которым работа находится: имя, токен и синонимы каталога. */
const haystack = (w: WorkItem): string[] => [w.label, w.token, ...w.syn].map(normalizeWorkSearch);

/**
 * ПРОМАХ ПОИСКА — НЕ ПУСТОТА СПИСКА, А ПУСТОЙ ОТВЕТ НА ЗАПРОС. Пустой запрос возвращает всё, и это
 * не оптимизация: пикер обязан листаться группами, когда человек НЕ печатает.
 *
 * Порядок ответа: сначала те, у кого совпадение стоит В НАЧАЛЕ слова, потом остальные; внутри
 * каждой половины — порядок каталога (`sort`). «моско» обязано выдать московский шов первой
 * строкой, а не третьей после двух работ, у которых это слово в середине синонима.
 */
export function searchWorks(catalog: WorkCatalog, query: string): WorkItem[] {
  const q = normalizeWorkSearch(query);
  const offered = catalog.items.filter((w) => !w.retired);
  if (!q) return offered;
  const head: WorkItem[] = [];
  const tail: WorkItem[] = [];
  for (const w of offered) {
    let best = -1;
    for (const h of haystack(w)) {
      const at = h.indexOf(q);
      if (at < 0) continue;
      // «В начале слова», а не «в начале строки»: «шов» обязано находить «стачной шов».
      const wordStart = at === 0 || h[at - 1] === ' ' || h[at - 1] === '/' || h[at - 1] === '-';
      best = Math.max(best, wordStart ? 2 : 1);
    }
    if (best === 2) head.push(w);
    else if (best === 1) tail.push(w);
  }
  return [...head, ...tail];
}

// --- ГРУППЫ ЛИСТАНИЯ -----------------------------------------------------------------------------

/**
 * ПОДПИСИ СТАДИЙ — АНГЛИЙСКИЕ, потому что это интерфейс. Токен стадии приходит с сервера; словарь
 * здесь переводит его в слово человека и НИЧЕГО не решает: стадия, которой в словаре нет,
 * показывается своим токеном, а не прячется.
 */
const STAGE_LABEL: Readonly<Record<string, string>> = {
  join_seam: 'seams & joins',
  edges_hems: 'edges & hems',
  closures: 'closures',
  hardware: 'hardware',
  pressing: 'pressing & fusing',
  print_decorate: 'print & decoration',
  finishing: 'finishing',
  other: 'other',
};

export type WorkGroup = { key: string; label: string; items: WorkItem[] };

/** Группы в порядке первого появления работы — то есть в порядке `sort`, а не алфавита стадий. */
export function groupWorks(items: readonly WorkItem[]): WorkGroup[] {
  const out: WorkGroup[] = [];
  const byKey = new Map<string, WorkGroup>();
  for (const w of items) {
    let g = byKey.get(w.stage);
    if (!g) {
      g = { key: w.stage, label: STAGE_LABEL[w.stage] ?? w.stage, items: [] };
      byKey.set(w.stage, g);
      out.push(g);
    }
    g.items.push(w);
  }
  return out;
}

// --- ИМЯ РАБОТЫ: ОДНО РЕШЕНИЕ НА ВСЕ ЭКРАНЫ ------------------------------------------------------
//
// ДВОЕКОДЬЕ ПЕРЕХОДНОГО ПЕРИОДА НАЗЫВАЕТСЯ ЗДЕСЬ И БОЛЬШЕ НИГДЕ. Шаг, у которого работа названа,
// зовётся подписью каталога; шаг без работы — сегодняшней деривацией из пары (глагол, машинка),
// как звался годы. Сто прод-строк свалки размечает человек, автоматического переписывания нет, и
// оба пути обязаны отвечать одновременно — на РЕЛЬСЕ, в РЕДАКТОРЕ, на ПЕЧАТНОМ ЛИСТЕ, в КАРТЕ
// ПРИМЕРКИ, на СХЕМЕ СБОРКИ, в ССЫЛКАХ ЖАЛОБ и в АРХИВЕ РЕЛИЗОВ.
//
// ПОЧЕМУ РЕШЕНИЕ ОТДЕЛЕНО ОТ ЕГО НАПИСАНИЯ. Ответов ровно три, и различает их не текст, а
// ПРОИСХОЖДЕНИЕ имени; экраны же пишут эти три ответа по-разному: заголовок печатает голый токен,
// а триггер пикера дописывает к нему причину («unknown to this app version» против «not named
// yet»), потому что пустой триггер читался бы как «вид не назван». Разведи их текстом — и первое
// же расхождение даст разные имена одному шагу на двух экранах; в этом проекте это уже случалось.
// Поэтому РЕШЕНИЕ одно, а оформление — дело вызывателя.
//
// НЕЗНАКОМЫЙ ТОКЕН НЕ ПОДМЕНЯЕТСЯ ДОГАДКОЙ. Работа новее бандла, каталог не приехал, сервер
// старее строки — во всех трёх случаях имя есть, и это САМ ТОКЕН. Откат к деривации был бы хуже
// пустоты: он назвал бы шаг словом, которого технолог не выбирал, и человек не увидел бы, что
// приложение не знает, что здесь записано.

export type WorkNaming =
  /** Каталог (серверный или снимок бандла) знает эту работу — её подпись авторитетна. */
  | { kind: 'catalog'; token: string; text: string }
  /** Токен есть, подписи нет. `live` — приехал ли каталог: он и различает две причины. */
  | { kind: 'token'; token: string; text: string; live: boolean }
  /** Работы нет — имя выводится по-старому, из глагола с машинкой. */
  | { kind: 'derived' };

export function workNaming(catalog: WorkCatalog | undefined, work: string | undefined): WorkNaming {
  const token = (work ?? '').trim();
  if (!token) return { kind: 'derived' };
  const label = catalog?.byToken.get(token)?.label?.trim();
  if (label) return { kind: 'catalog', token, text: label };
  return { kind: 'token', token, text: token, live: catalog?.source === 'server' };
}

/**
 * СЛОВО ЗАГОЛОВКА. Пустая строка означает ровно одно — «работы нет, выводи по-старому», — и
 * именно так её читает `operationHeading`. Непустая строка НИКОГДА не бывает догадкой.
 */
export function workHeadingWord(
  catalog: WorkCatalog | undefined,
  work: string | undefined,
): string {
  const n = workNaming(catalog, work);
  return n.kind === 'derived' ? '' : n.text;
}

// --- РАЗБОР ОТВЕТА СЕРВЕРА -----------------------------------------------------------------------

const asMode = (s: string): WorkMachineMode =>
  s === 'fixed' || s === 'ask' || s === 'none' ? s : 'none';

const parseItem = (raw: OperationWorkCatalogItem): WorkItem | undefined => {
  const token = (raw.token ?? '').trim();
  if (!token) return undefined;
  return {
    token,
    verb: (raw.verb ?? '').trim(),
    stage: (raw.stage ?? '').trim() || 'other',
    // Работа БЕЗ ярлыка показывается своим токеном, а не пустой строкой: пустая строка в списке
    // читается как «пункт не загрузился» и приглашает не выбирать его вовсе.
    label: (raw.label ?? '').trim() || token,
    machineMode: asMode((raw.machineMode ?? '').trim()),
    defaultMachine: (raw.defaultMachine ?? '').trim(),
    machines: (raw.machines ?? []).map((m) => m.trim()).filter(Boolean),
    // СИНОНИМЫ — ЕДИНСТВЕННЫЙ ИСТОЧНИК ПОИСКА ПО РУССКОМУ СЛОВУ. Выкинуть их из разбора значит
    // сделать поиск английским; проба это и проверяет мутацией.
    syn: (raw.syn ?? []).map((s) => s.trim()).filter(Boolean),
    sort: raw.sort ?? 0,
    retired: !!raw.retired,
  };
};

const parseWorkItems = (works: readonly OperationWorkCatalogItem[]): WorkItem[] =>
  works
    .map(parseItem)
    .filter((w): w is WorkItem => !!w)
    .sort((a, b) => a.sort - b.sort || a.token.localeCompare(b.token));

/**
 * Ответ сервера → каталог. `undefined` значит «этот ответ каталогом не является» (пустой список
 * работ, отказ RPC) — и вызыватель обязан взять снимок бандла, а не показать пустой пикер.
 */
export function parseWorkCatalog(
  resp: GetOperationWorkCatalogResponse | undefined,
): WorkCatalog | undefined {
  const items = parseWorkItems(resp?.works ?? []);
  if (items.length === 0) return undefined;

  const defaults = new Map<string, Map<string, string>>();
  for (const d of resp?.defaults ?? []) {
    const token = (d.workToken ?? '').trim();
    const field = (d.field ?? '').trim();
    if (!token || !field) continue;
    let bucket = defaults.get(token);
    if (!bucket) {
      bucket = new Map<string, string>();
      defaults.set(token, bucket);
    }
    bucket.set(field, (d.value ?? '').trim());
  }

  const smvHints = new Map<string, { smv: string; cardName: string }>();
  for (const h of resp?.smvHints ?? []) {
    const token = (h.workToken ?? '').trim();
    const smv = (h.lastSmv?.value ?? '').trim();
    if (!token || !smv) continue;
    smvHints.set(token, { smv, cardName: (h.cardName ?? '').trim() });
  }

  return {
    source: 'server',
    items,
    byToken: new Map(items.map((w) => [w.token, w])),
    defaults,
    defaultFields: (resp?.defaultFields ?? []).map((f) => f.trim()).filter(Boolean),
    smvHints,
  };
}

/**
 * ПРОРЕЗЬ, ОБМЁТАННАЯ ЗИГЗАГОМ — ЕДИНСТВЕННЫЙ ТОКЕН РАБОТЫ, КОТОРЫЙ ЧИТАЮТ ПРАВИЛА ПОЛЕЙ (0331).
 *
 * Он назван ЗДЕСЬ и один раз, потому что спрашивают его в двух разных местах — гейт показа поля в
 * редакторе шага и зодовское зеркало серверного отказа в схеме, — а два написания одной строки
 * разъезжаются молча: половина, забывшая переименование, просто перестаёт узнавать работу, и
 * поле снова исчезает с экрана, оставаясь обязательным на сервере.
 *
 * Сервер держит ту же пару правил под теми же словами (`workAcceptsCutLength` /
 * `workRequiresCutLength` в internal/dto/techcard_operation_work.go) — и тоже одной константой.
 */
export const SLIT_OVERCAST_WORK = 'slit_overcast';

/**
 * ЧТО ИМЕННО РЕЖЕТ ЭТОТ ШАГ — ОДНО СЛОВО, И ОНО ЗДЕСЬ ОДНО НА ВЕСЬ КЛИЕНТ.
 *
 * ПОЧЕМУ ОТДЕЛЬНАЯ ФУНКЦИЯ, А НЕ ТЕРНАРНИК НА КАЖДОМ ЭКРАНЕ. `cut_length_mm` — единственное поле
 * семейства с ДВУМЯ входами (машинка `buttonhole` ИЛИ работа `slit_overcast`), и потому
 * единственное, чьё СУЩЕСТВИТЕЛЬНОЕ зависит от того, чем шаг является. Слово это читают ярлык
 * контрола в редакторе, полоса остатков рядом с ним и фраза печатного листа; написанное трижды,
 * оно разъезжается ровно так, как уже разъехалось однажды — экран после 0331 говорил «slit», а в
 * цех продолжала уезжать бумага со словом «buttonhole». Лестница имени шага живёт одним местом
 * (`operationHeading`) по этой же причине; это её продолжение, а не девятая копия.
 *
 * ЛЕСТНИЦА ТА ЖЕ, ЧТО У ЗАГОЛОВКА, И СТУПЕНЕЙ У НЕЁ ЧЕТЫРЕ:
 *
 *  1. РАБОТЫ НЕТ — «buttonhole», сегодняшняя деривация ДОСЛОВНО. Без работы единственный законный
 *     вход к полю — петельная машина, и петля там не догадка, а факт машинки. Строка, прожившая
 *     годы до оси работ, обязана называться на бумаге тем же словом, каким называлась вчера.
 *
 *  2. РАБОТА — ПРОРЕЗЬ — «slit». Тот самый инцидент, ради которого заведена R8: владелец просил
 *     прорезь под пояс, а в цех уезжало слово «петля».
 *
 *  3. РАБОТА НАЗВАНА И КАТАЛОГ ЕЁ ЗНАЕТ, НО ЭТО НЕ ПРОРЕЗЬ — снова «buttonhole», и это НЕ
 *     умолчание. Серверное правило `workAcceptsCutLength` (internal/dto/techcard_operation_work.go)
 *     БИНАРНО: длину пропускает ровно один токен работы. Значит у любой ДРУГОЙ известной работы
 *     длина законна только через машинку — то есть режется именно петля.
 *
 *  4. ТОКЕН КАТАЛОГУ НЕИЗВЕСТЕН — сам токен, ТЕКСТОМ. Это обычное состояние проекта между выкаткой
 *     бэка и выкаткой клиента, и ступень 3 здесь неприменима: незнакомая работа может быть ТРЕТЬИМ
 *     входом к полю, заведённым миграцией новее этого бандла. Сказать про неё «buttonhole» значит
 *     соврать ровно тем способом, который R8 и закрывает, — назвать шаг словом, которого технолог
 *     не выбирал. Пустоты не бывает ни на одной из четырёх ступеней.
 *
 * ПРО МАШИНКУ ЗДЕСЬ НЕ СПРАШИВАЮТ, И ЭТО НАМЕРЕННО: прорезь законна И на петельной машине тоже
 * (`machines: ['zigzag', 'buttonhole']` у пункта ниже), так что машинка на вопрос «что режут»
 * ответить не может в принципе — на петельном автомате режут и петлю, и прорезь.
 */
export function cutLengthNoun(catalog: WorkCatalog | undefined, work: string | undefined): string {
  const n = workNaming(catalog, work);
  if (n.kind === 'derived') return 'buttonhole';
  if (n.token === SLIT_OVERCAST_WORK) return 'slit';
  return n.kind === 'catalog' ? 'buttonhole' : n.token;
}

// The snapshot contains seed data. Card-specific time and user defaults are available live.
const bundledWorkItems = parseWorkItems(workSnapshot);
export const BUNDLED_WORK_CATALOG: WorkCatalog = {
  source: 'bundle',
  items: bundledWorkItems,
  byToken: new Map(bundledWorkItems.map((work) => [work.token, work])),
  defaults: new Map(),
  defaultFields: [],
  smvHints: new Map(),
};

// --- ДЕФОЛТЫ: ИМЕНА И ЗНАЧЕНИЯ -------------------------------------------------------------------

/**
 * ИМЯ КОЛОНКИ → ИМЯ ПОЛЯ ФОРМЫ. Механически, правилом, а не таблицей: сервер пишет колонками
 * (`topstitch_width_mm`), форма — camelCase (`topstitchWidthMm`), и все тридцать имён реестра
 * переводятся одним и тем же правилом. Таблица на тридцать строк рядом с ним разошлась бы на
 * тридцать первой.
 *
 * ЩИТ ОТ ОПЕЧАТКИ СТОИТ НЕ ЗДЕСЬ, А НА `emptyOperation`: имя, которого строка формы не знает,
 * пропускается молча — тем же правилом, каким `kindWrites` ждал `press_action` до его контракта.
 */
export const columnToFormField = (column: string): string =>
  column.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());

/**
 * ЗНАЧЕНИЕ ДЕФОЛТА → ЗНАЧЕНИЕ ФОРМЫ, и ФОРМА ЖЕ ГОВОРИТ, КАКОГО ОНО ТИПА.
 *
 * Пустое значение поля (`emptyOperation`) несёт всю нужную информацию, и потому второй словарь
 * «какого типа какое поле» не заводится:
 *   * `TECH_CARD_*_UNKNOWN` → словарное поле, и имя члена собирается из ТОГО ЖЕ префикса, каким
 *     подписана его пустота: `TECH_CARD_TOPSTITCH_MODE_UNKNOWN` + `edge` → `..._EDGE`. Разойтись с
 *     контрактом это не может — префикс взят из самой формы;
 *   * `0` → целое, читается числом; мусор игнорируется (дефолт не имеет права родить NaN в форме);
 *   * `''` → десятичное, едет строкой, как и всё десятичное в этой форме.
 *
 * `undefined` значит «этот дефолт в форму не кладём» — и это законный ответ, а не сбой.
 */
export function workDefaultToFormValue(blank: unknown, value: string): string | number | undefined {
  const v = value.trim();
  if (!v) return undefined;
  if (typeof blank === 'number') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  if (typeof blank !== 'string') return undefined;
  if (blank.endsWith('_UNKNOWN')) {
    // Значение уже пришло именем члена (чужой сервер, будущий формат) — берём как есть.
    if (v.startsWith('TECH_CARD_')) return v;
    return `${blank.slice(0, -'UNKNOWN'.length)}${v.toUpperCase()}`;
  }
  return v;
}

/**
 * Глобальные дефолты работы, переведённые в пары «поле формы → значение».
 *
 * ПОРЯДОК — ПОРЯДОК СЕРВЕРНОГО РЕЕСТРА, а не порядок карты дефолтов: реестр и есть тот список, по
 * которому жест рисуется и принимается, и подстановка обязана идти по нему же, чтобы «что
 * подставилось» и «что можно запомнить» читались одним списком.
 */
export function workDefaultsForForm(
  catalog: WorkCatalog,
  token: string,
  blanks: Readonly<Record<string, unknown>>,
): Array<{ field: string; column: string; value: string | number }> {
  const bucket = catalog.defaults.get(token);
  if (!bucket) return [];
  const out: Array<{ field: string; column: string; value: string | number }> = [];
  for (const column of catalog.defaultFields) {
    const raw = bucket.get(column);
    if (raw === undefined) continue;
    const field = columnToFormField(column);
    if (!(field in blanks)) continue; // имя, которого строка формы не знает
    const value = workDefaultToFormValue(blanks[field], raw);
    if (value === undefined) continue;
    out.push({ field, column, value });
  }
  return out;
}

// --- ЧТО ПИШЕТ ВЫБОР РАБОТЫ ----------------------------------------------------------------------

/**
 * DOES THE STEP ALREADY ANSWER «ON WHAT» ON THE PRESS AXIS — the predicate the press side of
 * `workWrites` narrows by, and the widest honest one there is today.
 *
 * THE MACHINE AXIS NARROWS BY AN AUTHORITY: `item.machines` comes from the catalog, the server
 * checks the pair and names the refusal on `operations[N].work`. The press axis has no such
 * authority ANYWHERE — `operation_work` carries no press column at all, and the server's equipment
 * gate requires `press_equipment` on press / press_open / fusing without ever comparing it with
 * `press_action`. «Which equipment can steam» is a question nothing answers, so answering it here
 * would be both a claim the bundle has no right to make and the second dictionary this phase is
 * busy removing.
 *
 * WHAT IS LEFT IS THE ONE FACT THAT IS NOT A GUESS: the step names a press, i.e. a person answered.
 * Blankness is read off the `_UNKNOWN` suffix, the same way `workDefaultToFormValue` reads it — a
 * private copy of `TECH_CARD_PRESS_EQUIPMENT_UNKNOWN` here would be the third spelling of one
 * string.
 */
const pressAnswered = (name: string): boolean => !!name.trim() && !name.endsWith('_UNKNOWN');

/**
 * НАБОР ЗНАЧЕНИЙ, КОТОРЫЙ ВЫБОР РАБОТЫ ЗАПИСЫВАЕТ В СТРОКУ ШАГА, — плоской картой «имя поля →
 * значение», ровно как у `kindWrites`. Само поле `work` сюда НЕ входит: его пишет вызыватель,
 * потому что оно едет и тогда, когда пункта у работы нет вовсе.
 *
 * ДВА ИСТОЧНИКА, И ГРАНИЦА МЕЖДУ НИМИ ЖЁСТКАЯ:
 *   * ОСЬ «ЧТО» И ОСЬ «НА ЧЁМ» — ИЗ КАТАЛОГА. Глагол и машинка следуют из работы, и авторитетен
 *     здесь сервер: он же их и проверит («глагол шага не совпал с глаголом работы» — именованный
 *     отказ на `operations[N].work`). Бандл может быть старше каталога на сколько угодно;
 *   * ОСТАЛЬНАЯ ЛИЧНОСТЬ — ИЗ ПУНКТА, если он есть: класс шва у отстрочки, метод крепления у
 *     фурнитуры, режим покрытия у контроля, под-глагол ВТО. Каталог этих полей не несёт вовсе, и
 *     заводить их там значило бы построить вторую таблицу «что пункт штампует» — ровно ту, от
 *     которой фаза отказалась решением 7.
 *
 * РАБОТА БЕЗ ПУНКТА (0331: московский шов, сборка, посадка, обмётанная прорезь) законна и
 * записывается ОДНИМ глаголом с машинкой — этого достаточно: её личность и есть эта пара.
 */
export function workWrites(
  item: WorkItem,
  kind: OperationKind | undefined,
  /** Машинка, стоящая на шаге сейчас (имя enum'а) — её выбор работы не переставляет без нужды. */
  machineOnStep: string,
  /** Единственный подходящий профиль парка, если он есть (имя enum'а). */
  machineFromPark: string,
  /** ВТО-оборудование, стоящее на шаге сейчас (имя enum'а) — оно тоже ответ человека, не осадок. */
  pressOnStep: string,
  kindWrites: (k: OperationKind, machineForAsk?: string) => Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = kind
    ? { ...kindWrites(kind, machineOnStep || machineFromPark) }
    : { operationType: verbTokenToEnum(item.verb) };
  // Глагол — из каталога, всегда: пункт бандла мог назвать другой, и правым тогда будет сервер.
  out.operationType = verbTokenToEnum(item.verb) || out.operationType;

  // THE PRESS AXIS KEEPS WHAT THE PERSON CHOSE, exactly as the machine axis does. G4 «Steam» and
  // G8 «Mould» (and G9 «Fuse») NAME a piece of equipment, and writing it unconditionally moved a
  // step the owner had put on his iron onto a steamer — on screen, with no label over it and no
  // question asked. That is the same silent substitution the machine axis was taught not to make,
  // and the axis it happens on is the one where nothing downstream would have caught it: the
  // equipment is required on a press step, so a wrong answer saves as cleanly as a right one.
  //
  // IT STANDS BEFORE THE MACHINE BRANCH BECAUSE EVERY PRESS WORK LEAVES THROUGH IT: pressing
  // answers «none» to the question «on what machine», and that branch returns.
  //
  // WHAT THIS DELIBERATELY DOES NOT DO: equipment named for a DIFFERENT job (a fusing press on a
  // step just turned into steaming) also survives. Narrowing that needs a list of which equipment
  // performs which action, and no such list exists on either side of the wire — see
  // `pressAnswered`. Meanwhile the fact stays visible on its own control, which is the side of
  // «сломаться можно, исчезнуть нельзя» this phase keeps choosing.
  if (out.pressEquipment && pressAnswered(pressOnStep)) out.pressEquipment = pressOnStep;

  if (item.machineMode === 'none') {
    // Ось «на чём» у этого глагола не машинная. Пункт бандла, назвавший машинку, здесь молчит —
    // но СТИРАТЬ уже стоящую на шаге машинку никто не имеет права: это не жест выбора работы.
    delete out.machineType;
    return out;
  }
  const allowed = item.machines.length
    ? item.machines
    : item.defaultMachine
      ? [item.defaultMachine]
      : [];
  const fallback = machineTokenToEnum(item.defaultMachine || allowed[0] || '');
  const fits = (name: string) => !!name && allowed.includes(enumToMachineToken(name));
  if (item.machineMode === 'fixed') {
    // Машинка СЛЕДУЕТ ИЗ РАБОТЫ: выбрал оверлок — шаг едет на оверлоке. Уже стоящая машинка
    // сохраняется только если работа её допускает (у fixed допустимая ровно одна).
    out.machineType = fits(machineOnStep) ? machineOnStep : fallback || out.machineType || '';
  } else {
    // `ask`: стоящая на шаге и подходящая важнее всего (смена вида не переставляет шаг на другую
    // машину), затем единственный подходящий профиль парка, затем дефолт работы.
    out.machineType = fits(machineOnStep)
      ? machineOnStep
      : fits(machineFromPark)
        ? machineFromPark
        : fallback || out.machineType || '';
  }
  if (!out.machineType) delete out.machineType;
  return out;
}

// --- ЕДИНСТВЕННЫЙ ПИСАТЕЛЬ РАБОТЫ ----------------------------------------------------------------
//
// ЗАЧЕМ ЭТА ФУНКЦИЯ ЕСТЬ. Всё, что выбор работы пишет в строку шага, до сих пор жило ОРКЕСТРОВКОЙ
// ВНУТРИ РЕДАКТОРА ШАГА: `applyWork` замкнут на семь `useWatch` открытой строки и на два её
// локальных состояния, и позвать его снаружи нельзя вовсе. Экран ратификации (R7) — второй
// вызыватель того же жеста: он предлагает работу и записывает её в ту же форму. Скопировать
// оркестровку туда значило бы завести ВТОРОГО ПИСАТЕЛЯ тех же правил — и разошлись бы они молча,
// ровно так же, как расходились два списка дискриминаторов и два словаря поиска.
//
// ПОЭТОМУ ВЫНЕСЕНА ЧИСТАЯ СЕРЕДИНА, А НЕ НАПИСАНА ВТОРАЯ. Внутри — те же `workWrites`, тот же
// `kindClears` и те же две ветки подбора профиля парка, перенесённые СЛОВО В СЛОВО; ни одного
// правила здесь не переписано, и поведение строки не изменилось ни на байт (это ИЗМЕРЕНО, а не
// заявлено: `scripts/operation-work-apply-probe.mjs` гоняет батарею через живой редактор дважды —
// на блобах коммита до правки и на рабочем дереве — и требует побайтного совпадения ответов).
//
// ЧЕГО ЗДЕСЬ НЕТ И НЕ БУДЕТ:
//   * НИ ОДНОГО ДЕФОЛТА. Подстановка (`resolveStepDefaults`: последний такой же шаг карточки >
//     глобальный дефолт работы) — ОТДЕЛЬНЫЙ жест с отдельной меткой «подставлено», и живёт он у
//     строки шага, потому что читает СОСЕДНИЕ строки карточки. Панель ратификации не подставляет
//     ничего вовсе: она подтверждает ИМЯ, а не заполняет шаг. Втащить дефолты сюда можно только
//     расширив вход — и это ровно та граница, которую стережёт мутация `--mutate-prefill`;
//   * НИ ОДНОГО ЧИСЛА ИЗ ПАРКА. Связь с профилем пишется КЛЮЧОМ (`links`), значения профиля не
//     копируются никогда: унаследованное число, записанное в шаг, стёрло бы разницу между
//     «технолог выбрал 4 ст/см» и «так вышло по умолчанию»;
//   * НИ ОДНОЙ ЗАПИСИ В ФОРМУ. Функция возвращает НАМЕРЕНИЕ; кто и в каком порядке кладёт его в
//     форму — дело вызывателя. Порядок при этом несущий, и вызыватели обязаны его держать: сперва
//     `writes`, затем `clears` (снятие считается по УЖЕ применённому набору), затем `links`.

/** Строка парка «машинки»: столько, сколько спрашивает подбор, и ни полем больше. */
export type ParkMachineRow = { machineType?: string; profileKey?: string };
/** Строка парка «ВТО»: сверх оборудования и ключа — процесс, которым сужается лестница. */
export type ParkPressRow = { pressEquipment?: string; profileKey?: string; operationType?: string };

/**
 * ЧТО СТОИТ НА ШАГЕ СЕЙЧАС — ровно те поля, по которым применение принимает решения.
 *
 * Стоит НАД `OperationKindStep`, а не рядом: снятие якоря спрашивает резолв, и резолву нужны его
 * поля буква в букву. Сверху — то, чего резолв не спрашивает, а применение читает: обе ссылки на
 * профили парка (уже стоящая ссылка — решение технолога, и перебивать её выбором работы значило бы
 * молча переставить шаг на другой станок).
 */
export type StepSnapshot = OperationKindStep & {
  seamKind?: string;
  workVariant?: string;
  machineProfileKey?: string;
  pressProfileKey?: string;
};

/**
 * НАМЕРЕНИЕ ЗАПИСИ, РАЗДЕЛЁННОЕ ПО ПРИРОДЕ ФАКТОВ, а не сваленное в одну карту:
 *
 * `writes` — ЛИЧНОСТЬ РАБОТЫ: глагол и машинка из каталога, режим отстрочки, метод крепления,
 *            под-глагол ВТО. Само поле `work` сюда НЕ входит — его пишет вызыватель, потому что
 *            оно едет и тогда, когда пункта у работы нет вовсе;
 * `clears` — ЯКОРЬ ЧУЖОГО ПУНКТА, который пикер сам же когда-то и написал. Пусто в подавляющем
 *            большинстве случаев, и пустота эта содержательная: «смена работы ничего не стирает»
 *            остаётся правилом, у которого ровно одна названная граница;
 * `links`  — ССЫЛКА НА ПРОФИЛЬ ПАРКА, и только в ПУСТОЙ ключ. Ключ отсутствует в объекте =
 *            «связывать нечем» (профиля нет, их несколько, или человек уже ответил сам).
 */
export type WorkApplication = {
  writes: Record<string, string>;
  clears: Partial<Record<OperationFormStringField, string>>;
  links: { machineProfileKey?: string; pressProfileKey?: string };
};

/** Keep a variant only while the selected work declares it. */
export function variantAfterWork(work: string, variant: string): string {
  if (!variant) return '';
  return isWorkVariant(work, variant) ? variant : '';
}

export function workApplication(input: {
  item: WorkItem;
  kind: OperationKind | undefined;
  current: StepSnapshot;
  park: { machines: readonly ParkMachineRow[]; presses: readonly ParkPressRow[] };
}): WorkApplication {
  const { item, kind: k, current, park } = input;

  // «НА ЧЁМ», КОГДА РАБОТА ЖИВЁТ НА НЕСКОЛЬКИХ МАШИНКАХ. Машинку шаг MACHINE обязан нести —
  // сервер отвергает MACHINE без неё, — поэтому работа её ставит, но не угадывает молча: стоящая
  // на шаге и подходящая важнее всего (смена работы не переставляет шаг на другую машину), затем
  // единственная подходящая в парке, затем дефолт работы. Список допустимых — ИЗ КАТАЛОГА: у
  // работы, которой этот бандл не знает, суженного списка в бандле и нет.
  let machineFromPark = '';
  if (item.machineMode === 'ask') {
    const narrowed = item.machines.map(machineTokenToEnum);
    const fits = park.machines.filter(
      (m) => narrowed.includes(m.machineType ?? '') && (m.profileKey ?? '').trim(),
    );
    if (fits.length === 1) machineFromPark = fits[0].machineType ?? '';
  }

  const writes = workWrites(
    item,
    k,
    current.machineType ?? '',
    machineFromPark,
    current.pressEquipment ?? '',
    kindWrites,
  );
  const nextVariant = variantAfterWork(item.token, current.workVariant ?? '');
  if (nextVariant !== (current.workVariant ?? '')) writes.workVariant = nextVariant;

  // ЯКОРЬ ЧУЖОГО ПУНКТА, ОСТАВШИЙСЯ В ЗАПИСИ, ПЕРЕИГРЫВАЛ ВЫБОР ЧЕЛОВЕКА. Замерено: на шаге
  // `{MACHINE, LOCKSTITCH, seam_class = OS_TOPSTITCH}` пункты «Join — lockstitch», «Coverstitch»,
  // «Chainstitch», «AMF» и «Attach label» не брались вовсе — запись писалась, но резолв снова
  // отвечал «Topstitch» по классу шва, и пикер откатывался.
  //
  // Что именно снять, решает `kindClears` — она СПРАШИВАЕТ резолв, а не повторяет его правила, и
  // снимает ровно тот якорь, который пикер сам и пишет как личность другого пункта. Считается
  // снятие по УЖЕ ПРИМЕНЁННОМУ набору, поэтому шаг собирается здесь заново.
  const after: OperationKindStep = {
    operationType: writes.operationType ?? current.operationType,
    machineType: writes.machineType ?? current.machineType,
    seamClass: writes.seamClass ?? current.seamClass,
    topstitchMode: writes.topstitchMode ?? current.topstitchMode,
    attachMethod: writes.attachMethod ?? current.attachMethod,
    coverageMode: writes.coverageMode ?? current.coverageMode,
    labelAttachStitch: writes.labelAttachStitch ?? current.labelAttachStitch,
    pressAction: writes.pressAction ?? current.pressAction,
    bomKinds: current.bomKinds,
  };
  // У РАБОТЫ БЕЗ ПУНКТА СНИМАТЬ НЕЧЕГО — И ЭТО НЕ ПРОБЕЛ. `kindClears` снимает ровно тот якорь,
  // который САМ ПИКЕР пишет как личность ДРУГОГО пункта; работа, у которой пункта в этом бандле
  // нет, ни одного якоря не писала, и снимать чужой факт «на всякий случай» было бы ровно тем
  // стиранием, которого фаза «перестать терять» не допускает.
  const clears = k ? kindClears(k, after) : {};
  // The edge a topstitch runs on (turned, single or double hem) is its own seam kind and stays;
  // any other kind is a join's and goes.
  const keptKind = (current.seamKind ?? '').trim();
  if (
    operationHowKind(k?.id, item.token) === 'topstitch' &&
    keptKind &&
    !TOPSTITCH_EDGE_KINDS.has(keptKind)
  ) {
    clears.seamKind = '';
  }

  // СВЯЗЬ С ПРОФИЛЕМ ПАРКА ПИШЕТСЯ КЛЮЧОМ, ЯВНО — единственное, что вообще подтягивается при
  // выборе работы, и подтягивается оно СВЯЗЬЮ, а не значениями.
  //
  // Почему явно: пустой ключ сервер сохраняет как «не задано» (обещанного «пустой ключ = профиль
  // этого типа, если он единственный» на ЗАПИСИ нет), а тип, разрешённый через профиль,
  // применимости полей не открывает — отказ придёт примерно на восемнадцати полях.
  //
  // Почему только в пустой ключ: уже стоящая ссылка — это решение технолога, и перебивать её
  // выбором работы значило бы молча переставить шаг на другой станок.
  const links: WorkApplication['links'] = {};
  const targetMachine = writes.machineType ?? '';
  const currentMachineKey = (current.machineProfileKey ?? '').trim();
  const machineFits = park.machines.filter(
    (m) => m.machineType === targetMachine && (m.profileKey ?? '').trim(),
  );
  // A link made for the machine the step had is the technologist's answer for THAT machine. Once
  // the work moves the step to another machine it points at the wrong type, and the server refuses
  // the whole card (`profile_type_mismatch`: hem on lockstitch → bind/tape edge, card 162 step 190).
  const staleMachineKey =
    !!targetMachine &&
    !!currentMachineKey &&
    targetMachine !== (current.machineType ?? '') &&
    !machineFits.some((m) => (m.profileKey ?? '').trim() === currentMachineKey);
  if (targetMachine && (!currentMachineKey || staleMachineKey)) {
    if (machineFits.length === 1) {
      links.machineProfileKey = (machineFits[0].profileKey ?? '').trim();
    } else if (staleMachineKey) {
      links.machineProfileKey = '';
    }
  }
  const targetPress = writes.pressEquipment ?? '';
  if (targetPress && !(current.pressProfileKey ?? '').trim()) {
    // Процесс сужает лестницу и здесь: профиль, написанный для дублирования, разутюжке не
    // отвечает. Предикат берётся существующий — второго такого не заводится.
    const stepVerb = writes.operationType ?? current.operationType;
    const fits = park.presses.filter(
      (pr) =>
        pr.pressEquipment === targetPress &&
        (pr.profileKey ?? '').trim() &&
        pressProfileFitsStep(pr, stepVerb),
    );
    if (fits.length === 1) links.pressProfileKey = (fits[0].profileKey ?? '').trim();
  }

  return { writes, clears, links };
}

// --- ПРИОРИТЕТ ДЕФОЛТОВ --------------------------------------------------------------------------

export type StepDefaultSource = 'card' | 'global';
export type StepDefaultFill = {
  field: string;
  value: string | number;
  source: StepDefaultSource;
};

/**
 * ЧТО ПОДСТАВИТЬ В ПУСТЫЕ ПОЛЯ ПРИ ВЫБОРЕ РАБОТЫ — И В КАКОМ ПОРЯДКЕ.
 *
 * ПРИОРИТЕТ: последний такой же шаг НА ЭТОЙ КАРТОЧКЕ > глобальный дефолт работы > пусто.
 * Порядок именно такой, и он не переспаривается: карточка — контекст ближе. Поставил на этом
 * изделии отстрочку 4 мм, хотя «вообще» у тебя 6, — следующая отстрочка ЭТОГО изделия обязана
 * прийти четвёркой. Обратный порядок молча переписывал бы решение, принятое пять минут назад,
 * решением, принятым полгода назад, — и человек не увидел бы даже, что его переписали.
 *
 * ТОЛЬКО В ПУСТОЕ. Заполненное не трогается никогда — ни своё, ни чужое: ответ человека старше
 * любого дефолта. «Пусто» спрашивается у `blanks` (`emptyOperation`), а не третьим списком
 * дисциплин: у enum'а это токен `*_UNKNOWN`, у целого 0, у десятичного пустая строка.
 */
export function resolveStepDefaults(
  fields: readonly string[],
  blanks: Readonly<Record<string, unknown>>,
  current: Readonly<Record<string, unknown>>,
  fromCard: Readonly<Record<string, string | number>>,
  fromGlobal: Readonly<Record<string, string | number>>,
): StepDefaultFill[] {
  const isBlank = (field: string, v: unknown): boolean => {
    if (v === undefined) return true;
    const blank = blanks[field];
    if (v === blank) return true;
    return typeof v === 'string' && v.trim() === '';
  };
  const out: StepDefaultFill[] = [];
  for (const field of fields) {
    if (!(field in blanks)) continue; // имя, которого строка формы не знает
    if (!isBlank(field, current[field])) continue;
    const card = fromCard[field];
    if (card !== undefined && !isBlank(field, card)) {
      out.push({ field, value: card, source: 'card' });
      continue;
    }
    const global = fromGlobal[field];
    if (global !== undefined && !isBlank(field, global)) {
      out.push({ field, value: global, source: 'global' });
    }
  }
  return out;
}

/**
 * ЗНАЧЕНИЕ ФОРМЫ → ЗНАЧЕНИЕ ДЕФОЛТА, обратно `workDefaultToFormValue`: жест «запомнить» шлёт
 * серверу то же написание, каким сервер его и проверяет (короткий токен, число строкой).
 * Пустая строка значит «запоминать нечего» — вызыватель обязан жест не предлагать.
 */
export function formValueToWorkDefault(blank: unknown, value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0 ? String(value) : '';
  if (typeof value !== 'string') return '';
  const v = value.trim();
  if (!v) return '';
  if (typeof blank === 'string' && blank.endsWith('_UNKNOWN')) {
    if (v === blank) return '';
    const prefix = blank.slice(0, -'UNKNOWN'.length);
    return v.startsWith(prefix) ? v.slice(prefix.length).toLowerCase() : v.toLowerCase();
  }
  return v;
}
