import type { common_DesignRun } from 'api/proto-http/admin';
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
 * `fills` — и с O-39 отклонённые строки `dismissed` (предложения колорвеев и флаг «доска ушла»
 * остаются сессионными) — пишутся в localStorage `plm.techcard.drafted.v1.<cardId>` на КАЖДОЙ правке
 * журнала и читаются при первом обращении к карточке. Ключ один: у карточки одна память, и F5 не
 * вправе вернуть «written 7» без «dismissed 2» той же строки.
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
  /** Подпись поля-адресата, как у строки TO DECIDE: `silhouette`, `fabric · main`. */
  label: string;
  /** Что предлагал черновик, уже фразой (`draftSays(...).plain`): «draft says it differently». */
  says: string;
  /** Когда, `HH:MM`. Только для глаз. */
  at: string;
};

type CardMemory = {
  fills: Fill[];
  /** Отклонённые строки ПОСЛЕДНЕГО ответа, новейшая первой (O-39). */
  dismissed: Dismissal[];
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

const storageKey = (card: number) => `${DRAFTED_STORAGE_PREFIX}${card}`;

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

/** Отклонённая строка (O-39) — четыре строки, и ничего больше не читается; пустой ключ — мусор. */
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

/** Что карточка держит в хранилище: журнал и отклонённые строки последнего ответа (O-39). */
type Stored = { fills: Fill[]; dismissed: Dismissal[] };
const NOTHING_STORED: Stored = { fills: [], dismissed: [] };

/**
 * Память карточки из хранилища. Чужой владелец, мусор, запрет хранилища — пусто. Запись без
 * `dismissed` (сборка до O-39, стенд) читается как журнал без отказов, а не как мусор.
 */
function readStored(card: number): Stored {
  if (!(card > 0)) return NOTHING_STORED;
  try {
    const raw = localStorage.getItem(storageKey(card));
    if (!raw) return NOTHING_STORED;
    const parsed = JSON.parse(raw) as {
      v?: unknown;
      owner?: unknown;
      fills?: unknown;
      dismissed?: unknown;
    } | null;
    if (!parsed || parsed.v !== 1 || parsed.owner !== card || !Array.isArray(parsed.fills))
      return NOTHING_STORED;
    return {
      fills: storedSlice(parsed.fills.filter(isStoredFill)),
      dismissed: Array.isArray(parsed.dismissed) ? parsed.dismissed.filter(isStoredDismissal) : [],
    };
  } catch {
    return NOTHING_STORED;
  }
}

/** Запись без цепочки возвратов (`prior`) — самой тяжёлой и самой необязательной её части. */
function slimFill(f: Fill): Fill {
  if (!f.prior) return f;
  const out = { ...f };
  delete out.prior;
  return out;
}

function writeStored(card: number, stored: Stored): void {
  if (!(card > 0)) return;
  const key = storageKey(card);
  const { fills, dismissed } = stored;
  const write = (list: Fill[]) =>
    localStorage.setItem(key, JSON.stringify({ v: 1, owner: card, fills: list, dismissed }));
  try {
    // Ключ снимается, когда карточке нечего помнить: ни записи, ни отказа (O-39).
    if (!fills.length && !dismissed.length) {
      localStorage.removeItem(key);
      return;
    }
    write(storedSlice(fills));
  } catch {
    /* ⚠ ПРОГЛОЧЕННЫЙ ОТКАЗ ОСТАВЛЯЛ В ХРАНИЛИЩЕ ПРОШЛУЮ ЗАПИСЬ (ревью раунда 3, MIN-4). `setItem`,
       упёршийся в квоту, не пишет ничего — и после F5 журнал поднимался из ВЧЕРАШНЕЙ копии: слова,
       которые человек уже отбросил, вставали обратно предложением «restore previous ↶». Поэтому
       второй заход — копия без цепочек возвратов (без них `✕` возврата просто забудет запись, но
       ни одно слово и ни одна пометка не потеряются), а не влезла и она — ключ снимается: пустой
       журнал после F5 честнее воскресшего. */
    try {
      write(storedSlice(fills).map(slimFill));
    } catch {
      try {
        localStorage.removeItem(key);
      } catch {
        // Запрещённое хранилище: читать из него после F5 тоже будет нечего.
      }
    }
  }
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
  /** Новый ответ прогона — отказы прошлого ответа обнуляются, как квитанции (D5). */
  clearDismissed: (card: number) => void;
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
  const stored = readStored(card);
  const have = new Set(cur.fills.map((f) => f.id));
  const fills = stored.fills.filter((f) => !have.has(f.id));
  // Отказы сеанса побеждают хранимые по ключу строки — тем же законом, что записи (O-39).
  const rows = new Set(cur.dismissed.map((d) => d.row));
  const dismissed = stored.dismissed.filter((d) => !rows.has(d.row));
  if (!fills.length && !dismissed.length) return cur;
  return {
    ...cur,
    fills: fills.length ? [...cur.fills, ...fills] : cur.fills,
    dismissed: dismissed.length ? [...cur.dismissed, ...dismissed] : cur.dismissed,
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
 * Правка ЖУРНАЛА — та же `edit`, плюс запись в хранилище. Побочный эффект внутри апдейтера
 * законен: zustand зовёт его ровно один раз (это не апдейтер React под StrictMode).
 */
function editFills(state: Store, card: number, fn: (fills: Fill[]) => Fill[]): Partial<Store> {
  return edit(state, card, (m) => {
    const fills = fn(m.fills);
    if (fills !== m.fills) writeStored(card, { fills, dismissed: m.dismissed });
    return fills === m.fills ? m : { ...m, fills };
  });
}

/** Правка ОТКАЗОВ (O-39) — та же `edit`, плюс запись в хранилище рядом с журналом. */
function editDismissed(
  state: Store,
  card: number,
  fn: (list: Dismissal[]) => Dismissal[],
): Partial<Store> {
  return edit(state, card, (m) => {
    const dismissed = fn(m.dismissed);
    if (dismissed === m.dismissed) return m;
    writeStored(card, { fills: m.fills, dismissed });
    return { ...m, dismissed };
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
      editFills(s, card, (fills) => {
        const prev = fills.find((f) => f.id === fill.id);
        const merged = mergeFill(prev, fill);
        return [merged, ...fills.filter((f) => f.id !== fill.id)];
      }),
    ),

  /**
   * ЗАПИСЬ, КАКОЙ ОНА ДОЛЖНА СТОЯТЬ, — БЕЗ СЛИЯНИЯ (раунд 3, M-A / m6). `✕` возвращает журнал к
   * прежнему состоянию (`unrestoredFill`, `poppedFill`), отказ от слов и его отмена ставят запись
   * целиком. Через `record` слияние (`mergeFill`) приняло бы прежнюю запись за новую запись
   * черновика — и понесло бы снятую поверх неё ступенью.
   */
  put: (card, fill) =>
    set((s) => editFills(s, card, (fills) => [fill, ...fills.filter((f) => f.id !== fill.id)])),

  forget: (card, id) =>
    set((s) =>
      editFills(s, card, (fills) =>
        fills.some((f) => f.id === id) ? fills.filter((f) => f.id !== id) : fills,
      ),
    ),

  forgetMany: (card, ids) =>
    set((s) =>
      editFills(s, card, (fills) => {
        const drop = new Set(ids);
        return fills.some((f) => drop.has(f.id)) ? fills.filter((f) => !drop.has(f.id)) : fills;
      }),
    ),

  accept: (card, ids) =>
    set((s) =>
      editFills(s, card, (fills) => {
        const take = new Set(ids);
        if (!fills.some((f) => take.has(f.id) && !f.accepted)) return fills;
        return fills.map((f) => (take.has(f.id) && !f.accepted ? { ...f, accepted: true } : f));
      }),
    ),

  /* ОТКАЗЫ (O-39): по ключу строки, новейший первым; повтор по тому же ключу заменяет запись. */
  dismiss: (card, d) =>
    set((s) => editDismissed(s, card, (list) => [d, ...list.filter((x) => x.row !== d.row)])),

  undismiss: (card, row) =>
    set((s) =>
      editDismissed(s, card, (list) =>
        list.some((x) => x.row === row) ? list.filter((x) => x.row !== row) : list,
      ),
    ),

  clearDismissed: (card) => set((s) => editDismissed(s, card, (list) => (list.length ? [] : list))),

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
    if (techCardId > 0) useDraftMemory.getState().hydrate(techCardId);
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
