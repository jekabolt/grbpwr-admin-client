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

export type BlockCode = {
  // Имя блока как в файле (нормализованное по пробелам вызывающим кодом).
  raw: string;
  // Имя без размерного хвоста — ЭТО и есть деталь кроя, одна на все размеры. Совпадает с raw,
  // если размер не опознан.
  identity: string;
  // Размерный хвост, как он написан в файле. '' — размера в имени нет.
  size: string;
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
const bareToken = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase();

export function splitBlockSize(
  block: string,
  // Достаточно членства: и Set, и Map подходят.
  sizeTokens: { has(token: string): boolean },
): BlockCode {
  const raw = block.trim();
  const parts = raw.split('_');
  // Одиночный токен размером быть не может: иначе блок с именем «M» превратился бы в деталь с
  // пустым именем.
  if (parts.length < 2) return { raw, identity: raw, size: '' };
  const last = parts[parts.length - 1];
  if (!sizeTokens.has(bareToken(last))) return { raw, identity: raw, size: '' };
  const identity = parts.slice(0, -1).join('_');
  // «_XS» (ведущее подчёркивание) оставило бы пустую идентичность: такой блок стал бы
  // безымянным и молча пропал бы из диалога, хотя до этого прекрасно сопоставлялся.
  if (!identity) return { raw, identity: raw, size: '' };
  return { raw, identity, size: last };
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
