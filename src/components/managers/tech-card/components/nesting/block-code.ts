// Разбор имени блока DXF: где кончается деталь и начинается размер.
//
// Градация приходит В ОДНОМ файле: один DXF несёт все размеры сразу, и имя блока кодирует и то,
// и другое. Формат, как он заведён у лекальщика:
//
//   PREFIX [_модификаторы] _РАЗМЕР
//   FP  — front piece      _R / _L — правая / левая
//   BP  — back piece       _F / _B — перед / спинка   (необязательно)
//   WS  — waist strap      _1/_2/… — номер части      (необязательно)
//   FL  — fly piece        _#      — основная         (необязательно)
//   PCK — pocket
//   SL  — sleeve
//
//   SL_R_B_1_#_XS → деталь SL_R_B_1_#, размер XS
//   SL_R_B_1_XS   → деталь SL_R_B_1,   размер XS
//   FP_L_L        → деталь FP_L (левая полочка), размер L
//   BP_M          → деталь BP,          размер M
//
// Размер — ВСЕГДА последний токен, и это единственное, что делает разбор однозначным: «L» значит
// и «left», и размер L, но левым он бывает только в середине. Отсюда и правило: отрезаем хвост,
// только если он опознан как размер.
//
// Опознаём НЕ по захардкоженному списку, а по размерному ряду самой карточки: тогда «L» в конце
// считается размером ровно тогда, когда у этого стиля есть размер L, а деталь, которая
// действительно называется «…_L» у стиля без такого размера, остаётся целой. Имя, не подходящее
// под формат, не трогаем вовсе — владелец просил, чтобы этой логике подвергался только он.

// Имя блока так, как его сравнивает БАЗА: обрезано по краям, внутренние пробелы схлопнуты.
// Регистр снимается отдельно (индекс UNIQUE регистронезависим), поэтому здесь только пробелы.
//
// Живёт ЗДЕСЬ, а не в диалоге сопоставления, потому что ключ у алиаса один на всех, кто его
// пишет и читает: диалог, который блоки сопоставляет, и запись маркера, которая по тому же
// ключу проставляет деталь кроя в блоб. Две копии этой нормализации — это два разных ключа,
// расходящихся на первом же имени с двойным пробелом.
export function normBlock(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

export type BlockCode = {
  // Имя блока как в файле (нормализованное по пробелам вызывающим кодом).
  raw: string;
  // Имя без размерного хвоста — ЭТО и есть деталь кроя, одна на все размеры. Совпадает с raw,
  // если размер не опознан.
  identity: string;
  // Размерный хвост, как он написан в файле. '' — размера в имени нет.
  size: string;
  // В имени стоит токен UNI — лекальщик ЗАЯВИЛ, что деталь не градуируется. Это не то же самое,
  // что «размера в имени не нашлось»: второе — молчание разбора, первое — утверждение автора.
  // Пока эти два состояния были одним, и карман, и криво выгруженный ряд одинаково падали в
  // группу '' — и отказать по одному значило отказать по обоим.
  uni: boolean;
  // Имя без токена UNI и без базового размера при нём — ключ, по которому uni-копии одной детали
  // узнают друг друга (PCK_L_UNI_M и PCK_L_UNI_S — одна и та же деталь, выгруженная дважды).
  // '' у не-uni. ИДЕНТИЧНОСТЬЮ НЕ ЯВЛЯЕТСЯ и ею стать не может: под identity лежат сохранённые
  // алиасы (UNIQUE по (card, scope, block)), и подмена ключа порвала бы связь деталь↔чертёж.
  uniBase: string;
};

// Названия размеров в словаре пишутся как «xs_44ta_m»: код, числовой эквивалент, система.
// В DXF лекальщик пишет либо код («XS»), либо число («44»), поэтому принимаем оба.
export function sizeTokensOf(dictionaryName: string | undefined): string[] {
  const name = (dictionaryName ?? '').trim().toLowerCase();
  if (!name) return [];
  const parts = name.split('_');
  const out: string[] = [];
  if (parts[0]) out.push(parts[0]);
  const digits = parts[1]?.match(/\d+/)?.[0];
  if (digits) out.push(digits);
  return out;
}

// Размерный хвост бывает в оформлении: реальный файл пишет базовый размер как «BP_<S>», в
// угловых скобках. Для СРАВНЕНИЯ оставляем только буквы и цифры; в имени детали и в подписи
// размер показываем так, как он написан в файле.
//
// Экспортируется, потому что «похож ли этот хвост на размер» спрашивает ещё и модалка
// сопоставления — там, где она проверяет, не назван ли блок алиаса в файле ДРУГИМ размером
// (находка 2: при одном размере в наборе вердикт о хвосте не выносится вовсе). Вторая копия
// этой нормализации разошлась бы с этой на первом же имени с оформлением.
export const bareToken = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();

const UNI = 'uni';

// ЛЕКАЛЬЩИК ЗАЯВИЛ, ЧТО ДЕТАЛЬ НЕ ГРАДУИРУЕТСЯ: отдельный `_`-токен UNI в имени блока.
//
// ОТДЕЛЬНЫЙ ТОКЕН, А НЕ ПОДСТРОКА, и это единственное, что делает признак безопасным: «UNIFORM»,
// «TUNIC», «UNION» несут те же три буквы подряд, и поиск подстрокой объявил бы неградуируемой
// половину обычного файла — то есть выкинул бы её из размерного ряда молча. Оформление снимается
// тем же bareToken, которым сравниваются размеры: реальный файл пишет пометки в скобках («<UNI>»),
// и признак обязан переживать это так же, как «BP_<S>» переживает базовый размер.
export function uniOf(name: string): boolean {
  return (name ?? '')
    .trim()
    .split('_')
    .some((t) => bareToken(t) === UNI);
}

// КЛЮЧ, ПО КОТОРОМУ UNI-КОПИИ ОДНОЙ ДЕТАЛИ УЗНАЮТ ДРУГ ДРУГА.
//
// Настоящий файл лекальщика метит деталь токеном, НЕ УБИРАЯ базовый размер: `PCK_L_UNI_M`. CLO,
// склеивающий по-размерные выгрузки в один DXF, честно приносит `PCK_L_UNI_M` и `PCK_L_UNI_S` —
// одну и ту же деталь, нарисованную дважды. Их надо узнать друг в друге (иначе настил выкроит
// карман дважды), но НЕЛЬЗЯ смешать с соседями: `FP_L` — это левая полочка, и съесть у неё «L»
// значит потерять правую.
//
// Отсюда правило, узкое намеренно: удаляются все токены UNI и — только если он стоял СРАЗУ ЗА
// последним из них и при этом сам последний в имени — размерный хвост при нём. Модификатор, не
// прилегающий к UNI, не трогается никогда: `PCK_L_UNI` → `PCK_L`, а не `PCK`.
//
// Пустой остаток (имя целиком состоит из пометки) возвращает сырое имя — тот же прецедент, что у
// пустой идентичности ниже: безымянный ключ склеил бы в одну деталь всё, что так названо.
export function uniBaseOf(name: string, isSizeToken: (token: string) => boolean): string {
  const raw = (name ?? '').trim();
  const parts = raw.split('_');
  const drop = new Set<number>();
  let lastUni = -1;
  for (let i = 0; i < parts.length; i++) {
    if (bareToken(parts[i]) === UNI) {
      drop.add(i);
      lastUni = i;
    }
  }
  if (lastUni < 0) return '';
  const tail = lastUni + 1;
  const tailBare = tail < parts.length ? bareToken(parts[tail]) : '';
  if (tail === parts.length - 1 && tailBare && isSizeToken(tailBare)) drop.add(tail);
  const base = parts.filter((_, i) => !drop.has(i)).join('_');
  return base || raw;
}

// ── ЧТО ЗНАЧИТ «ЭТИ ИМЕНА НАЗЫВАЮТ ОДНУ ДЕТАЛЬ» — ОДИН ВЕРДИКТ НА ВСЕ ПУТИ ────────────────────
//
// Вопрос про uniBase задают ТРИ независимых расчёта, и каждый отвечает на него своим действием:
//
//   • настил (piece-selection.dedupeUniPieces)  — кроит одну копию, остальные исключает;
//   • норма по выкройкам (dxf-consumption)      — отказывает: складываются ЗАЯВЛЕННЫЕ детали
//                                                 карточки, и выбрать за оператора нечем;
//   • продолжение снятой раскладки (size-areas) — отказывает: блоб хранит замер, а не гипотезу.
//
// РАЗНЫЕ ОТВЕТЫ, НО ОДИН ВОПРОС, и жить он обязан здесь, рядом с uniOf/uniBaseOf. Три копии
// «группируем по uniBase, ловим столкновение с градуированной идентичностью» разошлись бы на
// первой же правке — и разошлись бы МОЛЧА, потому что каждая проверка по отдельности выглядит
// исправной: настил выкроил бы одну деталь, а норма посчитала бы две, и разницу видно только на
// складе.
//
// Ключ группы — `normBlock(uniBase).toLowerCase()`: тот же вид ключа, которым сравнивает имена
// база (нормализация пробелов + регистронезависимый UNIQUE на алиасах).

/** Столкновение вокруг заявления «эта деталь не градуируется». */
export type UniConflict = {
  kind: 'area' | 'duplicate' | 'graded-vs-uni' | 'declared-vs-graded';
  /** О чём спор: uniBase группы либо имя детали кроя — то, что оператор увидит первым. */
  subject: string;
  /** Имена блоков, которые спорят: отказ обязан называть виновника, а не «где-то в файле». */
  blocks: string[];
};

/** Имена блоков, ЗАЯВЛЕННЫЕ одной и той же неградуируемой деталью. */
export type UniGroup = {
  /** uniBase в написании файла. */
  uniBase: string;
  /** РАЗНЫЕ сырые имена блоков этой группы, по возрастанию (детерминизм отказа и победителя). */
  blocks: string[];
};

/**
 * Группы uni-имён по общему uniBase.
 *
 * uniBase приходит СНАРУЖИ, уже посчитанный: у каждого пути свой единственный источник разбора
 * (у настила и нормы — `BlockCode` из `splitPiecesBySize`, у блоба — `uniBaseOf` с предикатом
 * размера этого же расчёта). Считать его здесь заново значило бы завести второй разбор имени,
 * который однажды ответит иначе, чем тот, по которому уже разложили детали.
 *
 * ГРУППА КЛЮЧУЕТСЯ РАЗНЫМИ СЫРЫМИ ИМЕНАМИ, а не числом записей, и это осознанно. Одно и то же имя,
 * встреченное дважды, — законный вход на каждом из трёх путей и означает разное: два контура
 * одного блока (две ревизии листа — их разбирает выбор контура на слое), две строки блоба (настил
 * реально положил деталь дважды). А вот ДВА РАЗНЫХ имени с одним uniBase бывают ровно от одной
 * причины — по-размерной выгрузки CLO, склеенной в один файл, — и означают одну деталь.
 */
export function uniGroupsOf(
  entries: Iterable<{ raw: string; uniBase: string }>,
): Map<string, UniGroup> {
  const out = new Map<string, UniGroup>();
  for (const e of entries) {
    const base = normBlock(e.uniBase ?? '');
    const raw = normBlock(e.raw ?? '');
    if (!base || !raw) continue;
    const key = base.toLowerCase();
    const g = out.get(key) ?? { uniBase: base, blocks: [] };
    const ci = raw.toLowerCase();
    if (!g.blocks.some((b) => b.toLowerCase() === ci)) g.blocks.push(raw);
    out.set(key, g);
  }
  for (const g of out.values()) g.blocks.sort();
  return out;
}

/**
 * Группы, где одна деталь названа НЕСКОЛЬКИМИ именами.
 *
 * Для настила это не конфликт, а работа (одну копию кроим, прочие исключаем), поэтому он этой
 * функцией не пользуется. Для тех, кто СКЛАДЫВАЕТ (норма по выкройкам, продолжение раскладки),
 * каждое имя — отдельное слагаемое, и два слагаемых на одну деталь дают ровно двойную ткань.
 */
export function uniDuplicateConflicts(groups: ReadonlyMap<string, UniGroup>): UniConflict[] {
  const out: UniConflict[] = [];
  for (const g of groups.values()) {
    if (g.blocks.length >= 2) out.push({ kind: 'duplicate', subject: g.uniBase, blocks: g.blocks });
  }
  return out.sort((a, b) => a.subject.localeCompare(b.subject));
}

/**
 * Группы, чей uniBase совпал с идентичностью, получившей РАЗМЕРНЫЙ вердикт в том же расчёте.
 *
 * Решение владельца: «градуированная копия + uni» — ошибка, а не выбор. Деталь либо градуируется,
 * либо нет; вход, утверждающий оба, не даёт способа узнать, какое из двух утверждений правда, а
 * разница между ними — целая деталь в площади каждого размера.
 *
 * `gradedIdentities` — уже в нижнем регистре и нормализованные: чей это скоуп и что считать
 * градуированным, знает вызывающий (настил смотрит на все контуры скоупа, норма — на слагаемые
 * своей суммы, блоб — на свои сохранённые строки).
 */
export function uniGradedConflicts(
  groups: ReadonlyMap<string, UniGroup>,
  gradedIdentities: ReadonlySet<string>,
): UniConflict[] {
  const out: UniConflict[] = [];
  for (const [key, g] of groups) {
    if (gradedIdentities.has(key)) {
      out.push({ kind: 'graded-vs-uni', subject: g.uniBase, blocks: g.blocks });
    }
  }
  return out.sort((a, b) => a.subject.localeCompare(b.subject));
}

/**
 * ОТКАЗ ОДНИМИ СЛОВАМИ на всех путях: настил в модалке, очередь раскроя партии, норма «по
 * выкройкам», продолжение снятой раскладки.
 *
 * Один и тот же файл ломает их все сразу, и чинится он одним действием в одном месте. Четыре
 * формулировки читались бы как четыре разные беды — оператор пошёл бы чинить их по очереди.
 */
export function uniConflictReason(conflicts: readonly UniConflict[]): string {
  return conflicts.map(sentenceOf).join('; ');
}

function sentenceOf(c: UniConflict): string {
  const blocks = c.blocks.join('”, “');
  switch (c.kind) {
    case 'area':
      return `pieces “${blocks}” are marked as one and the same ungraded piece (${c.subject}), yet they are drawn differently — by number of contours or by area. nothing here can say which copy is the norm: leave one of them in the patterns, or take the UNI mark off the one that differs`;
    case 'duplicate':
      return `piece “${c.subject}” arrived in the patterns as several copies (“${blocks}”) — that is a per-size export merged into one file, and every copy would count as a separate piece, which means twice the fabric. leave one copy in the patterns and one cut piece for it`;
    case 'graded-vs-uni':
      return `piece “${c.subject}” is in the patterns both with a size range and with a UNI mark (“${blocks}”) — these two statements contradict each other: either the piece is graded or it isn't. remove the extra blocks from the patterns`;
    case 'declared-vs-graded':
      return `piece “${c.subject}” has the “not graded” box ticked, but in the patterns it has a size range (“${blocks}”) — the server won't accept per-size areas for a marked piece and will reject the whole measurement. untick the box if the piece is graded after all, or leave one contour for all sizes in the patterns`;
  }
}

export function splitBlockSize(
  block: string,
  // Достаточно членства: и Set, и Map подходят.
  sizeTokens: { has(token: string): boolean },
): BlockCode {
  const raw = block.trim();
  // ЗАЯВЛЕНИЕ АВТОРА БЬЁТ ФОРМУ ИМЕНИ, поэтому проверка стоит ПЕРВОЙ. У `PCK_L_UNI_M` последний
  // токен — настоящий размерный хвост, и обычная ветка ниже отрезала бы его, оставив деталь
  // размера M. Но автор сказал, что деталь одна на весь ряд: размер здесь — базовый, на котором
  // её нарисовали, а не размер, для которого она кроится.
  if (uniOf(raw)) {
    return {
      raw,
      // Идентичность — сырое имя ЦЕЛИКОМ: под ней лежат сохранённые алиасы (см. BlockCode.uniBase).
      identity: raw,
      size: '',
      uni: true,
      uniBase: uniBaseOf(raw, (t) => sizeTokens.has(t)),
    };
  }
  const parts = raw.split('_');
  // Одиночный токен размером быть не может: иначе блок с именем «M» превратился бы в деталь с
  // пустым именем.
  if (parts.length < 2) return { raw, identity: raw, size: '', uni: false, uniBase: '' };
  const last = parts[parts.length - 1];
  if (!sizeTokens.has(bareToken(last)))
    return { raw, identity: raw, size: '', uni: false, uniBase: '' };
  const identity = parts.slice(0, -1).join('_');
  // «_XS» (ведущее подчёркивание) оставило бы пустую идентичность: такой блок стал бы
  // безымянным и молча пропал бы из диалога, хотя до этого прекрасно сопоставлялся.
  if (!identity) return { raw, identity: raw, size: '', uni: false, uniBase: '' };
  return { raw, identity, size: last, uni: false, uniBase: '' };
}

// Место размера в градации — по очищенному токену, чтобы «<S>» и «S» были одним размером.
export function sizeRank(size: string, sizeTokens: ReadonlyMap<string, number>): number {
  if (!size) return Number.MAX_SAFE_INTEGER;
  return sizeTokens.get(bareToken(size)) ?? 1e6;
}

// Размерные токены, выведенные ИЗ САМОГО ФАЙЛА.
//
// Опираться только на размерный ряд карточки нельзя: у карточки в ряду могут стоять M и L, а в
// файле лежать XS, S, M, L, XL — и тогда BP_S, BP_XS, BP_XL размерами не считаются и становятся
// отдельными деталями кроя вместо одной BP. Владелец прав: виды деталей обязаны доставаться из
// файла без всякой оглядки на карточку.
//
// Но и резать всё подряд нельзя: «FP_L» — это ЛЕВАЯ полочка. Разделяет их структура файла.
// Размер — это то, что МЕНЯЕТСЯ у одной и той же основы имени и повторяется у МНОГИХ основ:
// BP_{XS,S,M,L,XL}, FP_L_{XS,S,M,L,XL}, SL_R_{XS,S,M,L,XL} — пять токенов, каждый у девяти
// основ. Модификатор так себя не ведёт: «R» в паре FP_L/FP_R встретится у одной-двух основ.
// Вердикт по КАЖДОМУ блоку: имя блока → размерный хвост, как он написан. Блока в карте нет —
// значит хвост у него отрезать нельзя.
//
// Решение принимается по ОСНОВЕ имени, а не по токену вообще, и это принципиально. Правило «то,
// что меняется у одной основы» само по себе слишком слабо: набор FP_L, FP_R, SL_L, SL_R,
// PCK_L, PCK_R даёт токены «l» и «r», меняющиеся у трёх основ, — и левая полочка слилась бы с
// правой в одну деталь кроя. Поэтому добавлены два условия:
//
//   1. хвост обязан быть РАЗМЕРОМ ИЗ СЛОВАРЯ. «r» размером не бывает нигде, и пара {l,r}
//      рассыпается: у основы остаётся один размерный хвост, то есть никакой градации;
//   2. градуированной считается ОСНОВА, у которой таких хвостов не меньше двух. В файле, где
//      настоящая градация соседствует с голой парой FP_L/FP_R, основа «FP» условию не отвечает,
//      и обе полочки остаются целыми, пока BP_XS…BP_XL спокойно схлопываются.
export function deriveBlockSizes(
  blockNames: Iterable<string>,
  isSizeToken: (token: string) => boolean,
): Map<string, string> {
  type Info = { stem: string; bare: string; raw: string };
  const infoByBlock = new Map<string, Info>();
  const tailsByStem = new Map<string, Set<string>>();
  for (const rawName of blockNames) {
    const name = (rawName ?? '').trim();
    if (!name || infoByBlock.has(name)) continue;
    // UNI-БЛОК В ВЫВОДЕ ГРАДАЦИИ НЕ УЧАСТВУЕТ НИ ОДНОЙ СТОРОНОЙ — ни основой, ни хвостом, ни
    // вердиктом. Пропуск живёт ЗДЕСЬ, а не у потребителей, и это существенно: у deriveBlockSizes
    // три независимых входа (splitPiecesBySize, копия codeOf в size-areas-from-dxf, прямой вызов
    // из missingSizesIn), и правило, дописанное в одном из них, разошлось бы с двумя другими —
    // то есть один и тот же файл резался бы на идентичности по-разному в трёх местах.
    //
    // Не просто «не получает вердикта»: uni-хвост, попавший в частотную карту, повышал бы порог
    // `need` и мог бы выбить из размерного ряда настоящий редкий размер соседей.
    if (uniOf(name)) continue;
    const parts = name.split('_');
    if (parts.length < 2) continue;
    const stem = parts.slice(0, -1).join('_');
    const raw = parts[parts.length - 1];
    const bare = bareToken(raw);
    if (!stem || !bare) continue;
    infoByBlock.set(name, { stem, bare, raw });
    const set = tailsByStem.get(stem) ?? new Set<string>();
    set.add(bare);
    tailsByStem.set(stem, set);
  }

  const graded = new Set<string>(); // основы с настоящей градацией
  const freq = new Map<string, number>(); // размерный токен → у скольких таких основ встретился
  for (const [stem, tails] of tailsByStem) {
    const sizeTails = [...tails].filter(isSizeToken);
    if (sizeTails.length < 2) continue;
    graded.add(stem);
    for (const t of sizeTails) freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  if (freq.size === 0) return new Map();
  // Токен, встречающийся заметно реже самого частого, к размерному ряду не относится.
  const max = Math.max(...freq.values());
  const need = Math.max(2, max / 2);
  const sizeSet = new Set([...freq].filter(([, n]) => n >= need).map(([t]) => t));

  const out = new Map<string, string>();
  for (const [block, info] of infoByBlock) {
    if (!graded.has(info.stem) || !sizeSet.has(info.bare)) continue;
    out.set(block, info.raw);
  }
  return out;
}
