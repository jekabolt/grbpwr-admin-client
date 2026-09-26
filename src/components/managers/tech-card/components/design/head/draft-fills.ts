import {
  bomLineSnapshot,
  normText,
  type FormSnapshot,
  type ProposalRow,
} from './construction-draft-model';

/**
 * ЖУРНАЛ ЗАПОЛНЕНИЙ — ЗАКОН «САМО ЗАПОЛНЯЕТ, НО НИКОГДА НЕ ЗАТИРАЕТ» (B-14 круга 20).
 *
 * Владелец, дословно: «после того как мы draft the construction нажали оно должно само все
 * заполнять и подсвечивать что заполнило и если мы захотим то удалим».
 *
 * Файл ЧИСТЫЙ нарочно — ни `react`, ни `react-hook-form`, ни писателей формы. Стенд
 * `tmp/dsgprobe/b1325/` собирает ЭТИ функции, а не их пересказ, поэтому мутация, снявшая гейт
 * ниже, краснеет по-настоящему.
 *
 * ═══ ПОЧЕМУ КЛИКОВ БОЛЬШЕ НЕТ, А ЗАЩИТА ОСТАЛАСЬ ════════════════════════════════════════════
 *
 * Прежний орган защищал карточку тем, что КАЖДАЯ запись была кликом. Владелец кликов не хочет.
 * Но дефект, от которого клики стерегли (`techcard-draft-restore-wipes-absent-fields`), назывался
 * не «запись без клика» — он назывался «ОБЪЕКТ МОДЕЛИ, ставший значением формы». Клик тут не
 * причём вовсе. Поэтому уходят клики, а три несущих свойства остаются нетронутыми:
 *   1. пишут те же ПЯТЬ писателей, что писали руками, и ни один из них не принимает массив;
 *   2. цикл идёт по СТРОКАМ ПРЕДЛОЖЕНИЯ, а строка рождается только у названного моделью
 *      значения — молчание модели по-прежнему физически не выразимо как запись;
 *   3. КАЖДАЯ ЗАПИСЬ ОБРАТИМА: журнал держит `before` — ДОСЛОВНО, с переносами строк, — и `✕` /
 *      `undo all` возвращают ровно его.
 *
 * ═══ ФИКСАП ВОЛНЫ 25.09 (ревью Codex M1, O-09 «всё сгенерированное сохраняется само») ═════════
 *
 * Прежде третьим свойством стояло «вручную написанное не перезаписывается»: само заполнялось
 * только ПУСТОЕ, а замена слов человека оставалась строкой «TO DECIDE». Владелец сказал иначе —
 * всё, что сгенерировано, пишется и сохраняется, — и журнал к этому был готов: `before` у него
 * есть всегда (`autoFillPlan`). Решением остаётся ОДНО: поле, которое человек поправил ПОСЛЕ
 * нажатия GENERATE, пока ответ летел, — его свежие слова машина не затирает, они ждут в «TO DECIDE».
 */

/* ─── АДРЕС ЗАПОЛНЕНИЯ ─────────────────────────────────────────────────────────────────────── */

/**
 * КУДА БЫЛО НАПИСАНО. Скаляр адресуется своим полем, строка спецификации — СВОИМ КЛЮЧОМ
 * (`lineKey`), а не именем и не позицией: имя человек переименовывает, позиция уезжает на соседа
 * при удалении строки выше (тот же довод, по которому личность строки предложения выведена из
 * содержимого, а не из индекса).
 */
export type FillTarget =
  | { kind: 'detail'; key: string }
  | { kind: 'fit' }
  | { kind: 'concept' }
  | { kind: 'slot'; lineKey: string }
  /**
   * ЗАВЕДЁННАЯ ДЕТАЛЬ ФЛЭТ-ВЕРСТАКА (r3 п.6) — АДРЕС НА СЕРВЕРЕ, А НЕ В ФОРМЕ.
   *
   * Пятая цель журнала и единственная, чей адресат — не поле тех-карты. Она здесь ровно по той же
   * причине, по которой здесь четыре остальных: владелец сказал «и если мы захотим то удалим», а
   * удалить можно только то, про что записано, ЧТО именно завели. `slotId` минтит сервер
   * (`createDetailSlot`, ключ — uuid), поэтому адрес берётся ИЗ ОТВЕТА, а не выдумывается: имя
   * адресом быть не может — две детали, названные человеком одинаково, законно остаются двумя
   * слотами, и имя одной из них указывало бы на обе.
   */
  | { kind: 'detailSlot'; slotId: number };

/** ЧТО СТОЯЛО И ЧТО СТАЛО — одна запись журнала. `before` — это вся возможность отката. */
export type Fill = {
  id: string;
  target: FillTarget;
  /** Подпись поля-адресата словами человека: `silhouette`, `collar / neckline`. */
  label: string;
  /** ЧТО СТОЯЛО ДО ЧЕРНОВИКА. Пустая строка — законное «не стояло ничего». */
  before: string;
  /** ЧТО НАПИСАЛ ЧЕРНОВИК. Он же — мера живости записи (см. `isLive`). */
  after: string;
  /** Когда, `HH:MM`. Только для глаз. */
  at: string;
  /**
   * СЛЕПОК ЗАПИСАННОЙ СТРОКИ СПЕЦИФИКАЦИИ (`bomLineSnapshot`) — только у записей рода `slot`.
   * Живость строки меряется им, а не одним её существованием (фиксап M2): правка любой из её
   * ячеек — это уже слова человека. Нет слепка (запись до фиксапа) — мера прежняя, по ключу.
   */
  snapshot?: string;
  /**
   * ═══ ПРОСМОТРЕНО ЧЕЛОВЕКОМ (волна 25.09, D-07' / ревью Codex B-09) ═══════════════════════════
   *
   * Пометка «drafted» на поле — это НЕ второй стор рядом с журналом, а ЭТОТ ЖЕ журнал с одним
   * флагом: запись живая (`isLive`) и не `accepted` — поле подсвечено синим. `accept all N ▸` и
   * правка поля ставят флаг, но НЕ стирают запись: значения уже сохранены автосейвом, «принять» =
   * «я это видел», и `undo all` по-прежнему обязан уметь вернуть `before` (иначе кнопка принятия
   * отбирала бы откат — ровно то, от чего предостерегал B-09).
   *
   * Отсутствие поля = `false`: записи, сделанные до волны, и записи НОВОГО прогона по тому же
   * адресу (`mergeFill` берёт `next` целиком, кроме `before`) снова ждут взгляда человека.
   */
  accepted?: boolean;
  /**
   * ЗАПИСЬ — ЖЕСТ ЧЕЛОВЕКА «restore previous ↶», А НЕ СЛОВО ЧЕРНОВИКА (фиксап раунда 2, BLK-1).
   * `after` — его прежние слова, `before` — то, что стояло до возврата (правленый им черновик), и
   * `✕` возвращает это. `undo all` её не трогает: она не отменяет черновик, она его уже отменила.
   */
  restore?: true;
  /**
   * ЗАПИСЬ, КОТОРУЮ ВОЗВРАТ ЗАМЕНИЛ, — только у `restore` (`restoreFill`). `✕` возврата ставит её
   * на место (`unrestoredFill`): после отмены возврата журнал ровно тот, что был до него, и
   * `restore previous ↶` снова на экране. Без неё отмена возврата стёрла бы прежние слова второй
   * раз — тем самым путём, который возврат и закрывает.
   *
   * С раунда 3 (M-A) здесь ВСЯ заменённая запись (`Prior`): возврат может вернуть и НЕСЁННЫЕ
   * слова, и слова, которые нёс другой возврат, — тогда её `before` не равен `after` возврата, а
   * сама она бывает возвратом со своим `prior`. У записи раунда 2 есть только `after` и `at`: её
   * возврат возвращал ровно `before` заменённой записи, то есть свой `after`.
   */
  prior?: Prior;
  /**
   * ═══ НЕСЁННЫЕ СЛОВА ЧЕЛОВЕКА (раунд 3, M-A) ═══════════════════════════════════════════════════
   *
   * Адрес держит ОДНУ запись, и новая запись по нему заменяет прежнюю. Прежняя держала слова
   * человека («H» в её `before`), а новая пишет уже поверх ПРАВЛЕНОГО черновика «D2» — `before` у неё
   * «D2», и без этого поля «H» не оставалось бы нигде: ни в поле, ни в журнале. Так слова терялись
   * через TO DECIDE (`take` поверх правки) и через второй GENERATE поверх правки.
   *
   * Поэтому запись, заменившая другую НЕ слиянием (`mergeFill`), несёт её слова дальше ступенями:
   * каждая ступень — слова, стоявшие до одной из записей черновика, и то, что он на них написал;
   * новейшая первой. `✕` записи ставит в журнал верхнюю ступень — запись, какой она была до замены
   * (`poppedFill`), а WRITTEN предлагает вернуть каждую, чьих слов нет в поле (`offersOf`).
   */
  carried?: Words[];
};

/** Ступень несённых слов: `before` — слова человека, `after` — что черновик написал поверх них. */
export type Words = { before: string; after: string; at: string };

/**
 * ЗАМЕНЁННАЯ ВОЗВРАТОМ ЗАПИСЬ — без адреса (он тот же). `✕` возврата ставит её ровно такой, какой
 * она была (`unrestoredFill`), включая возврат, заменённый возвратом: иначе запись «возврат H поверх
 * D» встала бы записью черновика «D → H», и её `✕` написал бы в поле черновик поверх слов человека.
 */
export type Prior = {
  before?: string;
  after: string;
  at: string;
  carried?: Words[];
  restore?: true;
  prior?: Prior;
  /**
   * Была ли заменённая запись просмотрена. `✕` возврата ставит её такой, какой она была: живая
   * непросмотренная запись встаёт с рамкой «drafted» (ревью раунда 3, нит). У звеньев до раунда 4
   * поля нет — они встают принятыми, как их и ставили.
   */
  accepted?: boolean;
};

/**
 * Глубина цепочки «возврат поверх возврата». Каждое звено — явный жест человека; сверх потолка
 * самое старое звено отпускается: `✕` дойдёт до него и дальше просто забудет запись.
 */
const MAX_PRIOR_DEPTH = 6;

/** Запись без адреса — звено цепочки возвратов, не длиннее потолка. */
function priorOf(f: Fill): Prior {
  return capPrior(
    {
      before: f.before,
      after: f.after,
      at: f.at,
      ...(f.carried?.length ? { carried: f.carried } : {}),
      ...(f.restore ? { restore: true as const } : {}),
      ...(f.prior ? { prior: f.prior } : {}),
      accepted: !!f.accepted,
    },
    1,
  );
}

function capPrior(p: Prior, depth: number): Prior {
  if (!p.prior) return p;
  const out: Prior = { ...p };
  if (depth >= MAX_PRIOR_DEPTH) delete out.prior;
  else out.prior = capPrior(p.prior, depth + 1);
  return out;
}

export function fillIdOf(target: FillTarget): string {
  switch (target.kind) {
    case 'detail':
      return `detail:${target.key}`;
    case 'fit':
      return 'fit';
    case 'concept':
      return 'concept';
    case 'slot':
      return `slot:${target.lineKey}`;
    case 'detailSlot':
      return `detailSlot:${target.slotId}`;
  }
}

/**
 * АДРЕС СТРОКИ ПРЕДЛОЖЕНИЯ — до записи. Строка спецификации адреса ЕЩЁ НЕ ИМЕЕТ: её `lineKey`
 * минтится конструктором `bornBomLine` в момент рождения, и до него адресовать нечего. Поэтому
 * `null`, а не выдуманный ключ: выдуманный совпал бы с чужим ровно один раз и молча.
 */
export function targetOfRow(row: ProposalRow): FillTarget | null {
  const w = row.write;
  if (w.kind === 'detail') return { kind: 'detail', key: w.key };
  if (w.kind === 'fit') return { kind: 'fit' };
  if (w.kind === 'concept') return { kind: 'concept' };
  return null;
}

/** Что стоит на карточке по этому адресу СЕЙЧАС. Строка спецификации — не скаляр, у неё `''`. */
export function currentOf(target: FillTarget, form: FormSnapshot): string {
  switch (target.kind) {
    case 'detail':
      return normText((form.details ?? []).find((d) => d.key === target.key)?.text);
    case 'fit':
      return normText(form.fit);
    case 'concept':
      return normText(form.concept);
    case 'slot':
      return '';
    // Слот верстака — ВЕЩЬ, а не текст, ровно как строка спецификации: скалярного «что стоит по
    // этому адресу» у него нет, и живость его меряет `isLive` своей веткой.
    case 'detailSlot':
      return '';
  }
}

/**
 * ЖИВОСТЬ — ЭТО СРАВНЕНИЕ, А НЕ ФЛАГ, И РАЗНИЦА ЗДЕСЬ НЕСУЩАЯ.
 *
 * Флаг «это поле заполнено черновиком» пережил бы правку человека: он дописал бы к предложенному
 * тексту свои две строки, а `✕` рядом по-прежнему обещал бы «верну как было» — и снёс бы вместе
 * с машинным ЕГО СЛОВА. Сравнение такого обещания дать не может: как только значение разошлось с
 * `after`, запись ДРЕМЛЕТ — ни подсветки, ни отката, потому что текст больше не машинный.
 *
 * У строки спецификации мера та же, только слепок шире одного текста (фиксап M2): строка жива,
 * пока она стоит по своему ключу (`lineKey`) И её ячейки равны тому, что записал черновик
 * (`snapshot`). Правка имени, состава, расхода, назначения — слова человека; удаление — тоже.
 */
export function isLive(fill: Fill, form: FormSnapshot): boolean {
  if (fill.target.kind === 'slot') {
    const key = fill.target.lineKey;
    const line = (form.bomItems ?? []).find((b) => b.lineKey === key);
    if (!line) return false;
    return fill.snapshot === undefined || bomLineSnapshot(line) === fill.snapshot;
  }
  /**
   * ⚠ У СЛОТА ВЕРСТАКА МЕРА ТА ЖЕ, ЧТО У СТРОКИ СПЕЦИФИКАЦИИ (вещь, а не текст), НО ИСТОЧНИК —
   * ПОЛОСА, А НЕ ФОРМА, И ОТСУТСТВИЕ ИСТОЧНИКА ЧИТАЕТСЯ КАК «ЕЩЁ ЖИВ».
   *
   * `detailSlots === undefined` значит «верстак не прочитан» (полосы нет, сервер её не отдаёт,
   * ответ ещё в полёте), и на этом ответе запись обязана ОСТАТЬСЯ: пустой массив по умолчанию
   * означал бы «слотов нет», журнал погасил бы свою же строку и человек лишился бы `✕` на слот,
   * который стоит. Пустой массив, ПРИШЕДШИЙ ЯВНО, — это уже утверждение, и оно честно гасит.
   */
  if (fill.target.kind === 'detailSlot') {
    // Идентификатор снимается ДО замыкания: сужение по `fill.target.kind` внутрь колбэка не
    // доезжает (это свойство, а не переменная), и `some` читал бы союз целиком.
    const slotId = fill.target.slotId;
    const slots = form.detailSlots;
    if (!slots) return true;
    const slot = slots.find((s) => (s.id ?? 0) === slotId);
    // Слот жив, пока он стоит ПУСТЫМ и под тем именем, которым его завели (фиксап M2): картинка в
    // нём — ответ человека или прогона (бенч прячет пометку), новое имя — слово человека.
    // `mintedAs` при этом не теряется: дедуп читает ВЕСЬ журнал, а не только живые записи.
    return !!slot && !slot.filled && normText(slot.name) === normText(fill.after);
  }
  return currentOf(fill.target, form) === normText(fill.after);
}

/** Живые записи журнала, новейшая первой — порядок отката «undo all». */
export function liveFills(fills: Fill[], form: FormSnapshot): Fill[] {
  return fills.filter((f) => isLive(f, form));
}

/**
 * ПОДСВЕЧЕННЫЕ — живые и ещё не просмотренные. Ровно этот список считает `accept all N ▸`, и
 * ровно его рисуют синие рамки полей: число на кнопке и число рамок на экране не могут разойтись,
 * потому что второго вычисления нет.
 */
export function draftedFills(fills: Fill[], form: FormSnapshot): Fill[] {
  return fills.filter((f) => !f.accepted && isLive(f, form));
}

/**
 * КЛЮЧ ПРЕЗЕНТАЦИИ → АДРЕС ЖУРНАЛА. Органы спрашивают контракт `drafted-contract.ts` ключами
 * `concept` · `fit` · `details.<key>` · `bom.<lineKey>`; журнал адресует записи `fillIdOf`. Перевод
 * написан ЗДЕСЬ, рядом с `fillIdOf`, потому что расходиться им нельзя: ключ, который не
 * переводится, молча не подсвечивает ничего. Файл остаётся чистым — префиксы повторены строками,
 * а не импортом контракта (тот тянет `react`).
 */
export function fillIdOfDraftedKey(key: string): string {
  if (key.startsWith('details.'))
    return fillIdOf({ kind: 'detail', key: key.slice('details.'.length) });
  if (key.startsWith('bom.')) return fillIdOf({ kind: 'slot', lineKey: key.slice('bom.'.length) });
  if (key === 'fit') return fillIdOf({ kind: 'fit' });
  if (key === 'concept') return fillIdOf({ kind: 'concept' });
  return key;
}

/** Адрес журнала для заведённого слота верстака — им спрашивает `slotProposed(slotId)`. */
export function fillIdOfSlot(slotId: number): string {
  return fillIdOf({ kind: 'detailSlot', slotId });
}

/**
 * СВОИ СЛОВА ЗАПИСИ (фиксап раунда 2, BLK-1): скаляр, у которого до черновика стоял текст. С фиксапа
 * M1 черновик переписывает и написанное рукой, и тогда `before` — место, где эти слова ещё живут: на
 * карточке уже черновик (или правленый черновик), автосейв его сохранил.
 *
 * Возврат (`restore`) своих слов не держит: его `before` — черновик, который человек сам отставил.
 */
function ownWords(f: Fill): boolean {
  const t = f.target.kind;
  return (
    !f.restore && (t === 'detail' || t === 'fit' || t === 'concept') && normText(f.before) !== ''
  );
}

/**
 * ЗАПИСЬ ДЕРЖИТ СЛОВА ЧЕЛОВЕКА — свои (`before`) или несённые (`carried`, раунд 3, M-A). Такую
 * запись нельзя ни выбросить уходом из поля (`acceptPlan`), ни отрезать потолком хранилища
 * (`storedSlice`): она — единственное место, где эти слова ещё есть.
 */
export function holdsWords(f: Fill): boolean {
  return ownWords(f) || (f.carried?.length ?? 0) > 0;
}

/** Ступени слов записи, новейшая первой: свои (если это слова) и несённые. */
function levelsOf(f: Fill): Words[] {
  const own = ownWords(f) ? [{ before: f.before, after: f.after, at: f.at }] : [];
  return [...own, ...(f.carried ?? [])];
}

/**
 * Потолок несённых ступеней. Ступень рождается только правкой человека поверх черновика и новой
 * записью поверх правки, так что до потолка доходит разве что долгий спор с черновиком по одному
 * полю. Сверх потолка выпадают СРЕДНИЕ ступени: новейшие остаются, и самая старая — слова, стоявшие
 * до первого черновика, — тоже.
 */
const MAX_CARRIED = 8;

/**
 * ЗАПИСЬ С НЕСЁННЫМИ СТУПЕНЯМИ. Пустых слов и повторов нет: одинаковые слова — одна строка возврата.
 * Слов, которые запись держит сама, среди несённых тоже нет: их вернёт её `✕` или её собственная
 * строка возврата. Нечего нести — поля нет вовсе.
 */
function withCarried(f: Fill, levels: readonly Words[]): Fill {
  const seen = new Set<string>(ownWords(f) ? [normText(f.before)] : []);
  const kept = levels.filter((w) => {
    const k = normText(w.before);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const out: Fill = { ...f };
  delete out.carried;
  if (!kept.length) return out;
  out.carried =
    kept.length > MAX_CARRIED ? [...kept.slice(0, MAX_CARRIED - 1), kept[kept.length - 1]] : kept;
  return out;
}

/**
 * ОДНО ПРЕДЛОЖЕНИЕ «restore previous ↶» — слова человека по одному адресу, дословно. `from` —
 * откуда они в записи: `own` — её `before`, число — индекс в `carried`.
 */
export type WordsOffer = { fill: Fill; words: string; from: 'own' | number };

/**
 * ЧТО МОЖНО ВЕРНУТЬ ПО ОДНОЙ ЗАПИСИ — слова человека, которых в поле нет (фиксап раунда 2, BLK-1;
 * раунд 3, M-A). Свои слова записи предлагаются, только когда она не живая: живой их возвращает её
 * `✕`, а откат поверх правки стёр бы и правку. Несённые — всегда, пока их нет в поле: `✕` записи
 * их не возвращает, он лишь ставит их ступень обратно в журнал. Одинаковые слова — одна строка.
 */
export function offersOf(f: Fill, form: FormSnapshot): WordsOffer[] {
  const t = f.target.kind;
  if (t !== 'detail' && t !== 'fit' && t !== 'concept') return [];
  const seen = new Set<string>([currentOf(f.target, form)]);
  // ЖИВОЙ ВОЗВРАТ САМ ОТДАЁТ ТО, ЧТО СМЕСТИЛ, — своим `✕` (`unrestoredFill`), вместе с прежней
  // записью журнала. Та же ступень второй дверью рядом («restore previous ↶» тех же слов) была бы
  // двумя кнопками про одно; предлагается она, когда `✕` уже нет — возврат поправили (раунд 3, MIN-1).
  if (f.restore && isLive(f, form)) seen.add(normText(f.before));
  const out: WordsOffer[] = [];
  const offer = (w: Words, from: WordsOffer['from']) => {
    const k = normText(w.before);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push({ fill: f, words: w.before, from });
  };
  if (ownWords(f) && !isLive(f, form)) offer(f, 'own');
  (f.carried ?? []).forEach((w, i) => offer(w, i));
  return out;
}

/**
 * ПРИНЯТИЕ ОДНОЙ ЗАПИСИ ПО ЖИВОЙ ФОРМЕ. Живая запись получает флаг `accepted` (откат остаётся);
 * НЕ живая — это уже слова человека (он поправил поле или удалил строку), и держать её незачем:
 * `undo` её всё равно не коснётся, а localStorage копил бы мусор. Два исключения — записи, которые
 * только помечаются и никогда не выбрасываются отсюда:
 *   · слот верстака: его запись несёт имя минта (`mintedAs`), по которому переименованный слот
 *     узнаётся;
 *   · запись со словами человека (фиксап раунда 2, BLK-1; раунд 3, M-A): человек написал «H»,
 *     черновик переписал его на «D», человек поправил «D». Выбросив запись на уходе из поля, мы
 *     стёрли бы «H» навсегда — на карточке его уже нет. Она остаётся, принятой, и WRITTEN
 *     предлагает `restore previous ↶` (`offersOf`). Выбрасывается, только когда ни одних её слов
 *     не осталось вне поля: беречь больше нечего.
 */
export function acceptPlan(
  fills: Fill[],
  ids: ReadonlySet<string>,
  form: FormSnapshot,
): { accept: string[]; drop: string[] } {
  const accept: string[] = [];
  const drop: string[] = [];
  for (const f of fills) {
    if (!ids.has(f.id)) continue;
    if (f.target.kind === 'detailSlot' || isLive(f, form) || offersOf(f, form).length > 0) {
      if (!f.accepted) accept.push(f.id);
    } else {
      drop.push(f.id);
    }
  }
  return { accept, drop };
}

/**
 * ЧТО МОЖНО ВЕРНУТЬ — по всему журналу (фиксап раунда 2, BLK-1; раунд 3, M-A). `✕` у этих строк
 * нет, и `undo all` их не трогает; WRITTEN даёт каждой `restore previous ↶` — явный возврат слов,
 * который сам ложится в журнал (`restoreFill`) и отменяется своим `✕` (`unrestoredFill`), — и тихий
 * `✕` отказа (`withoutWords`, m6).
 */
export function restorable(fills: Fill[], form: FormSnapshot): WordsOffer[] {
  return fills.flatMap((f) => offersOf(f, form));
}

/**
 * ЗАПИСЬ ВОЗВРАТА (BLK-1, M-A): в поле встают слова предложения (`after`), стоявшее перед возвратом
 * уходит в `before` — `✕` вернёт его. Принята сразу: это слова человека, рамки «drafted» у них нет.
 * Запись, которую возврат заменяет по адресу, едет с ним целиком (`prior`), а её ОСТАЛЬНЫЕ слова —
 * ступенями (`carried`): возврат выбирает одни слова, но не выбрасывает другие.
 *
 * ⚠ СМЕЩЁННОЕ ВОЗВРАТОМ — ТОЖЕ СЛОВА ЧЕЛОВЕКА, И ОНИ ЕДУТ СТУПЕНЬЮ (ревью раунда 3, MIN-1). Свои
 * слова возврат не держит (`ownWords` — ложь: его `before` не предлагается и не несётся), а в
 * `before` лежит правленый человеком черновик или слова, которые вернул прошлый возврат. Второй
 * GENERATE поверх возврата (`mergeFill`) или правка с уходом из поля (`acceptPlan`) стирали их
 * навсегда — вместе с «H», стоявшим до черновика, после возврата поверх возврата. Поэтому, когда
 * смещается не собственный текст черновика (`current` не равен его `after`) или заменяемая запись
 * сама возврат, смещённое ложится верхней ступенью. Пока возврат живой, её отдаёт его `✕`, и
 * второй дверью она не предлагается (`offersOf`).
 */
export function restoreFill(o: WordsOffer, current: string, at: string): Fill {
  const f = o.fill;
  const k = normText(o.words);
  const displaced: Words[] =
    f.restore || normText(current) !== normText(f.after)
      ? [{ before: current, after: o.words, at }]
      : [];
  return withCarried(
    {
      id: f.id,
      target: f.target,
      label: f.label,
      before: current,
      after: o.words,
      at,
      accepted: true,
      restore: true,
      prior: priorOf(f),
    },
    [...displaced, ...levelsOf(f).filter((w) => normText(w.before) !== k)],
  );
}

/** Что встаёт в журнал по `✕` возврата — запись, какой она была до него (или ничего). */
export function unrestoredFill(f: Fill): Fill | null {
  if (!f.restore || !f.prior) return null;
  const p = f.prior;
  return {
    id: f.id,
    target: f.target,
    label: f.label,
    // Возврат раунда 2 возвращал ровно `before` заменённой записи — это его `after`.
    before: p.before ?? f.after,
    after: p.after,
    at: p.at,
    accepted: p.accepted ?? true,
    ...(p.carried?.length ? { carried: p.carried } : {}),
    // Заменённая запись сама была возвратом — она встаёт возвратом, со своим `prior`.
    ...(p.restore ? { restore: true as const } : {}),
    ...(p.prior ? { prior: p.prior } : {}),
  };
}

/**
 * ЧТО ВСТАЁТ В ЖУРНАЛ ПО `✕` ЗАПИСИ, НЕСУЩЕЙ СЛОВА (раунд 3, M-A): её верхняя ступень — запись,
 * какой она была до замены, — с остальными ступенями. Поле при этом получает `before` снятой записи,
 * а ступень в нём не живая (иначе запись и не заменила бы её, а слилась), — и её слова WRITTEN
 * предлагает вернуть. Нести нечего — `null`: запись просто забывается.
 */
export function poppedFill(f: Fill): Fill | null {
  if (f.restore || !f.carried?.length) return null;
  const [top, ...rest] = f.carried;
  return withCarried(
    {
      id: f.id,
      target: f.target,
      label: f.label,
      before: top.before,
      after: top.after,
      at: top.at,
      accepted: true,
    },
    rest,
  );
}

/**
 * ОТКАЗ ОТ ПРЕДЛОЖЕНИЯ ВЕРНУТЬ СЛОВА (раунд 3, m6): человек сам решил, что они не нужны. Несённые
 * слова просто снимаются. Свои слова НЕ живой записи снимаются вместе с ней: на её место встаёт
 * верхняя несённая ступень. Запись, у которой не осталось ни живого значения, ни слов вне поля, не
 * держится вовсе — `null`, журнал её забывает.
 */
export function withoutWords(f: Fill, words: string, form: FormSnapshot): Fill | null {
  const k = normText(words);
  const rest = (f.carried ?? []).filter((w) => normText(w.before) !== k);
  let out: Fill;
  if (ownWords(f) && normText(f.before) === k && !isLive(f, form)) {
    const [top, ...more] = rest;
    if (!top) return null;
    out = withCarried(
      {
        id: f.id,
        target: f.target,
        label: f.label,
        before: top.before,
        after: top.after,
        at: top.at,
        accepted: true,
      },
      more,
    );
  } else {
    out = withCarried(f, rest);
  }
  return isLive(out, form) || offersOf(out, form).length > 0 ? out : null;
}

/**
 * ТА ЖЕ ЛИ ЭТО ЗАПИСЬ — по всему, что в ней держится, кроме флага просмотра (его ставит `accept
 * all`, а не правка журнала). Отмена отказа (m6) ставит прежнюю запись только поверх той, что отказ
 * оставил: новый прогон или `✕` за эти секунды — уже другая запись, и её затирать нельзя.
 */
export function sameFill(a: Fill | null | undefined, b: Fill | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  const key = (f: Fill) =>
    JSON.stringify([
      f.id,
      f.before,
      f.after,
      f.at,
      !!f.restore,
      f.snapshot ?? '',
      f.carried ?? [],
      f.prior ?? null,
    ]);
  return key(a) === key(b);
}

/* ─── САМ ЗАКОН ────────────────────────────────────────────────────────────────────────────── */

/**
 * ЧТО СЕЙЧАС ОТКРЫТО РЕШЕНИЮ — чтение НА РЕНДЕРЕ, против живой формы (фиксап раунда 2, MIN-3).
 *
 * С фиксапа M1 само-заполнение (`autoFillPlan` ниже) пишет всё, что может, и записанное СРАЗУ
 * читается `same`. Значит, строка, которая на рендере НЕ `same`, — это предложение, которого на
 * карточке нет, и прятать его нельзя: прогон оплачен. Сюда приходят:
 *   · поле, поправленное после нажатия GENERATE (`heldBack`), — `replace`, а если его очистили,
 *     пока ответ летел, — `add`;
 *   · предложение, которое писатель не принял (описание длиннее поля; строка спецификации без
 *     секции, `hold`);
 *   · запись, которую человек потом снял `✕` / `undo all` или переписал поверх черновика.
 *
 * Прежде здесь стоял `fillPlan` с двумя ответами, и `add` считался «записанным» всегда — строка,
 * которую само-заполнение НЕ написало, исчезала с экрана вместе с оплаченным предложением.
 */
export function openToDecide(rows: ProposalRow[]): ProposalRow[] {
  return rows.filter((row) => row.state !== 'same');
}

/**
 * ═══ ЧТО ПИШЕТСЯ САМО ПОСЛЕ ПРОГОНА (фиксап волны, M1 / O-09) ═══════════════════════════════════
 *
 * `write` — ВСЁ, что черновик назвал и что расходится с карточкой: пустой адресат (`add`) и
 * стоящее значение (`replace`) — чьё бы оно ни было. Журнал держит `before`, пометка «drafted»
 * показывает, что именно переписано, `undo all` возвращает всё разом.
 *
 * `decide` — адресат, который человек поправил ПОСЛЕ нажатия GENERATE, пока ответ летел
 * (`heldBack`): его свежие слова машина не затирает, строка ждёт его клика в «TO DECIDE». И строка,
 * которую нельзя записать как есть (`hold`: спецификация без секции — ждёт, пока её выберут).
 *
 * `same` не попадает никуда. Строка спецификации (`bom`) адреса до рождения не имеет и
 * «поправленной после нажатия» быть не может — она только добавляется.
 */
export function autoFillPlan(
  rows: ProposalRow[],
  heldBack: (target: FillTarget) => boolean,
): { write: ProposalRow[]; decide: ProposalRow[] } {
  const write: ProposalRow[] = [];
  const decide: ProposalRow[] = [];
  for (const row of rows) {
    if (row.state === 'same') continue;
    const target = targetOfRow(row);
    // Строка, которую писатель принять не может (спецификация без секции, `hold`), не пишется
    // вовсе: сервер отверг бы из-за неё ВСЁ сохранение карточки (фиксап раунда 2, MIN-11).
    if (row.hold || (target && heldBack(target))) decide.push(row);
    else write.push(row);
  }
  return { write, decide };
}

/**
 * СЛИЯНИЕ ЗАПИСИ С ПРЕДЫДУЩЕЙ ПО ТОМУ ЖЕ АДРЕСУ: `after` новый, `before` — ОТ ПЕРВОЙ, но ТОЛЬКО
 * если переписывается собственное прежнее слово машины.
 *
 * Второй прогон поверх ЖИВОЙ записи первого уточняет черновик, а не создаёт вторую ступень отката:
 * человек, нажавший `✕` после двух прогонов, ждёт увидеть то, что стояло до первого. Но если между
 * прогонами человек поправил поле (запись задремала), переписываются уже ЕГО слова, и откат обязан
 * вернуть их, а не текст до первого прогона (фиксап M1: с перезаписью это стало обычным путём).
 * «Своё ли слово переписано» — `before` новой записи равен `after` прежней.
 *
 * ⚠ НЕ СЛИЛИСЬ — ПРЕЖНИЕ СЛОВА ЕДУТ ДАЛЬШЕ (раунд 3, M-A). Новая запись держит правку человека в
 * своём `before`, а слова, которые держала прежняя («H» до первого черновика), становятся её
 * ступенью (`carried`). Прежде здесь возвращалась одна `next`, и «H» пропадало: `take` из TO DECIDE
 * или новый GENERATE поверх правленого черновика стирали его из журнала, пока `restore previous ↶`
 * ещё стояло в закрытом раскрытии WRITTEN.
 */
export function mergeFill(prev: Fill | undefined, next: Fill): Fill {
  // Возврат строится целиком (`restoreFill`): его `before` — то, что стояло, а не слияние.
  if (!prev || next.restore) return next;
  // Возврат (`restore`) — слова ЧЕЛОВЕКА: черновик, переписавший их, пишет свой `before` — их же;
  // слова, которые возврат нёс, едут дальше.
  if (prev.restore) return withCarried(next, prev.carried ?? []);
  if (normText(prev.after) === normText(next.before)) {
    return withCarried({ ...next, before: prev.before }, prev.carried ?? []);
  }
  return withCarried(next, levelsOf(prev));
}
