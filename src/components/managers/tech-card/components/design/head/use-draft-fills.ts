import type { common_DesignRun } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { useLayoutEffect } from 'react';
import { create } from 'zustand';

import type { FlushResult } from '../autosave-contract';
import {
  proposalIdentity,
  withoutKnownColourways,
  type ColourwayIdentity,
  type ProposedColourway,
  type ProposedSlotColour,
} from '../colourway-proposals-model';
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
 * ═══ ЖУРНАЛ ПЕРЕЖИВАЕТ ПЕРЕЗАГРУЗКУ (волна 25.09, D-08 / ревью Codex B-09) ═════════════════════
 *
 * Здесь стояло «сохранения между перезагрузками нет, журнал сессионный». Волна 25.09 сделала
 * журнал ИСТОЧНИКОМ пометок «drafted» (синие рамки полей, `accept all N ▸`), а пометка, гаснущая от
 * F5, врала бы: поле, которое человек ещё не смотрел, выглядело бы просмотренным. Поэтому записи
 * `fills` пишутся в localStorage `plm.techcard.drafted.v1.<cardId>` на КАЖДОЙ правке журнала и
 * читаются при первом обращении к карточке; отклонённые строки `dismissed` (O-39) — под СВОИМ
 * ключом `plm.techcard.dismissed.v1.<cardId>` вместе с МЕТКОЙ ОТВЕТА, которому они принадлежат
 * (ревью O-39: в одном блобе две вкладки стирали друг друга). Предложения колорвеев и флаг «доска
 * ушла» остаются сессионными. Две вкладки одной карточки, отказ квоты и свой слой экрана — см.
 * «ДВЕ ВКЛАДКИ ОДНОЙ КАРТОЧКИ» ниже.
 *
 * ⚠ ВЛАДЕЛЕЦ — КАРТОЧКА, И ЭТО ПРОВЕРЯЕТСЯ ПРИ ЧТЕНИИ. Ключ уже несёт id, но хранилище правит кто
 * угодно (соседняя вкладка, ручная чистка, старая сборка), поэтому в значении лежит `owner`, и
 * запись с чужим владельцем читается как ПУСТАЯ: пометки карточки 38 на карточке 41 были бы хуже,
 * чем отсутствие пометок. Разбор недоверчивый — берётся только то, что похоже на запись журнала
 * (`isStoredFill`); всё остальное молча отбрасывается.
 *
 * ПОРЧА ХРАНИЛИЩА НЕ ЛОМАЕТ ЭКРАН: любое исключение localStorage (квота, приватный режим, запрет)
 * глотается — журнал просто остаётся сессионным, как было до волны; об отказе квоты человеку
 * говорят один раз (`storeRefused`).
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
 * ответ предлагает заново, и отказ прошлому предложению не отказ новому. Чей это ответ, говорит не
 * строка, а МЕТКА под ключом отказов (`AnswerToken`): весь список под ключом — одного ответа.
 */
export type Dismissal = {
  row: string;
  /** Подпись поля-адресата, как у строки TO DECIDE: `silhouette`, `fabric · main` (≤ 80 рун). */
  label: string;
  /** Что предлагал черновик, уже фразой (`draftSays(...).plain`, ≤ 240 рун). */
  says: string;
  /** Когда, `HH:MM`. Только для глаз. */
  at: string;
};

/**
 * МЕТКА ОТВЕТА — чей список отказов лежит под ключом (ревью O-39 №3, B). `seq` растёт на каждый
 * применённый ответ (`clearDismissed`: старший из известных + 1); `id` — восемь случайных знаков,
 * потому что один и тот же `seq` законно выдают ДВЕ вкладки (у одной GENERATE не лёг в хранилище, у
 * другой лёг), и счётчик один их ответы не различил бы. Порядок: старший `seq` новее; при равном
 * `seq` и разных `id` новее ХРАНИМАЯ — она легла, вторая нет. Нулевая метка — «ответа ещё не было».
 */
export type AnswerToken = { seq: number; id: string };
const ZERO_TOKEN: AnswerToken = { seq: 0, id: '' };

/** Тронутое одной операцией: строки, которые она ставит (`put`), и ключи, которые снимает (`drop`). */
type Touch<T> = { put: T[]; drop: string[] };
const NOTHING: Touch<never> = { put: [], drop: [] };

/**
 * СВОЙ СЛОЙ ЭКРАНА (ревью O-39 №3, A): тронутое, которое хранилище не приняло. Живёт только в памяти
 * вкладки, не пишется и не повторяется, не больше потолков журнала — см. «ДВЕ ВКЛАДКИ ОДНОЙ
 * КАРТОЧКИ».
 */
type LocalOnly = { fills: Touch<Fill>; dismissed: Touch<Dismissal> };
const NO_LOCAL: LocalOnly = { fills: NOTHING, dismissed: NOTHING };

type CardMemory = {
  /** Журнал НА ЭКРАНЕ: хранимое ∪ свой слой. */
  fills: Fill[];
  /** Отклонённые строки ТЕКУЩЕГО ответа на экране, новейшая первой (O-39): хранимое ∪ свой слой. */
  dismissed: Dismissal[];
  /**
   * Метка ответа, который вкладка считает текущим: при подъёме берётся из хранилища, растёт со
   * своим `clearDismissed`. Чужой более новый ответ её НЕ меняет (D-46) — новую метку вкладка
   * получает только своим GENERATE.
   */
  token: AnswerToken;
  localOnly: LocalOnly;
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
  token: ZERO_TOKEN,
  localOnly: NO_LOCAL,
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
 * принятые — остаток места отдаётся новейшим из них. Порядок журнала сохраняется. Что срезано, того
 * нет и в памяти: писатель возвращает положенное, и память равняется на него (E).
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

/** Отклонённая строка (O-39) — четыре строки; ничего больше не читается; пустой ключ — мусор. */
function isStoredDismissal(x: unknown): x is Dismissal {
  if (!x || typeof x !== 'object') return false;
  const d = x as Record<string, unknown>;
  return (
    typeof d.row === 'string' &&
    d.row.length > 0 &&
    typeof d.label === 'string' &&
    typeof d.says === 'string' &&
    typeof d.at === 'string'
  );
}

/** Отказ, каким он идёт в память и в хранилище: ровно четыре поля, строки в потолках. */
function boundDismissal(d: Dismissal): Dismissal {
  return {
    row: d.row,
    label: runes(d.label, MAX_DISMISSAL_LABEL),
    says: runes(d.says, MAX_DISMISSAL_SAYS),
    at: d.at,
  };
}

/**
 * Метка ответа из хранилища — ТОЛЬКО правильная (ревью O-39 №3, F): `seq` — безопасное целое ≥ 0,
 * `id` — короткая строка, нулевой `seq` — только с пустым `id`. Иначе блоб отказов порчен и читается
 * как ОТСУТСТВУЮЩИЙ: `2^53 + 1 === 2^53`, и GENERATE с таким счётчиком не открыл бы новый ответ
 * никогда, а `1e400` — это `Infinity`, которая пишется как `null`.
 */
function isToken(x: unknown): x is AnswerToken {
  if (!x || typeof x !== 'object') return false;
  const { seq, id } = x as Record<string, unknown>;
  if (!Number.isSafeInteger(seq) || (seq as number) < 0) return false;
  return typeof id === 'string' && id.length <= 16 && ((seq as number) > 0 || id === '');
}

/** Что лежит под ключом отказов: метка текущего ответа и его список (новейшие первыми). */
type StoredDismissed = { token: AnswerToken; list: Dismissal[] };

/**
 * Журнал карточки из хранилища. Чужой владелец, мусор, запрет хранилища — пусто. Чужое свойство в
 * блобе не читается (сборка 1931c256 вшивала сюда `dismissed`; до беты она не дошла — D-47: ни
 * переезда, ни отметки), а следующая запись журнала (`putFills`) кладёт блоб уже без него.
 */
function readFillsBlob(card: number): Fill[] {
  if (!(card > 0)) return [];
  try {
    const raw = localStorage.getItem(fillsKey(card));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { v?: unknown; owner?: unknown; fills?: unknown } | null;
    if (!parsed || parsed.v !== 1 || parsed.owner !== card || !Array.isArray(parsed.fills))
      return [];
    return storedSlice(parsed.fills.filter(isStoredFill));
  } catch {
    return [];
  }
}

/** Отказы карточки из хранилища; `null` — ключа нет. Чужой владелец, мусор, порченая метка, запрет — тоже `null`. */
function readDismissedBlob(card: number): StoredDismissed | null {
  if (!(card > 0)) return null;
  try {
    const raw = localStorage.getItem(dismissedKey(card));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      v?: unknown;
      owner?: unknown;
      token?: unknown;
      list?: unknown;
    } | null;
    if (!parsed || parsed.v !== 1 || parsed.owner !== card || !Array.isArray(parsed.list)) {
      return null;
    }
    if (!isToken(parsed.token)) return null;
    return {
      token: { seq: parsed.token.seq, id: parsed.token.id },
      list: parsed.list.filter(isStoredDismissal).map(boundDismissal).slice(0, MAX_DISMISSED),
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
 * отказов: удавшаяся запись снимает отметку, и следующий отказ скажется снова. Свой слой при этом не
 * бездонный (ревью S1, Low): переполнился — старшие строки ушли, и об отказе сказано ещё раз, один.
 */
const STORE_REFUSED =
  'the browser refused to store the draft journal — this tab keeps it until reload';
const refusedCards = new Set<number>();
const evictedCards = new Set<number>();
function storeRefused(card: number, evicted = false): void {
  if (evicted && !evictedCards.has(card)) {
    evictedCards.add(card);
    refusedCards.delete(card);
  }
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
  evictedCards.delete(card);
}

/**
 * ЧУЖОЙ ОТВЕТ НОВЕЕ СВОЕГО — ТОЖЕ ВСЛУХ, ОДИН РАЗ ЗА ЭПИЗОД (D-46). Соседняя вкладка сделала GENERATE:
 * отказы этой вкладки больше нигде не хранятся, и пока она не сделает GENERATE сама, её «keep mine»
 * никуда не ложится. Эпизод кончается своим GENERATE (`answerFresh`).
 */
const STALE_ANSWER =
  'another tab generated a newer answer — dismissals here are not saved until you generate again';
const staleCards = new Set<number>();
function answerStale(card: number): void {
  if (staleCards.has(card)) return;
  staleCards.add(card);
  try {
    useSnackBarStore.getState().showMessage(STALE_ANSWER, 'error');
  } catch {
    // Стенд без снекбара.
  }
}
function answerFresh(card: number): void {
  staleCards.delete(card);
}

/** Журнал — под ключ как есть (пустой — ключ снят); возвращает положенное. Бросает, что бросит `setItem`. */
function putFills(card: number, list: Fill[]): Fill[] {
  if (!list.length) localStorage.removeItem(fillsKey(card));
  else localStorage.setItem(fillsKey(card), JSON.stringify({ v: 1, owner: card, fills: list }));
  return list;
}

/** Отказы — под ключ как есть, с меткой; возвращает положенное. Бросает, что бросит `setItem`. */
function putDismissed(card: number, d: StoredDismissed): Dismissal[] {
  const blob = { v: 1, owner: card, token: d.token, list: d.list };
  localStorage.setItem(dismissedKey(card), JSON.stringify(blob));
  return d.list;
}

/**
 * ЖУРНАЛ — В ХРАНИЛИЩЕ. `stored` — РОВНО ТО, ЧТО ЛЕГЛО (ревью O-39 №3, E): срез потолка или
 * облегчённая копия, и память равняется на возвращённое, а не на то, что хотела положить; `null` —
 * не влезло, и ключ оставлен КАК БЫЛ. Здесь стояло «не влезла и облегчённая копия — ключ снимается:
 * пустой журнал после F5 честнее воскресшего» (MIN-4). Ревью O-39 перевесило: снятый ключ уносит
 * единственную запись «что стояло до черновика» у КАЖДОГО поля, а воскресший журнал — одну лишнюю
 * строку «restore previous ↶»; и человеку об отказе теперь говорят (`storeRefused`). Очередь попыток:
 * целиком → список отказов ужат до одной метки (`shrank`: список дешевле журнала, а МЕТКА ОТВЕТА
 * остаётся под ключом — снять ключ значило бы отдать отставшей вкладке следующий ответ, C) → без
 * цепочек возвратов (`slimFill`: `✕` возврата тогда просто забудет запись, но ни одно слово и ни
 * одна пометка не потеряются). Не влезло — стоит прежняя копия.
 */
type FillsOutcome = {
  /** Что легло под ключ журнала; `null` — ничего, прежняя копия на месте. */
  stored: Fill[] | null;
  /** Список отказов ужат ради места — вкладка обязана забыть свои хранимые отказы тем же шагом. */
  shrank: boolean;
};
function writeFills(card: number, fills: Fill[]): FillsOutcome {
  if (!(card > 0)) return { stored: null, shrank: false };
  try {
    return { stored: putFills(card, storedSlice(fills)), shrank: false };
  } catch {
    // Не влезло — по лестнице.
  }
  let shrank = false;
  try {
    const d = readDismissedBlob(card);
    if (d?.list.length) {
      putDismissed(card, { token: d.token, list: [] });
      shrank = true;
      return { stored: putFills(card, storedSlice(fills)), shrank };
    }
  } catch {
    // Всё ещё не влезает — облегчённая копия.
  }
  try {
    return { stored: putFills(card, storedSlice(fills).map(slimFill)), shrank };
  } catch {
    return { stored: null, shrank }; // прежняя копия остаётся: снять ключ значило бы стереть «что стояло до»
  }
}

/**
 * ОТКАЗЫ — В ХРАНИЛИЩЕ; возвращает РОВНО положенный список (E): не влезли сорок — лягут десять
 * новейших, и память покажет десять (отказ старше десяти других уже история); `null` — не влезли и
 * они, журнал и прежний список не тронуты. Ключ не снимается никогда: под ним метка ответа (C).
 */
function writeDismissed(card: number, d: StoredDismissed): Dismissal[] | null {
  if (!(card > 0)) return null;
  try {
    return putDismissed(card, { ...d, list: d.list.slice(0, MAX_DISMISSED) });
  } catch {
    // Не влезли — десять новейших.
  }
  try {
    return putDismissed(card, { ...d, list: d.list.slice(0, 10) });
  } catch {
    return null;
  }
}

/**
 * ═══ ДВЕ ВКЛАДКИ ОДНОЙ КАРТОЧКИ — ЗАПИСЬ НЕСЁТ ТОЛЬКО ТО, ЧТО ТРОНУЛА (ревью O-39 №2, №3) ═════════
 *
 * Журнал — память ОДНОГО оператора по карточке; две вкладки одной карточки редки. Обещание (D-41)
 * ровно такое: ПОСЛЕДОВАТЕЛЬНЫЕ действия двух вкладок не теряются (A записала — B прочтёт или
 * запишет после), отказы обнулённого ответа не воскресают, квота не стирает журнал. Одновременная
 * запись в одну миллисекунду — «последний пишет» на уровне ключа: у localStorage нет
 * сравнения-и-обмена, и замок ради редкого случая владелец не просит.
 *
 * ТРОНУТОЕ (`Touch`). Каждая запись ПЕРЕЧИТЫВАЕТ свой ключ и пишет ХРАНИМОЕ ∪ ТРОНУТОЕ: строки,
 * которые ЭТА операция ставит (они побеждают) или снимает (уходят). Что вкладка лишь держит в
 * памяти, а операция не трогала, берётся ИЗ ХРАНИЛИЩА, не из памяти: устаревшая память не
 * перепишет строку соседа. Ни множеств «виденного», ни надгробий, ни часов — у двух вкладок разные
 * часы, а две записи в одну миллисекунду не порядок.
 *
 * СВОЙ СЛОЙ (A). Тронутое, которое хранилище не приняло (квота), НЕ повторяется следующей записью:
 * повтор лёг бы поверх более поздней чужой операции (A поставила X — отказ; B сняла X; следующая
 * запись A воскресила бы X). Оно ложится в `localOnly` карточки — слой ТОЛЬКО ДЛЯ ЭКРАНА: экран =
 * хранимое ∪ слой; слой не пишется; чужая запись (событие `storage`) освежает хранимую часть, а слой
 * оставляет; удавшаяся запись по тому же ключу снимает ключ из слоя; перезагрузка снимает слой
 * целиком — ровно то, что сказано человеку: «this tab keeps it until reload». Правка по ключу,
 * который лежит в слое, идёт ОТ строки слоя (она и на экране), а не от хранимой; прочие ключи — от
 * хранимого (ревью S1). Слой не больше потолков журнала (120 записей / 40 отказов на карточку):
 * старшие уходят с хвоста, и об этом сказано ещё раз.
 *
 * МЕТКА ОТВЕТА (B). Отказы принадлежат ответу: под ключом отказов лежит его метка `{seq, id}`, и
 * КАЖДОЕ тронутое — и поставленное, и снятое — несёт метку своей вкладки. Перед записью, после
 * перечитывания, выбирается ТЕКУЩАЯ метка: старший `seq`, при равном — хранимая. Метка вкладки не
 * текущая — тронутое ОТБРАСЫВАЕТСЯ, запись не делается: отказ прошлому предложению не ложится в
 * список нового, и «put it back» отставшей вкладки не снимает чужую строку. Чужую метку вкладка НЕ
 * перенимает (D-46): экран у неё показывает свой, прошлый ответ, и перенятая метка узаконила бы
 * следующий отказ прошлому предложению как отказ новому. Список на экране пуст (отказы этого
 * ответа больше нигде не хранятся), метка остаётся своей, человеку сказано один раз за эпизод, и
 * новую метку вкладка получает только своим GENERATE (`clearDismissed`): `seq` = старший из
 * известных + 1 и свежий `id`, запись без проверки — это и есть новый ответ.
 *
 * ПОТОЛКИ И КВОТА (C, E). Лестница журнала при отказе квоты ужимает список отказов до одной метки,
 * но ключ не снимает: снятая метка отдала бы отставшей вкладке следующий ответ. Что легло с потерей
 * (срез ста двадцати, облегчённая копия, десять новейших отказов) — то и память: писатель
 * возвращает ровно положенное.
 *
 * ЧУЖОЕ СВОЙСТВО (D-47). Сборка 1931c256 вшивала отказы в блоб журнала (`dismissed`), но до беты не
 * дошла, и переезда нет: чужое свойство блоба не читается, а следующая запись журнала кладёт блоб
 * без него.
 *
 * ПОРЧА (F). Метка из хранилища — только безопасное целое ≥ 0 и строка; иначе блоб отказов читается
 * как отсутствующий, и GENERATE открывает ответ 1, а не «2^53 + 1 === 2^53».
 */
const idOf = (f: Fill) => f.id;
const rowOf = (d: Dismissal) => d.row;
const isNothing = (t: Touch<unknown>) => !t.put.length && !t.drop.length;

/** Хранимое ∪ тронутое: снятое уходит, поставленное встаёт на своё место, новое — в голову. */
function overlay<T>(stored: T[], t: Touch<T>, keyOf: (x: T) => string): T[] {
  const drop = new Set(t.drop);
  const put = new Map(t.put.map((x) => [keyOf(x), x] as const));
  const present = new Set(stored.map(keyOf));
  const fresh = t.put.filter((x) => !present.has(keyOf(x)));
  const kept = stored.filter((x) => !drop.has(keyOf(x))).map((x) => put.get(keyOf(x)) ?? x);
  return fresh.length ? [...fresh, ...kept] : kept;
}

/** Слой ∪ новое тронутое: новое побеждает по ключу и стоит первым — новейшее в голову журнала. */
function joinTouch<T>(older: Touch<T>, newer: Touch<T>, keyOf: (x: T) => string): Touch<T> {
  if (isNothing(older)) return newer;
  const taken = new Set([...newer.put.map(keyOf), ...newer.drop]);
  return {
    put: [...newer.put, ...older.put.filter((x) => !taken.has(keyOf(x)))],
    drop: [...newer.drop, ...older.drop.filter((k) => !taken.has(k))],
  };
}

/** Слой без ключей, которые легли: удавшаяся запись по ключу снимает его из своего слоя. */
function withoutKeys<T>(layer: Touch<T>, done: Touch<T>, keyOf: (x: T) => string): Touch<T> {
  if (isNothing(layer)) return layer;
  const gone = new Set([...done.put.map(keyOf), ...done.drop]);
  const put = layer.put.filter((x) => !gone.has(keyOf(x)));
  const drop = layer.drop.filter((k) => !gone.has(k));
  return put.length || drop.length ? { put, drop } : NOTHING;
}

/**
 * Свой слой в потолке журнала (ревью S1, Low): столько же строк и снятых ключей, сколько хранилище
 * держит записей (120) или отказов (40); старшие уходят с хвоста — новое стоит в голове.
 */
function boundTouch<T>(t: Touch<T>, cap: number): { touch: Touch<T>; evicted: boolean } {
  if (t.put.length <= cap && t.drop.length <= cap) return { touch: t, evicted: false };
  return { touch: { put: t.put.slice(0, cap), drop: t.drop.slice(0, cap) }, evicted: true };
}

/** Восемь случайных знаков для метки ответа. */
function freshId(): string {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(8);
  try {
    crypto.getRandomValues(bytes);
  } catch {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => abc[b % abc.length]).join('');
}

const sameToken = (a: AnswerToken, b: AnswerToken) => a.seq === b.seq && a.id === b.id;

/** Текущий ответ из двух меток: старший `seq`; при равном — хранимая (она легла, вторая нет). */
function currentToken(memory: AnswerToken, stored: AnswerToken): AnswerToken {
  return memory.seq > stored.seq ? memory : stored;
}

const sameList = (a: unknown[], b: unknown[]) =>
  a.length === b.length && JSON.stringify(a) === JSON.stringify(b);

/**
 * Отказы на экране при перечитанном ключе. Хранимая метка новее своей (или тот же `seq`, но не
 * наш `id`) — соседняя вкладка сделала GENERATE: отказы этой вкладки больше нигде не хранятся,
 * список пуст, свой слой отказов снят, метка ОСТАЁТСЯ своей (D-46), сказано один раз за эпизод —
 * если вкладке вообще есть что терять (нулевая метка — ответа не было). Своя метка текущая —
 * хранимый список её же, либо прошлого ответа, и тогда его нет.
 */
function settleDismissed(card: number, m: CardMemory, stored: StoredDismissed | null): CardMemory {
  const st = stored?.token ?? ZERO_TOKEN;
  if (!sameToken(currentToken(m.token, st), m.token)) {
    if (m.token.seq > 0) answerStale(card);
    if (!m.dismissed.length && isNothing(m.localOnly.dismissed)) return m;
    return { ...m, dismissed: [], localOnly: { ...m.localOnly, dismissed: NOTHING } };
  }
  const list = stored && sameToken(st, m.token) ? stored.list : [];
  return { ...m, dismissed: overlay(list, m.localOnly.dismissed, rowOf) };
}

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
  /** Новый ответ прогона — новая метка, отказы прошлого ответа обнуляются, как квитанции (D5). */
  clearDismissed: (card: number) => void;
  /** Чужая вкладка записала ключ карточки (событие `storage`) — память освежается из хранилища. */
  refresh: (card: number, which: 'fills' | 'dismissed') => void;
  /**
   * `known` — колорвеи, уже сохранённые на карточке (T06): совпавшее с ними предложение не встаёт,
   * как и совпавшее с подтверждённым в этой памяти.
   */
  setProposals: (card: number, list: ProposedColourway[], known?: ColourwayIdentity[]) => void;
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
 * сделанная до первого чтения, затёрла бы в хранилище записи прошлого сеанса. До подъёма память
 * карточки пуста по построению (всякая правка идёт через `edit`, а он поднимает первым делом), так
 * что подъём — это чтение обоих ключей и ничего больше: метка ответа берётся хранимая — это
 * единственный момент, когда вкладка берёт метку не своим GENERATE (у неё ещё нет ответа).
 */
function memoryOf(state: Store, card: number): CardMemory {
  const cur = state.byCard[card] ?? EMPTY;
  if (state.hydrated[card] || !(card > 0)) return cur;
  const stored = readDismissedBlob(card);
  return {
    ...cur,
    fills: readFillsBlob(card),
    token: stored?.token ?? ZERO_TOKEN,
    dismissed: stored?.list ?? [],
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

/** Строка-основа правки по ключу: своя из слоя (она и на экране), иначе хранимая, иначе память. */
type BaseOf = (id: string) => Fill | undefined;

/**
 * Правка ЖУРНАЛА — та же `edit`, плюс перечитывание ключа и запись «хранимое ∪ тронутое» (см.
 * «ДВЕ ВКЛАДКИ»). `touch` называет тронутое по памяти вкладки И по хранимому; строку, которую
 * операция меняет по ключу, даёт `base`: своя из слоя, если хранилище её не приняло (человек видит
 * и принимает ЕЁ — ревью S1), иначе хранимая (там она новее памяти), иначе память.
 * Побочный эффект внутри апдейтера законен: zustand зовёт его ровно один раз (это не апдейтер
 * React под StrictMode). Легло — память = положенное ∪ свой слой без ключей, которые легли (E);
 * не влезло — тронутое уходит в свой слой (A) в потолке журнала, человеку сказано, хранилище не
 * тронуто.
 */
function editFills(
  state: Store,
  card: number,
  touch: (mine: Fill[], stored: Fill[], base: BaseOf) => Touch<Fill>,
): Partial<Store> {
  return edit(state, card, (m) => {
    const stored = readFillsBlob(card);
    const local = m.localOnly.fills;
    const base: BaseOf = (id) =>
      local.put.find((f) => f.id === id) ??
      stored.find((f) => f.id === id) ??
      m.fills.find((f) => f.id === id);
    const t = touch(m.fills, stored, base);
    if (isNothing(t)) return m;
    const next = overlay(stored, t, idOf);
    const w = writeFills(card, next);
    // Список отказов ужат ради места (C): вкладка забывает свои хранимые отказы тем же шагом.
    const dismissed = w.shrank ? overlay([], m.localOnly.dismissed, rowOf) : m.dismissed;
    if (w.stored) {
      storeWorked(card);
      const kept = withoutKeys(local, t, idOf);
      const fills = overlay(w.stored, kept, idOf);
      return { ...m, fills, dismissed, localOnly: { ...m.localOnly, fills: kept } };
    }
    const grown = boundTouch(joinTouch(local, t, idOf), MAX_STORED);
    storeRefused(card, grown.evicted);
    const fills = overlay(stored, grown.touch, idOf);
    return { ...m, fills, dismissed, localOnly: { ...m.localOnly, fills: grown.touch } };
  });
}

/**
 * Правка ОТКАЗОВ (O-39) — та же `edit` под своим ключом, за оградой метки ответа (B). `clear` —
 * новый ответ: метка `seq` + 1 к старшему из известных со свежим `id`, список пуст по построению,
 * запись без проверки, эпизод «чужой ответ новее» закрыт. Иначе тронутое несёт метку ПАМЯТИ
 * вкладки, и если текущая (после перечитывания) — не она, тронутое отброшено, список пуст, метка
 * своя (D-46, `settleDismissed`).
 */
function editDismissed(
  state: Store,
  card: number,
  touch: (mine: Dismissal[], base: Dismissal[]) => Touch<Dismissal>,
  clear = false,
): Partial<Store> {
  return edit(state, card, (m) => {
    const stored = readDismissedBlob(card);
    const st = stored?.token ?? ZERO_TOKEN;
    // База — хранимый список, если он ЭТОГО ответа; у нового ответа и у прошлого чужого базы нет.
    const base = !clear && stored && sameToken(st, m.token) ? stored.list : [];
    const own = touch(m.dismissed, base);
    if (!clear && !sameToken(currentToken(m.token, st), m.token)) {
      return settleDismissed(card, m, stored);
    }
    if (clear) answerFresh(card);
    const token = clear ? { seq: Math.max(m.token.seq, st.seq) + 1, id: freshId() } : m.token;
    const t = { put: own.put.map(boundDismissal), drop: own.drop };
    if (!clear && isNothing(t)) return m;
    const list = overlay(base, t, rowOf).slice(0, MAX_DISMISSED);
    const kept = writeDismissed(card, { token, list });
    if (kept) {
      storeWorked(card);
      const local = clear ? NOTHING : withoutKeys(m.localOnly.dismissed, t, rowOf);
      const dismissed = overlay(kept, local, rowOf);
      return { ...m, token, dismissed, localOnly: { ...m.localOnly, dismissed: local } };
    }
    const grown = clear
      ? { touch: NOTHING as Touch<Dismissal>, evicted: false }
      : boundTouch(joinTouch(m.localOnly.dismissed, t, rowOf), MAX_DISMISSED);
    storeRefused(card, grown.evicted);
    const dismissed = overlay(base, grown.touch, rowOf);
    return { ...m, token, dismissed, localOnly: { ...m.localOnly, dismissed: grown.touch } };
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
      editFills(s, card, (_mine, _stored, base) => ({
        put: [mergeFill(base(fill.id), fill)],
        drop: [],
      })),
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
      editFills(s, card, (_mine, _stored, base) => {
        const put: Fill[] = [];
        for (const id of ids) {
          const row = base(id);
          if (row && !row.accepted) put.push({ ...row, accepted: true });
        }
        return put.length ? { put, drop: [] } : NOTHING;
      }),
    ),

  /* ОТКАЗЫ (O-39): по ключу строки, новейший первым; повтор по тому же ключу заменяет запись;
     строки — в потолках, метка ответа — памяти вкладки (`editDismissed`). */
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

  /* ЧУЖАЯ ЗАПИСЬ (событие `storage` из другой вкладки): хранимая часть освежается, свой слой
     остаётся (A); чужой ответ новее своего — список пуст, метка своя, сказано (D-46). Неподнятая
     карточка не освежается — её поднимет первое обращение. */
  refresh: (card, which) =>
    set((s) => {
      const cur = s.byCard[card];
      if (!cur || !s.hydrated[card]) return {};
      const next =
        which === 'fills'
          ? { ...cur, fills: overlay(readFillsBlob(card), cur.localOnly.fills, idOf) }
          : settleDismissed(card, cur, readDismissedBlob(card));
      if (
        sameToken(next.token, cur.token) &&
        sameList(next.fills, cur.fills) &&
        sameList(next.dismissed, cur.dismissed)
      )
        return {};
      return { byCard: { ...s.byCard, [card]: next } };
    }),

  /**
   * НОВЫЙ ОТВЕТ ЗАМЕНЯЕТ ПРЕДЛОЖЕНИЯ, НО НЕ КВИТАНЦИИ ПОДТВЕРЖДЁННЫХ.
   *
   * Предложение — это предложение, и второй прогон вправе предложить другое. А квитанция
   * `confirmed` называет НАСТОЯЩИЙ ПРОДУКТ, уже созданный на сервере: стереть её значило бы
   * предложить создать его второй раз. Отклонённые уходят вместе со своим предложением — отказ
   * был отказом ЭТОМУ предложению, а не цвету навсегда.
   */
  setProposals: (card, list, known = []) =>
    set((s) =>
      edit(s, card, (m) => {
        const kept: Record<string, ColourwayVerdict> = {};
        for (const [id, v] of Object.entries(m.verdicts))
          if (v.status === 'confirmed') kept[id] = v;
        // T06: подтверждённое — это продукт; новый ответ не предлагает его второй раз, даже пока
        // перечитанная карточка его ещё не несёт. Повтор ТОГО ЖЕ ответа (те же id) несёт и само
        // подтверждённое — оно остаётся, его квитанция и так прячет его рядом с сохранённым рядом.
        const confirmed = m.proposals.filter((p) => kept[p.id]).map(proposalIdentity);
        const fresh = new Set(
          withoutKnownColourways(list, [...known, ...confirmed]).map((p) => p.id),
        );
        return {
          ...m,
          proposals: list.filter((p) => kept[p.id] || fresh.has(p.id)),
          verdicts: kept,
        };
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
