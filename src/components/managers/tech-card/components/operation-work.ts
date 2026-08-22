import type {
  GetOperationWorkCatalogResponse,
  OperationWorkCatalogItem,
} from 'api/proto-http/admin';
import {
  KIND_FAMILY_LABEL,
  KIND_WORK_TOKEN,
  OPERATION_KINDS,
  kindIsOffered,
  kindLabelOf,
  type OperationKind,
} from './operation-kinds';

// КАТАЛОГ РАБОТ — СЕРВЕРНЫЕ ДАННЫЕ, А НЕ СПИСОК В БАНДЛЕ.
//
// До этой фазы «вид операции» существовал ровно одним способом: пятьюдесятью четырьмя строками в
// `operation-kinds.ts`, которые НИГДЕ не хранились — экран каждый раз выводил вид заново из пары
// (глагол, машинка). Из-за этого сто прод-строк из ста двадцати шести неотличимы друг от друга,
// сервер не мог сказать «такой работы нет», а поиск по слову технолога («моско») был невозможен:
// русских слов в бандле нет и быть не должно.
//
// ЧТО ЭТОТ МОДУЛЬ ЕСТЬ. Чистый разбор ответа `GetOperationWorkCatalog` в форму, удобную пикеру:
// пункты, синонимный индекс, группы по стадии, глобальные дефолты и реестр полей дефолта. Ни
// одного обращения к сети, ни одного React-импорта — вся поверхность проверяется пробой.
//
// ЧЕГО В НЁМ НЕТ И ПОЧЕМУ:
//   * НИ ОДНОГО РУССКОГО СЛОВА. Синонимы приходят с сервера (`operation_work_syn`, 0329) и живут
//     ровно столько, сколько живёт ответ. Скопировать их в бандл значило бы завести второй словарь
//     поиска, который разойдётся с первым на первой же правке владельца, — и разойдётся молча;
//   * никакой записи. Что выбор пункта пишет в строку шага, решает вызыватель — здесь только
//     перевод серверных токенов в имена enum'а провода.
//
// ФОЛБЭК-СНАПШОТ. Пикер НИКОГДА не бывает пустым: не приехал каталог — список собирается из
// `OPERATION_KINDS` и токенов `KIND_WORK_TOKEN`. Снимок ВЫВОДИТСЯ из таблицы пунктов, а не набран
// второй раз руками: `machine_mode`, машинки и глагол считаются из тех же полей, из которых их
// пишет `kindWrites`. Расходиться нечему по построению. Цена деградации названа честно: в снимке
// нет синонимов, значит нет и поиска по русскому слову — только по английскому имени пункта.

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
  /** Откуда список: ответ сервера или снимок бандла. Показывается человеку, а не только логу. */
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
export const enumToVerbToken = (name: string): string =>
  name.startsWith(OPERATION_TYPE_PREFIX)
    ? name.slice(OPERATION_TYPE_PREFIX.length).toLowerCase()
    : '';
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
  // Группы СНИМКА подписываются семействами бандла — тем же словарём, каким пикер подписывал их до
  // этой фазы. Выводятся, а не набраны второй раз: снимок группируется по `fam_<буква>` (см.
  // `bundleItem`), и подпись обязана прийти из того же места, что и буква.
  ...Object.fromEntries(
    Object.entries(KIND_FAMILY_LABEL).map(([family, label]) => [`fam_${family}`, label]),
  ),
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

/**
 * Ответ сервера → каталог. `undefined` значит «этот ответ каталогом не является» (пустой список
 * работ, отказ RPC) — и вызыватель обязан взять снимок бандла, а не показать пустой пикер.
 */
export function parseWorkCatalog(
  resp: GetOperationWorkCatalogResponse | undefined,
): WorkCatalog | undefined {
  const items = (resp?.works ?? [])
    .map(parseItem)
    .filter((w): w is WorkItem => !!w)
    .sort((a, b) => a.sort - b.sort || a.token.localeCompare(b.token));
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

// --- СНИМОК БАНДЛА ------------------------------------------------------------------------------

const bundleItem = (k: OperationKind, sort: number): WorkItem | undefined => {
  const token = KIND_WORK_TOKEN[k.id];
  if (!token) return undefined;
  const fixed = enumToMachineToken(k.writes?.machineType ?? '');
  const asked = (k.askMachine ?? []).map((m) => enumToMachineToken(m)).filter(Boolean);
  const machineMode: WorkMachineMode = asked.length ? 'ask' : fixed ? 'fixed' : 'none';
  return {
    token,
    verb: enumToVerbToken(k.verb),
    // ГРУППА СНИМКА — СЕМЕЙСТВО БАНДЛА, А НЕ СТАДИЯ СЕРВЕРА, и это осознанная неточность. Стадия
    // живёт в каталоге (`operation_work.stage`); переписать её сюда значило бы завести второй
    // список группировки, который разъедется с первым молча. Пока каталог не приехал, список
    // группируется так, как его группирует бандл, — и это видно человеку по подписи источника.
    stage: `fam_${k.family}`,
    label: kindLabelOf(k),
    machineMode,
    defaultMachine: asked.length
      ? enumToMachineToken(k.defaultMachine ?? '') || asked[0]
      : fixed,
    machines: asked.length ? asked : fixed ? [fixed] : [],
    // СИНОНИМОВ У СНИМКА НЕТ. Это цена деградации, названная вслух: русские слова живут на
    // сервере, и класть их в бандл ради оффлайна значило бы завести второй словарь поиска.
    syn: [],
    sort,
    retired: false,
  };
};

/**
 * Снимок бандла — на один релиз, пока хоть один клиент может не получить каталог. Стоит в
 * `WorkCatalog` тем же типом, что и серверный ответ: у пикера ровно один путь отрисовки.
 */
export const BUNDLED_WORK_CATALOG: WorkCatalog = (() => {
  const items: WorkItem[] = [];
  let sort = 0;
  for (const k of OPERATION_KINDS) {
    if (!kindIsOffered(k)) continue;
    sort += 10;
    const item = bundleItem(k, sort);
    if (item) items.push(item);
  }
  return {
    source: 'bundle',
    items,
    byToken: new Map(items.map((w) => [w.token, w])),
    defaults: new Map(),
    // РЕЕСТРА ДЕФОЛТОВ У СНИМКА НЕТ — и жест «запомнить как дефолт» без каталога не рисуется
    // вовсе. Свой список здесь был бы ровно тем вторым реестром, ради отсутствия которого сервер
    // и отдаёт `default_fields`.
    defaultFields: [],
    smvHints: new Map(),
  };
})();

// Группы снимка подписываются семействами бандла — тем же словарём, каким они подписаны в пикере
// до этой фазы. Регистрируется здесь, чтобы `groupWorks` не знала про два источника.
for (const [family, label] of Object.entries(KIND_FAMILY_LABEL)) {
  (STAGE_LABEL as Record<string, string>)[`fam_${family}`] = label;
}

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
  kindWrites: (k: OperationKind, machineForAsk?: string) => Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = kind
    ? { ...kindWrites(kind, machineOnStep || machineFromPark) }
    : { operationType: verbTokenToEnum(item.verb) };
  // Глагол — из каталога, всегда: пункт бандла мог назвать другой, и правым тогда будет сервер.
  out.operationType = verbTokenToEnum(item.verb) || out.operationType;

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
