import type {
  GetOperationWorkCatalogResponse,
  OperationWorkCatalogItem,
} from 'api/proto-http/admin';
import { pressProfileFitsStep } from './equipment-options';
import {
  KIND_FAMILY_LABEL,
  KIND_WORK_TOKEN,
  OPERATION_KINDS,
  kindClears,
  kindIsOffered,
  kindLabelOf,
  kindWrites,
  type OperationKind,
  type OperationKindStep,
} from './operation-kinds';
import type { OperationFormStringField } from './operation-options';

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
// пишет `kindWrites`. Расходиться нечему по построению. Цена деградации названа честно: у
// выведенных работ синонимов нет, значит нет и поиска по русскому слову — только по английскому
// имени пункта.
//
// ВЫВЕСТИ УДАЁТСЯ НЕ ВСЁ, И НЕВЫВОДИМОЕ ВЫПИСАНО ОТДЕЛЬНО (`CATALOG_ONLY_WORKS` и две карты рядом
// с ним): работа, у которой пункта в этом файле нет вовсе, выводиться не из чего, а `retired` и
// `label` — колонки каталога, а не факты бандла. Дельта ровно одна, стережёт её проба, читающая
// сами миграции; всё выводимое по-прежнему выводится.

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

export function workNaming(
  catalog: WorkCatalog | undefined,
  work: string | undefined,
): WorkNaming {
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

// --- WHAT THE CATALOG SAYS AND THE KINDS TABLE CANNOT (0331) -------------------------------------
//
// THE SNAPSHOT IS DERIVED FROM THE KINDS TABLE, AND FOR THREE OF THE CATALOG'S FACTS THERE IS
// NOTHING TO DERIVE FROM. Migration 0331 did three things no `OperationKind` can express: it minted FOUR
// works that have no picker item in this bundle at all, it RETIRED `gather_ease` (a false merge of
// two different jobs — gathering and easing a sleeve head), and it renamed the label of the dump
// `join_lockstitch` without touching the token. Derivation cannot reach any of them: a work with no
// item has no row to derive from, and `retired` / `label` are catalog columns, not bundle facts.
//
// SO THE DELTA IS WRITTEN OUT, AND ONLY THE DELTA. Everything derivable stays derived — one more
// hand-typed copy of the fifty-three existing works is exactly the second dictionary this phase is
// removing. Three named lists, each answering one question the kinds table cannot be asked.
//
// PRICE OF LEAVING IT UNDONE, MEASURED IN THE OWNER'S OWN WORDS: `moscow_hem` and `slit_overcast`
// are the two jobs he asked for BY NAME. With the catalog request refused they would not be in the
// picker at all — and the picker is the one place a job can be named at all.
//
// THE GUARD IS NOT A PROMISE, IT IS A PROBE. `work-picker-probe` parses the migrations themselves
// (0329 + 0331 + whatever comes next) and compares them with this snapshot token by token, label by
// label, sort by sort. A work seeded server-side and forgotten here turns it red; so does a label
// changed on one side only. It skips — never fails — when the backend tree is not next to this one,
// the same way the probes skip a missing playwright: an absent guard is not a statement about code.

/**
 * WORKS THAT LIVE ONLY IN THE CATALOG — no `OperationKind`, no `KIND_WORK_TOKEN` row, nothing to
 * derive. Their identity IS the pair (verb, machine), which is why they need no picker item: see
 * `workWrites`, which writes exactly that pair for a work with no kind.
 *
 * THE SYNONYMS ARE HERE, AND THAT BENDS THE RULE STATED ABOVE ON PURPOSE. The snapshot carries no
 * Russian for the fifty-three derived works: they have English labels a person can find them by,
 * and copying the server's synonym table would be a second search dictionary. For these four the
 * calculation is different — the label is the ONLY string that reaches the bundle, and the
 * technologist searching for the rolled hem types «моско», not «rolled». Without these words the
 * degraded picker holds the job he asked for and refuses to show it to him. The copy is bounded
 * (four works, one migration) and the guard compares it with the migration word for word.
 *
 * SORT NUMBERS ARE THE SERVER'S OWN. 0329 stepped by tens precisely so a later work could stand
 * next to its kin: 75 right after the blindhem (70), 141/142 right after the retired ancestor
 * (140), 165 between the buttonhole (160) and the button (170). The derived rows step by tens in
 * the same order, so the merged list comes out in catalog order without a second ordering rule.
 *
 * GROUP IS THE BUNDLE'S FAMILY, NOT THE CATALOG'S STAGE — the same deliberate imprecision the
 * derived rows carry (see `bundleItem`), and for the same reason: while the catalog is down the
 * list groups the way the bundle groups. Which family is not a guess — it is the family of the
 * neighbours the SERVER sorted each work among.
 */
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
export function cutLengthNoun(
  catalog: WorkCatalog | undefined,
  work: string | undefined,
): string {
  const n = workNaming(catalog, work);
  if (n.kind === 'derived') return 'buttonhole';
  if (n.token === SLIT_OVERCAST_WORK) return 'slit';
  return n.kind === 'catalog' ? 'buttonhole' : n.token;
}

const CATALOG_ONLY_WORKS: readonly WorkItem[] = [
  {
    token: 'moscow_hem',
    verb: 'machine',
    stage: 'fam_A',
    label: 'Hem — rolled (Moscow)',
    machineMode: 'fixed',
    defaultMachine: 'lockstitch',
    machines: ['lockstitch'],
    syn: [
      'московский',
      'московский шов',
      'узкая подгибка',
      'рубильник',
      'moscow',
      'moscow hem',
      'rolled hem',
      'narrow hem',
    ],
    sort: 75,
    retired: false,
  },
  {
    token: 'gather',
    verb: 'machine',
    stage: 'fam_B',
    label: 'Gather',
    machineMode: 'fixed',
    defaultMachine: 'gathering',
    machines: ['gathering'],
    syn: ['сборка', 'сборить', 'присборить', 'оборка', 'gather', 'gathering', 'ruffle'],
    sort: 141,
    retired: false,
  },
  {
    token: 'ease_in',
    verb: 'machine',
    stage: 'fam_B',
    label: 'Ease in — machine',
    machineMode: 'fixed',
    defaultMachine: 'gathering',
    machines: ['gathering'],
    syn: ['посадка', 'посадить', 'посадка оката', 'припосадить', 'ease', 'ease in', 'sleeve ease'],
    sort: 142,
    retired: false,
  },
  {
    // ASK, AND THE TWO MACHINES ARE TWO WAYS OF DOING ONE JOB: the zigzag overcasts the raw edge of
    // the slit, the buttonhole automat cuts and overcasts in one pass. Without this row the
    // degraded picker cannot even ask the question.
    token: 'slit_overcast',
    verb: 'machine',
    stage: 'fam_C',
    label: 'Slit — overcast',
    machineMode: 'ask',
    defaultMachine: 'zigzag',
    machines: ['zigzag', 'buttonhole'],
    syn: [
      'прорезь',
      'обметать прорезь',
      'обмётанная прорезь',
      'разрез',
      'slit',
      'slit overcast',
      'overcast slit',
    ],
    sort: 165,
    retired: false,
  },
];

/**
 * RETIRED SERVER-SIDE — offered to nobody, readable by everybody. A retired work is dropped from
 * the picker by `searchWorks` and kept in `byToken`, because a step that already carries the token
 * must still open and still be named by its own label. Deleting the row instead would take from a
 * person the right to save a card he once marked up.
 */
const RETIRED_WORKS: ReadonlySet<string> = new Set(['gather_ease']);

/**
 * LABEL CHANGED WITHOUT THE TOKEN CHANGING, and that asymmetry is the whole point. «Join —
 * lockstitch» fails the substitution test — move the job to an overlock and the name becomes a lie
 * — so 0331 renamed it to «Join / seam», which names the JOB. The token never moves: it travels
 * into the digest projection of every step row, and a token edited after the fact splits the
 * signature in two. So the bundle overrides the derived label and leaves `KIND_WORK_TOKEN` alone.
 *
 * THE KIND'S OWN LABEL IS NOT TOUCHED HERE. `OPERATION_KINDS[A1].label` names a picker ITEM anchored
 * on the lockstitch, and it is read by the picker trigger of every step that has no work at all —
 * the hundred production rows this phase is untangling. Renaming that string would rename those
 * rows on nine screens in the same commit that only meant to catch the snapshot up.
 */
const RELABELLED_WORKS: Readonly<Record<string, string>> = {
  join_lockstitch: 'Join / seam',
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
    // The step of ten is the SERVER'S step (0329), not a bundle habit — it is what lets a work
    // minted later stand between two derived ones instead of at the end of the list.
    sort += 10;
    const item = bundleItem(k, sort);
    if (!item) continue;
    const relabelled = RELABELLED_WORKS[item.token];
    items.push({
      ...item,
      ...(relabelled ? { label: relabelled } : null),
      retired: RETIRED_WORKS.has(item.token),
    });
  }
  items.push(...CATALOG_ONLY_WORKS);
  // ONE ORDER FOR BOTH SOURCES — the same comparator `parseWorkCatalog` sorts the server answer by.
  // A merged list ordered any other way would put the same two works in a different order depending
  // on whether the catalog answered, and the person would read that as the list being broken.
  items.sort((a, b) => a.sort - b.sort || a.token.localeCompare(b.token));
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
  machineProfileKey?: string;
  pressProfileKey?: string;
};

/**
 * НАМЕРЕНИЕ ЗАПИСИ, РАЗДЕЛЁННОЕ ПО ПРИРОДЕ ФАКТОВ, а не сваленное в одну карту:
 *
 * `writes` — ЛИЧНОСТЬ РАБОТЫ: глагол и машинка из каталога, класс шва отстрочки, метод крепления,
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
  if (targetMachine && !(current.machineProfileKey ?? '').trim()) {
    const fits = park.machines.filter(
      (m) => m.machineType === targetMachine && (m.profileKey ?? '').trim(),
    );
    if (fits.length === 1) links.machineProfileKey = (fits[0].profileKey ?? '').trim();
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
