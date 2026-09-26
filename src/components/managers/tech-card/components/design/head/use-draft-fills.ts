import type { common_DesignRun } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useLayoutEffect } from 'react';
import { create } from 'zustand';

import type { FlushResult } from '../autosave-contract';
import type { ProposedColourway, ProposedSlotColour } from '../colourway-proposals-model';
import type { ConstructionDraft } from './construction-draft-model';
import { fillIdOf, holdsWords, mergeFill, type Fill, type FillTarget } from './draft-fills';

/**
 * ПАМЯТЬ ЧЕРНОВИКА — ЖУРНАЛ ЗАПОЛНЕНИЙ И ПРЕДЛОЖЕННЫЕ КОЛОРВЕИ, ПЕРЕЖИВАЮЩИЕ СМЕНУ ВКЛАДКИ.
 *
 * ⚠ ЗАЧЕМ ВООБЩЕ СТОР, А НЕ `useState` НА ОРГАНЕ. Студия смонтирована УСЛОВНО
 * (`index.tsx: activeTab === 'studio' && <StudioTab …/>`), и это не случайность — она правит
 * `callouts`. Значит любое состояние органа умирает от одного захода на COLORWAYS и обратно. Для
 * ответа модели это терпимо (его можно переспросить, и это честная цена вопроса), но не для двух
 * вещей:
 *   · ЖУРНАЛ ЗАПОЛНЕНИЙ — это единственная запись о том, ЧТО СТОЯЛО ДО. Потерять её значит
 *     потерять «если мы захотим то удалим» (B-14): значения остались бы на карточке без единого
 *     следа, откуда они взялись;
 *   · ПРЕДЛОЖЕННЫЕ КОЛОРВЕИ — это то, ради чего человек как раз и ходит на COLORWAYS: посмотреть,
 *     какие цвета уже есть, и вернуться. Предложение, умирающее от этого похода, заставляет
 *     платить за прогон второй раз.
 *
 * КЛЮЧ — `techCardId`. Модульный стор переживает и размонтирование, и переход на другую карточку;
 * без ключа журнал одной карточки подсвечивал бы поля другой.
 *
 * ═══ ЖУРНАЛ ПЕРЕЖИВАЕТ ПЕРЕЗАГРУЗКУ (волна 25.09, D-08 / ревью Codex B-09) ═══════════════════
 *
 * Здесь стояло «сохранения между перезагрузками нет, журнал сессионный». Волна 25.09 сделала
 * журнал ИСТОЧНИКОМ пометок «drafted» (синие рамки полей, `accept all N ▸`), а пометка, гаснущая от
 * F5, врала бы: поле, которое человек ещё не смотрел, выглядело бы просмотренным. Поэтому записи
 * `fills` пишутся в localStorage `plm.techcard.drafted.v1.<cardId>` на КАЖДОЙ правке журнала и
 * читаются при первом обращении к карточке; отклонённые строки `dismissed` (O-39) — под СВОИМ
 * ключом `plm.techcard.dismissed.v1.<cardId>` (ревью O-39: в одном блобе две вкладки стирали друг
 * друга). Предложения колорвеев и флаг «доска ушла» остаются сессионными. Две вкладки одной
 * карточки — см. «ДВЕ ВКЛАДКИ ОДНОЙ КАРТОЧКИ» ниже.
 *
 * ⚠ ВЛАДЕЛЕЦ — КАРТОЧКА, И ЭТО ПРОВЕРЯЕТСЯ ПРИ ЧТЕНИИ. Ключ уже несёт id, но хранилище правит кто
 * угодно (соседняя вкладка, ручная чистка, старая сборка), поэтому в значении лежит `owner`, и
 * запись с чужим владельцем читается как ПУСТАЯ: пометки карточки 38 на карточке 41 были бы хуже,
 * чем отсутствие пометок. Разбор недоверчивый — берётся только то, что похоже на запись журнала
 * (`isStoredFill`); всё остальное молча отбрасывается.
 *
 * ПОРЧА ХРАНИЛИЩА НЕ ЛОМАЕТ ЭКРАН: любое исключение localStorage (квота, приватный режим, запрет)
 * глотается — журнал просто остаётся сессионным, как было до волны.
 */

/**
 * ═══ ОТКЛОНЁННАЯ СТРОКА ПРЕДЛОЖЕНИЯ — «keep mine» В TO DECIDE (O-39, 26.09) ═══════════════════════
 *
 * Владелец: «DISMISSED не ноль — я там некоторые отклонил, но они почему-то не учлись». Отказ жил в
 * `useState` органа (`receipts[row] = 'dismissed'`), а список DISMISSED фильтровал ответ прогона —
 * тоже состояние органа. Орган умирает от смены шага, вкладки и F5, и «dismissed 0» вставало рядом с
 * «written 7», который читается из хранимого журнала: два счётчика одной строки жили по разным
 * законам. Теперь отказ — ЗАПИСЬ ПАМЯТИ КАРТОЧКИ рядом с журналом, в том же хранилище.
 *
 * Запись несёт то, что рисует строка DISMISSED без живого ответа: подпись поля и фразу предложения
 * словами. Ключ — строка предложения (`ProposalRow.id`): по нему строка уходит из TO DECIDE, и по нему
 * `put it back` возвращает её, пока ответ жив. Срок — ОТВЕТ ПРОГОНА, как у квитанций (D5): новый
 * ответ предлагает заново, и отказ прошлому предложению не отказ новому.
 */
export type Dismissal = {
  row: string;
  /** Подпись поля-адресата, как у строки TO DECIDE: `silhouette`, `fabric · main` (≤ 80 рун). */
  label: string;
  /** Что предлагал черновик, уже фразой (`draftSays(...).plain`, ≤ 240 рун). */
  says: string;
  /** Когда, `HH:MM`. Только для глаз. */
  at: string;
  /**
   * ПОКОЛЕНИЕ ОТВЕТА, которому отказ принадлежит (`answerGen` карточки), — ставит стор при записи.
   * Отказ чужого поколения — отказ прошлому предложению: он не читается, не сливается и не пишется.
   * Не время: часы двух вкладок и две записи в одну миллисекунду не порядок (ревью O-39 №2).
   */
  gen?: number;
};

type CardMemory = {
  fills: Fill[];
  /** Отклонённые строки ПОСЛЕДНЕГО ответа, новейшая первой (O-39); не больше `MAX_DISMISSED`. */
  dismissed: Dismissal[];
  /**
   * ПОКОЛЕНИЕ ТЕКУЩЕГО ОТВЕТА — счётчик карточки: +1 на каждый применённый ответ (`clearDismissed`),
   * хранится в ключе отказов. Это ограда для отказов (ревью O-39 №2): устойчивый id ответа сюда не
   * доходит, а счётчик, в отличие от uuid, ещё и УПОРЯДОЧЕН — вкладка с более новым ответом
   * побеждает вкладку с прошлым, даже если её собственная запись поколения не легла (квота).
   */
  answerGen: number;
  proposals: ProposedColourway[];
  /** Вердикт по предложению колорвея: подтверждён (с id продукта) или отклонён. */
  verdicts: Record<string, ColourwayVerdict>;
  /**
   * ДОСКА УШЛА ВПЕРЁД ПОСЛЕ ПОСЛЕДНЕГО ПРОГОНА — один флаг на три блока выхода.
   *
   * Считает его ЧЕРНОВИК (`construction-draft.tsx`, `stale`: слепок доски разошёлся с тем, что
   * прочитал прогон), а показывают ТРИ других блока — GENERAL INFORMATION, CONSTRUCTION,
   * MATERIAL SLOTS — пилюлей `moodboard moved on` в своей шапке (макет `_step-mood.js`, `zMoved`).
   * Второго калькулятора у пилюли нет и быть не должно: флаг пишется в стор тем же местом, которое
   * рисует `the moodboard has changed since` в ряду прогона, и оба органа не могут разойтись.
   * Без прогона флаг ложен по построению (`boardMoved` без `draftRun` в макете = null).
   */
  boardMoved: boolean;
};

export type ColourwayVerdict =
  | { status: 'dismissed' }
  | {
      status: 'confirmed';
      colorwayId: number;
      /** Рецепт не сохранился, а колорвей создан: половина, о которой обязаны сказать словами. */
      recipeFailed?: string;
    };

const EMPTY: CardMemory = {
  fills: [],
  dismissed: [],
  answerGen: 0,
  proposals: [],
  verdicts: {},
  boardMoved: false,
};

/* ═══ ПРОГОН ЧЕРНОВИКА — ПО КЛЮЧУ КАРТОЧКИ, А НЕ В ОРГАНЕ (раунд 4, S-M1) ═══════════════════════════

   Орган черновика рисуется только на шаге MOODBOARD (`studio-tab.tsx`), студия — только на своей
   вкладке, а вся карточка монтируется заново на каждый адрес (`page.tsx` ключует её id). Между
   щелчком GENERATE и ответом платного вызова орган может умереть трижды: смена шага, смена вкладки,
   уход на другую карточку. Всё, что обязано это пережить, лежит здесь:
     · `intent` — ключ идемпотентности НАМЕРЕНИЯ. В `useRef` органа он умирал вместе с органом, и
       нажатие после возврата минтило новый — вторая оплата за один вопрос;
     · `phase` — «сохраняю» / «спрашиваю»: вернувшийся орган видит `starting…` над идущим вызовом и
       не пускает второй щелчок;
     · `refused` — ИСХОД отказавшего сохранения, а не фраза: фраза собирается при отрисовке, и число
       полей в ней — то, что автосейв говорит СЕЙЧАС, после ожидания, а не на щелчке;
     · `parked` — ответ (или отказ сервера), который ждёт органа своей карточки. Колбэки `mutate`
       TanStack роняет вместе с наблюдателем: оплаченный ответ не доезжал до полей вовсе. Теперь
       ответ ложится сюда, а применяет его орган — сразу, если он на экране, или когда вернётся;
     · `minting` — цикл заведения слотов в полёте. Он живёт дольше органа, и GENERATE, `undo all`,
       `accept all` вернувшегося органа обязаны видеть его поднятым (ревью Codex M-08).
   Сессионное, в хранилище не пишется: прогон, перешагнувший F5, — уже прошлая история. */

export type DraftRunPhase = 'saving' | 'asking';

/**
 * Почему GENERATE не заказал прогон после сохранения: исход `flush` или остановленное сохранение.
 * `running` — повтор ключа застал прогон живым (26.09): ответа ещё нет, ключ на месте, нажать снова.
 */
export type DraftRefusal = FlushResult | 'released' | 'stopped' | 'running';

/** Что прочитал прогон: картинки, заметки и слепок доски, по которому черновик поймёт, что протух. */
export type DraftRead = { pictures: number; notes: number; fingerprint: string };

export type ParkedDraft =
  | {
      kind: 'answer';
      run: common_DesignRun | null;
      /** `null` — прогон вернулся без предложения: цена есть, предлагать нечего. */
      draft: ConstructionDraft | null;
      read: DraftRead;
      /** Скаляры в момент заказа, по адресу журнала: поправленное после черновик не перепишет (M1). */
      pressed: ReadonlyMap<string, string>;
      time: string;
    }
  | {
      kind: 'refusal';
      words: string;
      /** Отказ пришёл без органа на экране: сказанный по возвращении, он называет, чей он. */
      away: boolean;
    };

export type DraftRun = {
  intent: string | null;
  phase: DraftRunPhase | null;
  refused: DraftRefusal | null;
  parked: ParkedDraft | null;
  minting: number;
};

const IDLE_RUN: DraftRun = { intent: null, phase: null, refused: null, parked: null, minting: 0 };

/** Прогон карточки занят: щелчок, пришедший сейчас, второго не заказывает. */
export function draftRunBusy(r: DraftRun): boolean {
  return r.phase !== null || r.parked !== null || r.minting > 0;
}

/* ─── ХРАНИЛИЩЕ ЖУРНАЛА ────────────────────────────────────────────────────────────────────── */

export const DRAFTED_STORAGE_PREFIX = 'plm.techcard.drafted.v1.';
/**
 * ОТКАЗЫ — ПОД СВОИМ КЛЮЧОМ (ревью O-39, Codex MAJOR-1). В одном блобе с журналом каждая правка
 * журнала переписывала отказы из памяти вкладки, а каждый отказ — журнал: две вкладки одной карточки
 * стирали друг друга. Свой ключ — своя запись: отказ не трогает журнал, журнал не трогает отказы, и
 * отказ, не влезший в квоту, не уносит с собой единственную запись «что стояло до черновика».
 */
export const DISMISSED_STORAGE_PREFIX = 'plm.techcard.dismissed.v1.';
const fillsKey = (card: number) => `${DRAFTED_STORAGE_PREFIX}${card}`;
const dismissedKey = (card: number) => `${DISMISSED_STORAGE_PREFIX}${card}`;

/**
 * ПОТОЛКИ ОТКАЗОВ (ревью O-39, MAJOR-2): числом — новейшие первыми, старшие отрезаются; строками — в
 * рунах, при записи. Отказ без потолка рос бы с каждым «keep mine» и однажды не влез бы в квоту.
 */
const MAX_DISMISSED = 40;
const MAX_DISMISSAL_LABEL = 80;
const MAX_DISMISSAL_SAYS = 240;
function runes(s: string, max: number): string {
  const a = Array.from(s);
  return a.length <= max ? s : a.slice(0, max).join('');
}

/**
 * Потолок хранимых записей. Адрес записи — это адрес поля, поэтому скаляры не копятся (второй
 * прогон сливается с первым), но строки BOM и слоты верстака рождаются с НОВЫМИ ключами на каждом
 * прогоне. Новейшие первыми (`record` кладёт в голову). Что отрезается сверх потолка — `storedSlice`.
 */
const MAX_STORED = 120;

/**
 * ЧТО УХОДИТ В ХРАНИЛИЩЕ, КОГДА ЖУРНАЛ ДЛИННЕЕ ПОТОЛКА. НЕ принятые записи — ВСЕ, даже сверх
 * потолка: это пометки на экране, и отрезать хоть одну значило бы молча снять рамку и её откат после
 * F5 (ревью Codex, P1). Записи со словами человека (`holdsWords`: свои — фиксап раунда 2, BLK-1;
 * несённые — раунд 3, M-A) — тоже все: принятая такая запись — единственная копия того, что стояло
 * до черновика, и потолок не вправе её стереть; их не больше, чем скалярных полей у карточки
 * (адрес — поле, ступени едут внутри записи). Потолок режет только прочие
 * принятые — остаток места отдаётся новейшим из них. Порядок журнала сохраняется. Память сеанса не
 * режется вовсе.
 */
export function storedSlice(fills: Fill[], max = MAX_STORED): Fill[] {
  if (fills.length <= max) return fills;
  const keep = new Set(fills.filter((f) => !f.accepted || holdsWords(f)).map((f) => f.id));
  for (const f of fills) {
    if (keep.size >= max) break;
    if (f.accepted) keep.add(f.id);
  }
  return fills.filter((f) => keep.has(f.id));
}

const TARGET_KINDS = new Set<FillTarget['kind']>([
  'detail',
  'fit',
  'concept',
  'slot',
  'detailSlot',
]);

/** Ступень несённых слов (раунд 3, M-A) — три строки, и ничего больше не читается. */
function isStoredWords(x: unknown): boolean {
  if (!x || typeof x !== 'object') return false;
  const w = x as Record<string, unknown>;
  return typeof w.before === 'string' && typeof w.after === 'string' && typeof w.at === 'string';
}

const isStoredLevels = (x: unknown): boolean => Array.isArray(x) && x.every(isStoredWords);

/**
 * Заменённая возвратом запись (`Prior`): `after` и `at` обязательны (так её писал раунд 2), прочее —
 * по форме; цепочка возвратов проверяется целиком, но не глубже, чем её пишет журнал.
 */
function isStoredPrior(x: unknown, depth = 1): boolean {
  if (!x || typeof x !== 'object' || depth > 8) return false;
  const p = x as Record<string, unknown>;
  if (typeof p.after !== 'string' || typeof p.at !== 'string') return false;
  if (p.before !== undefined && typeof p.before !== 'string') return false;
  if (p.carried !== undefined && !isStoredLevels(p.carried)) return false;
  if (p.restore !== undefined && p.restore !== true) return false;
  if (p.accepted !== undefined && typeof p.accepted !== 'boolean') return false;
  return p.prior === undefined || isStoredPrior(p.prior, depth + 1);
}

/** Недоверчивый разбор: запись журнала — это ровно эта форма, и адрес сходится с целью. */
function isStoredFill(x: unknown): x is Fill {
  if (!x || typeof x !== 'object') return false;
  const f = x as Record<string, unknown>;
  const t = f.target as Record<string, unknown> | undefined;
  if (!t || typeof t !== 'object' || !TARGET_KINDS.has(t.kind as FillTarget['kind'])) return false;
  if (t.kind === 'detail' && typeof t.key !== 'string') return false;
  if (t.kind === 'slot' && typeof t.lineKey !== 'string') return false;
  if (t.kind === 'detailSlot' && !(typeof t.slotId === 'number' && t.slotId > 0)) return false;
  if (typeof f.id !== 'string' || f.id !== fillIdOf(t as FillTarget)) return false;
  if (typeof f.label !== 'string' || typeof f.before !== 'string' || typeof f.after !== 'string') {
    return false;
  }
  if (typeof f.at !== 'string') return false;
  if (f.snapshot !== undefined && typeof f.snapshot !== 'string') return false;
  if (f.restore !== undefined && f.restore !== true) return false;
  if (f.carried !== undefined && !isStoredLevels(f.carried)) return false;
  if (f.prior !== undefined && !isStoredPrior(f.prior)) return false;
  return f.accepted === undefined || typeof f.accepted === 'boolean';
}

/** Отклонённая строка (O-39) — четыре строки и поколение; ничего больше не читается; пустой ключ — мусор. */
function isStoredDismissal(x: unknown): x is Dismissal {
  if (!x || typeof x !== 'object') return false;
  const d = x as Record<string, unknown>;
  return (
    typeof d.row === 'string' &&
    d.row.length > 0 &&
    typeof d.label === 'string' &&
    typeof d.says === 'string' &&
    typeof d.at === 'string' &&
    (d.gen === undefined || typeof d.gen === 'number')
  );
}

/** Отказ, каким он идёт в память и в хранилище: строки в потолках, поколение проставлено. */
function boundDismissal(d: Dismissal, gen: number): Dismissal {
  return {
    row: d.row,
    label: runes(d.label, MAX_DISMISSAL_LABEL),
    says: runes(d.says, MAX_DISMISSAL_SAYS),
    at: d.at,
    gen,
  };
}

/** Что лежит под ключом отказов: поколение текущего ответа и его список (новейшие первыми). */
type StoredDismissed = { gen: number; list: Dismissal[] };

/**
 * Журнал карточки из хранилища. Чужой владелец, мусор, запрет хранилища — пусто. `legacy` — отказы,
 * которые сборка 1931c256 (до этого ревью) вшивала в тот же блоб: их забирает и снимает с блоба
 * ПЕРВАЯ ЗАПИСЬ отказов (`editDismissed`), а не чтение — чтение хранилища ничего не пишет.
 */
function readFillsBlob(card: number): { fills: Fill[]; legacy: Dismissal[] | null } {
  const none = { fills: [] as Fill[], legacy: null };
  if (!(card > 0)) return none;
  try {
    const raw = localStorage.getItem(fillsKey(card));
    if (!raw) return none;
    const parsed = JSON.parse(raw) as {
      v?: unknown;
      owner?: unknown;
      fills?: unknown;
      dismissed?: unknown;
    } | null;
    if (!parsed || parsed.v !== 1 || parsed.owner !== card || !Array.isArray(parsed.fills))
      return none;
    return {
      fills: storedSlice(parsed.fills.filter(isStoredFill)),
      legacy: Array.isArray(parsed.dismissed) ? parsed.dismissed.filter(isStoredDismissal) : null,
    };
  } catch {
    return none;
  }
}

/** Отказы карточки из хранилища; `null` — ключа нет. Чужой владелец, мусор, запрет — тоже `null`. */
function readDismissedBlob(card: number): StoredDismissed | null {
  if (!(card > 0)) return null;
  try {
    const raw = localStorage.getItem(dismissedKey(card));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      v?: unknown;
      owner?: unknown;
      gen?: unknown;
      list?: unknown;
    } | null;
    if (!parsed || parsed.v !== 1 || parsed.owner !== card || !Array.isArray(parsed.list))
      return null;
    const gen = typeof parsed.gen === 'number' && parsed.gen > 0 ? Math.floor(parsed.gen) : 0;
    return {
      gen,
      list: parsed.list
        .filter(isStoredDismissal)
        .map((d) => boundDismissal(d, typeof d.gen === 'number' ? d.gen : gen))
        .slice(0, MAX_DISMISSED),
    };
  } catch {
    return null;
  }
}

/** Запись без цепочки возвратов (`prior`) — самой тяжёлой и самой необязательной её части. */
function slimFill(f: Fill): Fill {
  if (!f.prior) return f;
  const out = { ...f };
  delete out.prior;
  return out;
}

/**
 * ОТКАЗ ХРАНИЛИЩА ГОВОРИТСЯ ВСЛУХ — ОДИН РАЗ (ревью O-39, MAJOR-2). До сих пор `setItem`, упёршийся
 * в квоту, глотался, и экран показывал сеансовое как сохранённое. Один раз на карточку и на полосу
 * отказов: удавшаяся запись снимает отметку, и следующий отказ скажется снова.
 */
const STORE_REFUSED =
  'the browser refused to store the draft journal — this tab keeps it until reload';
const refusedCards = new Set<number>();
function storeRefused(card: number): void {
  if (refusedCards.has(card)) return;
  refusedCards.add(card);
  try {
    useSnackBarStore.getState().showMessage(STORE_REFUSED, 'error');
  } catch {
    // Снекбара нет (стенд без приложения) — отказ всё равно не молчит в консоли разработчика.
  }
}
function storeWorked(card: number): void {
  refusedCards.delete(card);
}

/**
 * ЖУРНАЛ — В ХРАНИЛИЩЕ; `false` — не влез, и ключ оставлен КАК БЫЛ. Здесь стояло «не влезла и
 * облегчённая копия — ключ снимается: пустой журнал после F5 честнее воскресшего» (MIN-4). Ревью
 * O-39 перевесило: снятый ключ уносит единственную запись «что стояло до черновика» у КАЖДОГО поля,
 * а воскресший журнал — одну лишнюю строку «restore previous ↶»; и человеку об отказе теперь говорят
 * (`storeRefused`). Очередь попыток: целиком → без ключа отказов (он дешевле журнала, и следующий
 * отказ его перепишет) → без цепочек возвратов (`slimFill`: `✕` возврата тогда просто забудет
 * запись, но ни одно слово и ни одна пометка не потеряются). Не влезло — стоит прежняя копия.
 */
type FillsOutcome = {
  /** Журнал лёг (целиком, без ключа отказов или облегчённым). */
  stored: boolean;
  /** Ключ отказов снят ради места — вкладка обязана забыть свои отказы тем же шагом (ревью №2, D). */
  dropped: boolean;
};
function writeFills(card: number, fills: Fill[]): FillsOutcome {
  if (!(card > 0)) return { stored: false, dropped: false };
  const key = fillsKey(card);
  const write = (list: Fill[]) =>
    localStorage.setItem(key, JSON.stringify({ v: 1, owner: card, fills: list }));
  try {
    if (!fills.length) localStorage.removeItem(key);
    else write(storedSlice(fills));
    return { stored: true, dropped: false };
  } catch {
    let dropped = false;
    try {
      localStorage.removeItem(dismissedKey(card));
      dropped = true;
      write(storedSlice(fills));
      return { stored: true, dropped };
    } catch {
      // Всё ещё не влезает — облегчённая копия.
    }
    try {
      write(storedSlice(fills).map(slimFill));
      return { stored: true, dropped };
    } catch {
      return { stored: false, dropped }; // прежняя копия остаётся: снять ключ значило бы стереть «что стояло до»
    }
  }
}

/**
 * ОТКАЗЫ — В ХРАНИЛИЩЕ; `false` — не влезли, журнал не тронут. Пустой список нулевого поколения
 * снимает ключ; с поколением — остаётся: поколение и есть ограда, не дающая отставшей вкладке
 * воскресить отказы, обнулённые чужим ответом. Не влезли все — влезут новейшие: отказ старше
 * десяти других уже история.
 */
function writeDismissed(card: number, d: StoredDismissed): boolean {
  if (!(card > 0)) return false;
  const key = dismissedKey(card);
  const write = (list: Dismissal[]) =>
    localStorage.setItem(key, JSON.stringify({ v: 1, owner: card, gen: d.gen, list }));
  try {
    if (!d.list.length && !d.gen) localStorage.removeItem(key);
    else write(d.list.slice(0, MAX_DISMISSED));
    return true;
  } catch {
    try {
      write(d.list.slice(0, 10));
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * ═══ ДВЕ ВКЛАДКИ ОДНОЙ КАРТОЧКИ — ЗАПИСЬ НЕСЁТ ТОЛЬКО ТО, ЧТО ТРОНУЛА (ревью O-39 №2) ══════════════
 *
 * Журнал — память ОДНОГО оператора по карточке; две вкладки одной карточки редки. Обещание ровно
 * такое: ПОСЛЕДОВАТЕЛЬНЫЕ действия двух вкладок не теряются (A записала — B прочтёт или запишет
 * после), отказы обнулённого ответа не воскресают, квота не стирает журнал. Одновременная запись в
 * одну миллисекунду — «последний пишет» на уровне ключа: у localStorage нет сравнения-и-обмена, и
 * замок ради редкого случая владелец не просит.
 *
 * Как: каждая запись ПЕРЕЧИТЫВАЕТ свой ключ и пишет ХРАНИМОЕ ∪ ТРОНУТОЕ. Тронутое — строки, которые
 * ЭТА операция ставит (они побеждают) или снимает (уходят). Строки, которые вкладка лишь держит в
 * памяти, а операция не трогала, берутся ИЗ ХРАНИЛИЩА, не из памяти: устаревшая память не
 * перепишет более новую строку соседа. Память после записи = записанное. Ни множества «виденного»,
 * ни надгробий: каждое действие стора называет тронутое явно (`Touch`).
 *
 * Тронутое, которое хранилище не приняло (квота), едет со следующей записью (`unsaved`) — иначе
 * «this tab keeps it until reload» было бы неправдой уже на второй записи. Легло — забыто; F5 —
 * забыто тоже, как и обещано. Что потолок `storedSlice` не положил в хранилище, уходит из памяти со
 * следующей записью — цена простоты, и это только принятые строки сверх ста двадцати.
 */
type Touch<T> = { put: T[]; drop: string[] };
const NOTHING: Touch<never> = { put: [], drop: [] };
const idOf = (f: Fill) => f.id;
const rowOf = (d: Dismissal) => d.row;

/** Хранимое ∪ тронутое: снятое уходит, поставленное встаёт на своё место, новое — в голову. */
function overlay<T>(stored: T[], t: Touch<T>, keyOf: (x: T) => string): T[] {
  const drop = new Set(t.drop);
  const put = new Map(t.put.map((x) => [keyOf(x), x] as const));
  const present = new Set(stored.map(keyOf));
  const fresh = t.put.filter((x) => !present.has(keyOf(x)));
  const kept = stored.filter((x) => !drop.has(keyOf(x))).map((x) => put.get(keyOf(x)) ?? x);
  return fresh.length ? [...fresh, ...kept] : kept;
}

/** Тронутое двух операций: новое побеждает старое по ключу. */
function joinTouch<T>(
  older: Touch<T> | undefined,
  newer: Touch<T>,
  keyOf: (x: T) => string,
): Touch<T> {
  if (!older) return newer;
  const taken = new Set([...newer.put.map(keyOf), ...newer.drop]);
  return {
    put: [...older.put.filter((x) => !taken.has(keyOf(x))), ...newer.put],
    drop: [...older.drop.filter((k) => !taken.has(k)), ...newer.drop],
  };
}

/** Тронутое, которое хранилище не приняло, — по карточке; снимается первой удавшейся записью. */
const unsaved = {
  fills: new Map<number, Touch<Fill>>(),
  dismissed: new Map<number, Touch<Dismissal>>(),
};

/** Отказы поколения `gen` — и только они: чужое поколение не читается, не сливается, не пишется. */
function ofGen(list: Dismissal[], gen: number): Dismissal[] {
  return list.filter((d) => d.gen === gen);
}

const sameList = (a: unknown[], b: unknown[]) =>
  a.length === b.length && JSON.stringify(a) === JSON.stringify(b);

type Store = {
  byCard: Record<number, CardMemory>;
  /** Карточки, чей журнал уже поднят из хранилища. Поднимается ОДИН раз за сеанс. */
  hydrated: Record<number, true>;
  hydrate: (card: number) => void;
  record: (card: number, fill: Fill) => void;
  /** Запись целиком, без слияния: `✕` и отказ от слов ставят журнал в прежнее состояние (M-A, m6). */
  put: (card: number, fill: Fill) => void;
  forget: (card: number, id: string) => void;
  forgetMany: (card: number, ids: string[]) => void;
  /** «Просмотрено»: флаг `accepted` на записях; значения и `before` остаются (откат жив). */
  accept: (card: number, ids: string[]) => void;
  /** «keep mine» по строке TO DECIDE (O-39): запись по ключу строки, повтор заменяет прежнюю. */
  dismiss: (card: number, d: Dismissal) => void;
  /** «put it back»: отказ снят, строка снова работа. */
  undismiss: (card: number, row: string) => void;
  /** Новый ответ прогона — поколение +1, отказы прошлого ответа обнуляются, как квитанции (D5). */
  clearDismissed: (card: number) => void;
  /** Чужая вкладка записала ключ карточки (событие `storage`) — память освежается из хранилища. */
  refresh: (card: number, which: 'fills' | 'dismissed') => void;
  setProposals: (card: number, list: ProposedColourway[]) => void;
  patchProposal: (card: number, id: string, patch: Partial<ProposedColourway>) => void;
  patchSlot: (card: number, id: string, slot: number, patch: Partial<ProposedSlotColour>) => void;
  setVerdict: (card: number, id: string, verdict: ColourwayVerdict) => void;
  setBoardMoved: (card: number, moved: boolean) => void;
  /** Прогоны черновика по карточкам (S-M1) — отдельно от памяти, чтобы фаза не будила её читателей. */
  runs: Record<number, DraftRun>;
  patchRun: (card: number, patch: Partial<Omit<DraftRun, 'minting'>>) => void;
  /** Забрать припаркованное — ОДИН раз: второй вызов (второй эффект, второй орган) получает null. */
  takeParked: (card: number) => ParkedDraft | null;
  bumpMinting: (card: number, delta: 1 | -1) => void;
};

/**
 * Память карточки С ПОДНЯТЫМ ЖУРНАЛОМ. Любая правка сначала поднимает хранимое — иначе запись,
 * сделанная до первого чтения, затёрла бы в хранилище записи прошлого сеанса. Записи сеанса
 * побеждают хранимые по адресу.
 */
function memoryOf(state: Store, card: number): CardMemory {
  const cur = state.byCard[card] ?? EMPTY;
  if (state.hydrated[card] || !(card > 0)) return cur;
  const blob = readFillsBlob(card);
  const stored = readDismissedBlob(card);
  const have = new Set(cur.fills.map(idOf));
  const fills = blob.fills.filter((f) => !have.has(f.id));
  const answerGen = Math.max(cur.answerGen, stored?.gen ?? 0);
  // Отказы сеанса своего поколения побеждают хранимые по ключу строки — как записи (O-39).
  const mine = ofGen(cur.dismissed, answerGen);
  const rows = new Set(mine.map(rowOf));
  const foreign = stored ? ofGen(stored.list, answerGen).filter((d) => !rows.has(d.row)) : [];
  const dismissed = foreign.length ? [...mine, ...foreign] : mine;
  if (!fills.length && answerGen === cur.answerGen && dismissed.length === cur.dismissed.length)
    return cur;
  return {
    ...cur,
    fills: fills.length ? [...cur.fills, ...fills] : cur.fills,
    dismissed,
    answerGen,
  };
}

function edit(state: Store, card: number, fn: (m: CardMemory) => CardMemory): Partial<Store> {
  const cur = memoryOf(state, card);
  const next = fn(cur);
  return {
    byCard: { ...state.byCard, [card]: next },
    hydrated: state.hydrated[card] ? state.hydrated : { ...state.hydrated, [card]: true },
  };
}

/**
 * Правка ЖУРНАЛА — та же `edit`, плюс перечитывание ключа и запись «хранимое ∪ тронутое» (см.
 * «ДВЕ ВКЛАДКИ»). `touch` называет тронутое по памяти вкладки И по хранимому — строка, которую
 * операция меняет, берётся из хранимого, если оно её знает (там она новее), иначе из памяти.
 * Побочный эффект внутри апдейтера законен: zustand зовёт его ровно один раз (это не апдейтер
 * React под StrictMode). Не влезло — память всё равно правится, тронутое ждёт, человеку сказано.
 */
function editFills(
  state: Store,
  card: number,
  touch: (mine: Fill[], stored: Fill[]) => Touch<Fill>,
): Partial<Store> {
  return edit(state, card, (m) => {
    const stored = readFillsBlob(card).fills;
    const t = joinTouch(unsaved.fills.get(card), touch(m.fills, stored), idOf);
    if (!t.put.length && !t.drop.length) return m;
    const next = overlay(stored, t, idOf);
    const w = writeFills(card, next);
    if (w.stored) {
      unsaved.fills.delete(card);
      storeWorked(card);
    } else {
      unsaved.fills.set(card, t);
      storeRefused(card);
    }
    if (!w.dropped) return { ...m, fills: next };
    // Ключ отказов снят ради места (ревью №2, D): память вкладки об отказах — тем же шагом, иначе
    // экран показывал бы отказы, которых в хранилище больше нет. Поколение остаётся.
    unsaved.dismissed.delete(card);
    return { ...m, fills: next, dismissed: [] };
  });
}

/**
 * Правка ОТКАЗОВ (O-39) — та же `edit` под своим ключом, за оградой поколения. `newGen` — новый
 * ответ: поколение +1 к старшему из известных (памяти и хранилища), список пуст по построению.
 * Своё тронутое несёт поколение ПАМЯТИ вкладки: у отставшей вкладки оно старше хранимого, и её
 * отказ — отказ прошлому предложению — не пишется. Отказы, вшитые в блоб журнала сборкой 1931c256,
 * переезжают ОДНОЙ записью: складываются сюда как тронутые однажды (не в новое поколение — оно пусто
 * по смыслу) и снимаются с блоба журнала; не легло — не легло, наружу не говорится.
 */
function editDismissed(
  state: Store,
  card: number,
  touch: (mine: Dismissal[], base: Dismissal[]) => Touch<Dismissal>,
  newGen = false,
): Partial<Store> {
  return edit(state, card, (m) => {
    const blob = readFillsBlob(card);
    const stored = readDismissedBlob(card);
    const gen = Math.max(m.answerGen, stored?.gen ?? 0) + (newGen ? 1 : 0);
    let base = stored ? ofGen(stored.list, gen) : [];
    if (blob.legacy) {
      if (!newGen) {
        const moved = blob.legacy.map((d) => boundDismissal(d, gen));
        base = overlay(base, { put: moved, drop: [] }, rowOf);
      }
      writeFills(card, blob.fills);
    }
    const own = touch(m.dismissed, base);
    const t = joinTouch(
      unsaved.dismissed.get(card),
      { put: own.put.map((d) => boundDismissal(d, m.answerGen)), drop: own.drop },
      rowOf,
    );
    if (!newGen && !blob.legacy && !t.put.length && !t.drop.length) return m;
    const grown = ofGen(overlay(base, t, rowOf), gen);
    const next = grown.length > MAX_DISMISSED ? grown.slice(0, MAX_DISMISSED) : grown;
    if (writeDismissed(card, { gen, list: next })) {
      unsaved.dismissed.delete(card);
      storeWorked(card);
    } else {
      unsaved.dismissed.set(card, t);
      storeRefused(card);
    }
    return { ...m, dismissed: next, answerGen: gen };
  });
}

const runOf = (s: Store, card: number): DraftRun => s.runs[card] ?? IDLE_RUN;

export const useDraftMemory = create<Store>((set, get) => ({
  byCard: {},
  hydrated: {},
  runs: {},

  patchRun: (card, patch) =>
    set((s) => ({ runs: { ...s.runs, [card]: { ...runOf(s, card), ...patch } } })),

  takeParked: (card) => {
    const parked = runOf(get(), card).parked;
    if (parked) set((s) => ({ runs: { ...s.runs, [card]: { ...runOf(s, card), parked: null } } }));
    return parked;
  },

  bumpMinting: (card, delta) =>
    set((s) => {
      const cur = runOf(s, card);
      return { runs: { ...s.runs, [card]: { ...cur, minting: Math.max(0, cur.minting + delta) } } };
    }),

  hydrate: (card) =>
    set((s) => {
      if (s.hydrated[card] || !(card > 0)) return {};
      return edit(s, card, (m) => m);
    }),

  /**
   * ЗАПИСЬ В ЖУРНАЛ. Адрес уже занят — сливаем: `after` новый, `before` от ПЕРВОЙ записи, чтобы
   * у человека была одна отмена «как было до черновика», а не лестница черновиков (см.
   * `mergeFill`). `accepted` берётся у НОВОЙ записи: переписанное черновиком снова ждёт взгляда.
   */
  record: (card, fill) =>
    set((s) =>
      editFills(s, card, (mine, stored) => {
        const prev = stored.find((f) => f.id === fill.id) ?? mine.find((f) => f.id === fill.id);
        return { put: [mergeFill(prev, fill)], drop: [] };
      }),
    ),

  /**
   * ЗАПИСЬ, КАКОЙ ОНА ДОЛЖНА СТОЯТЬ, — БЕЗ СЛИЯНИЯ (раунд 3, M-A / m6). `✕` возвращает журнал к
   * прежнему состоянию (`unrestoredFill`, `poppedFill`), отказ от слов и его отмена ставят запись
   * целиком. Через `record` слияние (`mergeFill`) приняло бы прежнюю запись за новую запись
   * черновика — и понесло бы снятую поверх неё ступенью.
   */
  put: (card, fill) => set((s) => editFills(s, card, () => ({ put: [fill], drop: [] }))),

  forget: (card, id) =>
    set((s) =>
      editFills(s, card, (mine, stored) =>
        mine.some((f) => f.id === id) || stored.some((f) => f.id === id)
          ? { put: [], drop: [id] }
          : NOTHING,
      ),
    ),

  forgetMany: (card, ids) =>
    set((s) =>
      editFills(s, card, (mine, stored) => {
        const drop = ids.filter(
          (id) => mine.some((f) => f.id === id) || stored.some((f) => f.id === id),
        );
        return drop.length ? { put: [], drop } : NOTHING;
      }),
    ),

  accept: (card, ids) =>
    set((s) =>
      editFills(s, card, (mine, stored) => {
        const put: Fill[] = [];
        for (const id of ids) {
          const row = stored.find((f) => f.id === id) ?? mine.find((f) => f.id === id);
          if (row && !row.accepted) put.push({ ...row, accepted: true });
        }
        return put.length ? { put, drop: [] } : NOTHING;
      }),
    ),

  /* ОТКАЗЫ (O-39): по ключу строки, новейший первым; повтор по тому же ключу заменяет запись;
     строки — в потолках, поколение — памяти вкладки (`editDismissed`). */
  dismiss: (card, d) => set((s) => editDismissed(s, card, () => ({ put: [d], drop: [] }))),

  undismiss: (card, row) =>
    set((s) =>
      editDismissed(s, card, (mine, base) =>
        mine.some((x) => x.row === row) || base.some((x) => x.row === row)
          ? { put: [], drop: [row] }
          : NOTHING,
      ),
    ),

  clearDismissed: (card) => set((s) => editDismissed(s, card, () => NOTHING, true)),

  /* ЧУЖАЯ ЗАПИСЬ (событие `storage` из другой вкладки): память = хранимое; своё непринятое
     хранилищем поедет со следующей записью (`unsaved`). Неподнятая карточка не освежается — её
     поднимет первое обращение. */
  refresh: (card, which) =>
    set((s) => {
      const cur = s.byCard[card];
      if (!cur || !s.hydrated[card]) return {};
      if (which === 'fills') {
        const fills = readFillsBlob(card).fills;
        if (sameList(fills, cur.fills)) return {};
        return { byCard: { ...s.byCard, [card]: { ...cur, fills } } };
      }
      const stored = readDismissedBlob(card);
      const answerGen = Math.max(cur.answerGen, stored?.gen ?? 0);
      const dismissed = stored ? ofGen(stored.list, answerGen) : [];
      if (answerGen === cur.answerGen && sameList(dismissed, cur.dismissed)) return {};
      return { byCard: { ...s.byCard, [card]: { ...cur, dismissed, answerGen } } };
    }),

  /**
   * НОВЫЙ ОТВЕТ ЗАМЕНЯЕТ ПРЕДЛОЖЕНИЯ, НО НЕ КВИТАНЦИИ ПОДТВЕРЖДЁННЫХ.
   *
   * Предложение — это предложение, и второй прогон вправе предложить другое. А квитанция
   * `confirmed` называет НАСТОЯЩИЙ ПРОДУКТ, уже созданный на сервере: стереть её значило бы
   * предложить создать его второй раз. Отклонённые уходят вместе со своим предложением — отказ
   * был отказом ЭТОМУ предложению, а не цвету навсегда.
   */
  setProposals: (card, list) =>
    set((s) =>
      edit(s, card, (m) => {
        const kept: Record<string, ColourwayVerdict> = {};
        for (const [id, v] of Object.entries(m.verdicts))
          if (v.status === 'confirmed') kept[id] = v;
        return { ...m, proposals: list, verdicts: kept };
      }),
    ),

  patchProposal: (card, id, patch) =>
    set((s) =>
      edit(s, card, (m) => ({
        ...m,
        proposals: m.proposals.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      })),
    ),

  patchSlot: (card, id, slot, patch) =>
    set((s) =>
      edit(s, card, (m) => ({
        ...m,
        proposals: m.proposals.map((p) =>
          p.id === id
            ? { ...p, slots: p.slots.map((x, i) => (i === slot ? { ...x, ...patch } : x)) }
            : p,
        ),
      })),
    ),

  setVerdict: (card, id, verdict) =>
    set((s) => edit(s, card, (m) => ({ ...m, verdicts: { ...m.verdicts, [id]: verdict } }))),

  /** Запись без изменения — не запись: иначе эффект черновика перерисовывал бы читателей впустую. */
  setBoardMoved: (card, moved) =>
    set((s) => {
      const cur = s.byCard[card] ?? EMPTY;
      if (cur.boardMoved === moved) return {};
      return edit(s, card, (m) => ({ ...m, boardMoved: moved }));
    }),
}));

/**
 * Память ЭТОЙ карточки. Одна и та же пустая ссылка для незнакомой — иначе бесконечный ререндер.
 *
 * Журнал поднимается из хранилища в `useLayoutEffect`, а не в селекторе: селектор обязан быть
 * чистым (запись стора посреди чужого рендера — предупреждение React и лишний кадр), а layout-
 * эффект успевает до отрисовки — синяя рамка не мигает «нет → есть» после F5.
 */
export function useCardMemory(techCardId: number): CardMemory {
  useLayoutEffect(() => {
    if (!(techCardId > 0)) return undefined;
    const st = useDraftMemory.getState();
    st.hydrate(techCardId);
    // ЧУЖАЯ ЗАПИСЬ — В ПАМЯТЬ (ревью O-39): событие `storage` приходит только из ДРУГОЙ вкладки,
    // и только ключи ЭТОЙ карточки будят её память; `null` (хранилище очищено) не в счёт.
    const onStorage = (e: StorageEvent) => {
      if (e.key === fillsKey(techCardId)) st.refresh(techCardId, 'fills');
      else if (e.key === dismissedKey(techCardId)) st.refresh(techCardId, 'dismissed');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [techCardId]);
  return useDraftMemory((s) => s.byCard[techCardId] ?? EMPTY);
}

/** Прогон черновика ЭТОЙ карточки; у незнакомой — одна и та же пустая ссылка. */
export function useDraftRun(techCardId: number): DraftRun {
  return useDraftMemory((s) => runOf(s, techCardId));
}

/** Прогон карточки В МОМЕНТ вызова, мимо рендера: щелчок и ответ читают стор, а не снимок. */
export function readDraftRun(card: number): DraftRun {
  return runOf(useDraftMemory.getState(), card);
}
