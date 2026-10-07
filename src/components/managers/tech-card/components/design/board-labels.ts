import type {
  DesignQuizQuestion,
  common_DesignBenchSlot,
  common_DesignReference,
} from 'api/proto-http/admin';

import { MOOD_ROLES, ROLE_HINT } from './quiz-anchor';
import type { PictureTileMenu, PictureTileMenuItem } from './picture-tile';

/**
 * ═══ ЯРЛЫКИ ДОСКИ (101-MOODBOARD-ROLES, волна 11) ═══════════════════════════════════════════════
 *
 * Доска — единственное место, где лежат картинки; строка `design_reference` — ЯРЛЫК СЕРВЕРА на
 * картинке доски: какой вид она показывает (front / back / side L / side R / side) или к какой детали
 * относится. Ставит его модель после сохранения карточки, правит человек одним тапом. Здесь — только
 * чтение ярлыка в одно слово, меню плитки и вопрос «какой это вид?» для неуверенных.
 *
 * Слово модели про картинку (`modelCaption`) на плитке НЕ показывается никогда — только в «what the
 * model gets» серым «model read · not sent» (101 §2.7).
 */

/** Вид, который ставит ярлык: четыре стороны и `side` (бок без уверенности L/R, 101 Q2). */
export const LABEL_VIEWS = ['front', 'back', 'side_l', 'side_r', 'side'] as const;

const VIEW_WORD: Record<string, string> = {
  front: 'front',
  back: 'back',
  side_l: 'side L',
  side_r: 'side R',
  side: 'side',
  three_quarter_l: '3/4 L',
  three_quarter_r: '3/4 R',
};

/** Слово вида на плитке и в меню. */
export const viewWord = (role: string): string => VIEW_WORD[role] ?? role.replace(/_/g, ' ');

/**
 * `output` (M16): картинка — выход прогона дизайна (рендер, 3D, флэт…). Модель её не читает, во флэт
 * она не уходит никогда; плитка говорит `render`.
 */
export type LabelState = 'pending' | 'ok' | 'unsure' | 'failed' | 'output';

/** Состояние ярлыка; пустое (строка старше колонки) читается как ok. */
export function labelState(ref: common_DesignReference | undefined): LabelState {
  const s = (ref?.labelState ?? '').trim();
  return s === 'pending' || s === 'unsure' || s === 'failed' || s === 'output' ? s : 'ok';
}

/** Ярлык картинки: строка `design_reference` по `mediaId` (одна на карточку). */
export function labelsByMedia(
  refs: readonly common_DesignReference[] | undefined,
): Map<number, common_DesignReference> {
  const m = new Map<number, common_DesignReference>();
  for (const r of refs ?? []) if ((r.mediaId ?? 0) > 0) m.set(r.mediaId as number, r);
  return m;
}

/** Детали, к которым привязывает фото: плоский бесколорвейный верстак (как у сервера). */
export function photoDetailSlots(
  bench: readonly common_DesignBenchSlot[] | undefined,
): common_DesignBenchSlot[] {
  return (bench ?? []).filter(
    (s) =>
      (s.viewKey ?? '').trim() === 'detail' &&
      (s.kind ?? 'flat') === 'flat' &&
      !(s.colorwayId ?? 0) &&
      (s.id ?? 0) > 0,
  );
}

const detailName = (s: common_DesignBenchSlot | undefined) =>
  (s?.detailName ?? '').trim() || 'detail';

/** Ярлык поставила модель: её строку сервер перечитывает сам, когда назначение картинки сменилось. */
const byModel = (ref: common_DesignReference | undefined) =>
  ref?.labelSource === 'model_cheap' || ref?.labelSource === 'model_strong';

/** Ярлык поставил человек и он стоит (`ok`): его переносят за картинкой (кроп), модель его не трогает. */
export const isPersonLabel = (ref: common_DesignReference | undefined) =>
  !!ref && !byModel(ref) && labelState(ref) === 'ok';

/**
 * Ярлык не про это назначение: у target — деталь (или пустой ярлык модели), у detail — вид или
 * пусто. Ярлык МОДЕЛИ сервер перечитает сам (`…`); ярлык ЧЕЛОВЕКА модель не трогает никогда — его
 * переспрашивает карточка вопроса (`view ?` / `detail ?`).
 */
function mismatched(purpose: string, ref: common_DesignReference): boolean {
  const role = (ref.role ?? '').trim();
  if (purpose === 'target') return role === 'detail' || (!role && byModel(ref));
  if (purpose === 'detail') return role !== 'detail';
  return false;
}

/** Ярлык ждёт ЧЕЛОВЕКА: модель не уверена, ИИ выключен, или назначение сменили поверх его ярлыка. */
function needsPerson(purpose: string, ref: common_DesignReference | undefined): boolean {
  if (!ref || (purpose !== 'target' && purpose !== 'detail')) return false;
  const state = labelState(ref);
  if (state === 'unsure' || state === 'failed') return true;
  if (state !== 'ok') return false;
  // Деталь без слота: слот удалили с верстака — фото снова ничьё.
  if (purpose === 'detail' && (ref.role ?? '').trim() === 'detail' && !(ref.detailSlotId ?? 0))
    return true;
  return !byModel(ref) && mismatched(purpose, ref);
}

/**
 * ОДНО СЛОВО ПЛИТКИ (ярлык номера `N · слово`):
 *   · target — вид (`front`, `side L`); ярлык ещё читается — `…`; ждёт человека — `view ?`;
 *     человек сказал «не вид» — `no view`;
 *   · detail — имя детали; `…` / `detail ?` по тем же правилам;
 *   · mood / material — само назначение;
 *   · выход прогона (`output`, M16) — `render`;
 *   · без назначения — ничего (модель его предложит, `proposedPurpose`).
 */
export function tileWord(
  purpose: string,
  ref: common_DesignReference | undefined,
  slots: readonly common_DesignBenchSlot[],
): string | null {
  if (purpose === 'mood' || purpose === 'material') return purpose;
  // Выход прогона (M16): сервер его не читает и во флэт не шлёт — на любом назначении, кроме
  // mood / material, слово одно.
  if (labelState(ref) === 'output') return 'render';
  if (purpose !== 'target' && purpose !== 'detail') return null;
  if (needsPerson(purpose, ref)) return purpose === 'target' ? 'view ?' : 'detail ?';
  if (labelWaiting(purpose, ref) || !ref) return '…';
  const role = (ref.role ?? '').trim();
  if (purpose === 'target') return role ? viewWord(role) : 'no view';
  const slot = slots.find((s) => (s.id ?? 0) === (ref.detailSlotId ?? 0));
  return slot ? detailName(slot) : 'detail ?';
}

/** Ярлык ещё читается моделью — плитке есть чего ждать, полоса перечитывается. */
export function labelWaiting(purpose: string, ref: common_DesignReference | undefined): boolean {
  if (purpose === 'mood' || purpose === 'material') return false;
  if (!ref) return purpose === 'target' || purpose === 'detail' || purpose === '';
  if (labelState(ref) === 'pending') return true;
  return labelState(ref) === 'ok' && byModel(ref) && mismatched(purpose, ref);
}

// ── меню плитки: назначение и ярлык в ОДНОМ угле (101 §2.9: «второе слово в том же меню») ─────

// Назначение — голым словом (`target`, '' = none): тот же `data-menu-item`, что у прежнего `roleMenu`.
const V = 'v:';
const D = 'd:';
export const NEW_DETAIL = `${D}new`;
/** M15: the corner row that puts a held picture back into the prompt. */
const SEND_BACK = 'send:back';

/** M15 (109 §4): the person took this picture out of the prompt; `labelState` folds it into `ok`. */
export const isHeldLabel = (ref: common_DesignReference | undefined) =>
  (ref?.labelState ?? '').trim() === 'held';

export type BoardMenuPick =
  | { kind: 'purpose'; purpose: string }
  | { kind: 'view'; view: string }
  | { kind: 'detail'; slotId: number }
  | { kind: 'new-detail' };

export function parseBoardPick(value: string): BoardMenuPick | null {
  if (value.startsWith(V)) return { kind: 'view', view: value.slice(V.length) };
  if (value === NEW_DETAIL) return { kind: 'new-detail' };
  if (value.startsWith(D)) {
    const id = Number(value.slice(D.length));
    return Number.isInteger(id) && id > 0 ? { kind: 'detail', slotId: id } : null;
  }
  if (value === '' || (MOOD_ROLES as readonly string[]).includes(value))
    return { kind: 'purpose', purpose: value };
  return null;
}

/**
 * Угол плитки: слово в покое — назначение (`target ▾`, без него `role ▾`); список — четыре
 * назначения, затем (для target) виды, (для detail) детали карточки и `new detail…`. Вид человека
 * ставится тем же `SetDesignReferenceRole`, и модель его больше не трогает.
 */
export function boardMenu(input: {
  mediaId: number;
  n: number;
  purpose: string;
  ref: common_DesignReference | undefined;
  slots: readonly common_DesignBenchSlot[];
  onPick: (pick: BoardMenuPick) => void;
  /** M15: the picture was taken out of the prompt (`held`) — the first row puts it back. */
  onSendBack?: () => void;
}): PictureTileMenu {
  const { mediaId, n, purpose, ref, slots } = input;
  const role = (ref?.role ?? '').trim();
  const settled = labelState(ref) === 'ok';
  const items: PictureTileMenuItem[] = [
    ...(input.onSendBack
      ? [
          {
            value: SEND_BACK,
            label: 'send to the flat',
            title: 'it was taken out of the prompt — put it back, with its label',
          },
        ]
      : []),
    ...MOOD_ROLES.map((r) => ({
      value: r,
      label: r,
      current: purpose === r,
      title: ROLE_HINT[r],
    })),
    ...(purpose ? [{ value: '', label: 'none' }] : []),
  ];
  if (purpose === 'target') {
    LABEL_VIEWS.forEach((v, i) =>
      items.push({
        value: `${V}${v}`,
        label: viewWord(v),
        current: settled && role === v,
        divider: i === 0,
      }),
    );
    items.push({ value: V, label: 'no view', current: settled && !!ref && !role });
  }
  if (purpose === 'detail') {
    slots.forEach((s, i) =>
      items.push({
        value: `${D}${s.id}`,
        label: detailName(s),
        current: settled && role === 'detail' && (ref?.detailSlotId ?? 0) === s.id,
        divider: i === 0,
      }),
    );
    items.push({ value: NEW_DETAIL, label: 'new detail…', divider: slots.length === 0 });
  }
  return {
    label: purpose || 'role',
    ariaLabel: `role of moodboard picture ${n}`,
    items,
    onPick: (value) => {
      if (value === SEND_BACK) {
        input.onSendBack?.();
        return;
      }
      const pick = parseBoardPick(value);
      if (pick) input.onPick(pick);
    },
    'data-menu': `role:${mediaId}`,
  };
}

// ── вопрос «какой это вид?» (101 §2.3): та же карточка вопроса, что у «What is this picture?» ──

const VIEW_PREFIX = 'view:';
const DETAIL_PREFIX = 'detailq:';
export const NOT_A_VIEW = 'not a view';
export const NEW_DETAIL_OPTION = 'new detail';

/** Вопрос ярлыка — про вид или про деталь; `null` — вопрос квиза. */
export const labelKindOf = (q: DesignQuizQuestion | undefined): 'view' | 'detail' | null =>
  q?.id?.startsWith(VIEW_PREFIX) ? 'view' : q?.id?.startsWith(DETAIL_PREFIX) ? 'detail' : null;

export const isLabelQuestion = (q: DesignQuizQuestion | undefined) => labelKindOf(q) !== null;

/** Вопрос для неуверенного ярлыка картинки: вид (target) или деталь (detail). */
export function labelQuestion(
  mediaId: number,
  purpose: 'target' | 'detail',
  slots: readonly common_DesignBenchSlot[],
): DesignQuizQuestion {
  const options =
    purpose === 'target'
      ? [...LABEL_VIEWS.map(viewWord), NOT_A_VIEW]
      : [...slots.slice(0, 6).map(detailName), NEW_DETAIL_OPTION];
  return {
    id: `${purpose === 'target' ? VIEW_PREFIX : DETAIL_PREFIX}${mediaId}`,
    category: 'view',
    part: 'whole',
    family: '',
    view: '',
    kind: 'single',
    question: purpose === 'target' ? 'Which view is this?' : 'Which detail is this?',
    options,
    contradicts: options.map(() => false),
    visualEvidence: '',
    clarifyQuestion: '',
    clarifyOptions: [],
    decisionKey: '',
    mediaId,
  };
}

/** Ответ на вопрос ярлыка → то, что пишется (`SetDesignReferenceRole`). */
export function labelAnswer(
  q: DesignQuizQuestion,
  option: string,
  slots: readonly common_DesignBenchSlot[],
): BoardMenuPick | null {
  if (q.id?.startsWith(VIEW_PREFIX)) {
    if (option === NOT_A_VIEW) return { kind: 'view', view: '' };
    const v = LABEL_VIEWS.find((x) => viewWord(x) === option);
    return v ? { kind: 'view', view: v } : null;
  }
  if (option === NEW_DETAIL_OPTION) return { kind: 'new-detail' };
  const slot = slots.slice(0, 6).find((s) => detailName(s) === option);
  return slot ? { kind: 'detail', slotId: slot.id as number } : null;
}

/** Картинки, чей ярлык ждёт человека (вопрос под доской), в порядке доски. */
export function unsureOnBoard(
  board: readonly { mediaId: number; role?: string | null }[],
  labels: Map<number, common_DesignReference>,
): { mediaId: number; purpose: 'target' | 'detail' }[] {
  const out: { mediaId: number; purpose: 'target' | 'detail' }[] = [];
  const seen = new Set<number>();
  for (const item of board) {
    const purpose = (item.role ?? '').trim();
    if ((purpose !== 'target' && purpose !== 'detail') || seen.has(item.mediaId)) continue;
    seen.add(item.mediaId);
    if (needsPerson(purpose, labels.get(item.mediaId)))
      out.push({ mediaId: item.mediaId, purpose });
  }
  return out;
}

// ── предложение назначения (101 §2.4): на ПУСТОЕ назначение, ровно один раз ──────────────────

const appliedKey = (card: number) => `board-proposal-applied:${card}`;

function readApplied(card: number): Set<number> {
  try {
    const raw = window.localStorage.getItem(appliedKey(card));
    const ids = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(ids) ? ids.filter((x): x is number => typeof x === 'number') : []);
  } catch {
    return new Set();
  }
}

function writeApplied(card: number, ids: Set<number>) {
  try {
    window.localStorage.setItem(appliedKey(card), JSON.stringify([...ids].slice(-200)));
  } catch {
    /* приватное окно: предложение применится ещё раз — на пустую роль, вреда нет */
  }
}

/**
 * Какие предложения модели применить сейчас: картинка на доске с ПУСТЫМ назначением, у ярлыка есть
 * `proposedPurpose`, и это предложение ещё не применялось на этой карточке (человек, снявший роль
 * обратно в `none`, второй раз его не получит). Возвращает пары и помечает их применёнными.
 */
export function takeProposals(
  card: number,
  board: readonly { mediaId: number; role?: string | null }[],
  labels: Map<number, common_DesignReference>,
): { mediaId: number; purpose: string }[] {
  if (card <= 0) return [];
  const applied = readApplied(card);
  const out: { mediaId: number; purpose: string }[] = [];
  for (const item of board) {
    if ((item.role ?? '').trim() || applied.has(item.mediaId)) continue;
    const proposed = (labels.get(item.mediaId)?.proposedPurpose ?? '').trim();
    if (!(MOOD_ROLES as readonly string[]).includes(proposed)) continue;
    out.push({ mediaId: item.mediaId, purpose: proposed });
    applied.add(item.mediaId);
  }
  if (out.length) writeApplied(card, applied);
  return out;
}
