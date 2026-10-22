import { violationReason } from 'utils/field-errors';

import { operationFieldNames } from './schema';

// АУДИТ ПРИСУТСТВИЯ — «Я ОТПРАВИЛ ЭТО ЗАПОЛНЕННЫМ; ВЕРНУЛОСЬ ЛИ ОНО ЗАПОЛНЕННЫМ».
//
// Ф2 сделала admin-гейтвей громким: незнакомое поле и незнакомый член словаря дают 400 с именем
// виновника. Но громкость живёт ТОЛЬКО там, где стоит новый бинарь. Два окна остаются открытыми и
// после неё:
//   1. прод до ручного деплоя владельца — там гейтвей всё ещё глотает незнакомое молча;
//   2. откат DO на предыдущий бинарь при провале выкатки — `readyz` отвечает 200 и врёт.
// В обоих окнах сохранение отвечает «ок», а часть фактов шага просто не доезжает: операции
// пишутся ПОЛНОЙ ЗАМЕНОЙ, стабильного ключа у строки шага нет — непринятое поле становится NULL.
// Эта утилита — единственная сеть под обоими окнами: она сверяет отправленное с прочитанным
// СРАЗУ после сохранения, пока значения ещё в форме.
//
// СРАВНИВАЮТСЯ ПРИСУТСТВИЯ, НИКОГДА ЗНАЧЕНИЯ. Сервер канонизирует: `fusible_patch` приезжает
// как `patch`, децимал `4.0` — как `4`, незаданный член — нулевым именем словаря. Сравнение
// значений подняло бы тревогу на каждой такой паре, и первая же ложная тревога научила бы
// человека не читать баннер. Вопрос здесь ровно один и он двоичный: было заполнено — осталось ли
// заполненным.
//
// СПИСОК ПОЛЕЙ — ИЗ САМОЙ ZOD-СХЕМЫ (`operationFieldNames`), тот же источник, что у пробы круга
// Ф4. Второй, выписанный руками, разошёлся бы с первым молча — ровно в день, когда волна добавит
// поле, и ровно на том поле, которого ни один из двух не проверит.

// Поля шага, которые аудит НЕ ведёт, и почему. Список ЗАКРЫТЫЙ: всё остальное из схемы
// проверяется, и новое поле волны попадает под аудит само, без правки этого файла.
export const PRESENCE_NOT_AUDITED = new Set<string>([
  // Номер шага назначает СЕРВЕР: маппер записи пересчитывает его как (позиция+1)*10, и форма
  // отправляет то, что прочитала. «Потерять» его нельзя, а расхождение означало бы перестановку
  // шагов, а не потерю факта.
  'operationNumber',
  // ЧЕТЫРЕ ПОЛЯ НИЖЕ СЕРВЕР СНИМАЕТ ЗАКОННО И МОЛЧА — это канонизация, а не версия. Считать их
  // потерей значило бы поднимать «бэкенд старой версии, не закрывайте вкладку» на обычном
  // сохранении — и, поскольку сброс после записи МЕРДЖИТ отправленное обратно в форму, снятое
  // сервером значение остаётся в ней и тревога повторялась бы на КАЖДОМ следующем сохранении той
  // же карточки. Первый же такой баннер-волк научил бы человека не читать настоящий.
  // Слепоты исключения не добавляют: все четыре поля старше обоих окон расхождения (машинки и ВТО
  // 0306 и узлы сборки 0307 на проде с 2026-08-16, выноски ещё раньше), то есть терять их старому
  // бинарю не на чем.
  //
  // Ключ профиля парка, не нашедшийся в парке карточки, ОТЦЕПЛЯЕТСЯ без нарушения
  // (`resolveProfileKey`, internal/dto/techcard_equipment.go — ветка «detach»): почистили парк —
  // ссылка со шага снимается при следующем сохранении. Профиль НЕВЕРНОГО ТИПА при этом отвергается
  // громко (`profile_type_mismatch`) и до аудита не доходит.
  'machineProfileKey',
  'pressProfileKey',
  // Имя узла живёт на ПЕРВОМ производителе: у поглощающего шага сервер стирает его НАРОЧНО
  // (`normalizeUnitNames`, internal/dto/techcard_assembly.go — «повторённое имя было бы вторым
  // мнением о том же факте»). Потерю самого УЗЛА аудит ловит по `outputUnitKey` — тот не исключён,
  // а бинарь, не знающий имени, не знает и ключа.
  'outputUnitName',
  // Ссылка на выноску эскиза, которой больше нет, РАЗРЕШАЕТСЯ ДЕТАШЕМ (S8, callout-sync: «a
  // reference to a callout that no longer exists DETACHES — the link is cleared, the operation
  // survives», internal/dto/techcard_production.go): чистка эскиза не блокируется устаревшим
  // кросс-референсом и не объявляется расхождением версий.
  'calloutNumber',
]);

// Имена полей шага, за присутствием которых следит аудит.
export function operationPresenceFields(): string[] {
  return operationFieldNames().filter((n) => !PRESENCE_NOT_AUDITED.has(n));
}

// ЗАПОЛНЕНО ЛИ ЗНАЧЕНИЕ — ОДНО ОПРЕДЕЛЕНИЕ НА ДВЕ ЗАДАЧИ.
//
// Тем же предикатом классификатор Ф5 отвечает на вопрос «противоречит ли отказ экрану»: сервер
// говорит `required` про поле, которое форма держит заполненным. Два разных ответа на вопрос
// «что такое заполнено» развели бы баннер расхождения версий и аудит присутствия — и разошлись
// бы они на границе, где ошибиться легче всего: нулевой член словаря, ноль, пустой децимал.
//
// Токен `*_UNKNOWN` — это «никто не сказал», а не значение: он приезжает с провода у КАЖДОГО
// незаполненного словарного поля (EmitUnpopulated), и считать его присутствием значило бы
// объявить заполненным весь шаг целиком.
export function isPresent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') {
    const t = value.trim();
    return t !== '' && !t.endsWith('_UNKNOWN');
  }
  // 0 у числового поля шага — это «не задано» (число ниток, номер иглы, номер выноски): нулевого
  // значения ни у одного из них не бывает. Децимал приходит СТРОКОЙ и разбирается веткой выше,
  // где '0' — настоящая величина («кроить по линии как нарисовано»).
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
  // Булево: `false` — настоящий ответ («утюжить сухим»), а «никто не сказал» приходит undefined
  // и отсеяно первой строкой. Свернуть их в одно значило бы стереть ровно ту разницу, ради
  // которой поле держат необязательным.
  if (typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.some((v) => isPresent(v));
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some((v) => isPresent(v));
  }
  return false;
}

export type PresenceLoss = {
  // Индекс шага в форме (0-базовый) — тот же, что в пути RHF.
  step: number;
  // Имя поля шага без префикса.
  field: string;
  // Полный путь RHF: `operations.3.threadCount`. Тем же путём адресуют поле роутер серверных
  // ошибок и строки полосы остатков — человеку показывается ОДИН адрес, а не два.
  path: string;
};

export type PresenceAudit = {
  // Steps the operator owns on each side — the server-managed Fusing steps are not counted (below).
  sentSteps: number;
  readSteps: number;
  losses: PresenceLoss[];
  // Which read step each sent step came back as: `pairs[sentIndex] = readIndex`, -1 for none.
  pairs: number[];
};

export function hasPresenceLoss(audit: PresenceAudit): boolean {
  return audit.losses.length > 0 || audit.sentSteps !== audit.readSteps;
}

type OpLike = Record<string, unknown>;

// ─── STEPS THE SERVER MANAGES ITSELF ─────────────────────────────────────────────────────────────
// The backend reconciles automatic FUSING steps inside every card write that moves a piece's fuse
// markup or an INTERLINING BOM line (ReconcileFusingOps): it inserts them, moves them to the FRONT of
// the order, links pieces into them, deletes the empty ones and renumbers the rest. Such a step is
// a draft FUSING step. Its appearing, moving, relinking or disappearing is the server doing its job,
// never a fact this form lost — so it is left out of the count and of the field check.
const FUSING = 'TECH_CARD_OPERATION_TYPE_FUSING';
export const isServerManagedStep = (op: OpLike | undefined): boolean =>
  !!op && op.operationType === FUSING && op.draft === true;

// Fields of a FUSING step the reconciliation rewrites on purpose (a piece unfused is unlinked from
// its step) — on a reviewed Fusing step they are not audited either.
const FUSING_RECONCILED = new Set<string>(['inputKeys']);

// ─── WHICH SENT STEP CAME BACK AS WHICH ──────────────────────────────────────────────────────────
// A step has no id on the wire, so the pairing is by CONTENT, and by the one thing the server
// guarantees: the steps it does not manage keep their relative order. Two passes:
//   1. anchors — the longest common subsequence of the steps' signatures (type, zone, the unit
//      the step makes, the pieces/units it joins, its BOM lines: facts older than either window of
//      the version skew, so a backend that drops a newer field does not break the pairing);
//   2. the gaps between two anchors are paired in order — a step whose signature moved (a lost
//      input key, a reviewed Fusing step relinked) still pairs with its neighbour-bound twin.
// Index pairing, which this replaces, shifted every step behind two server-added Fusing steps and
// reported 109 «lost» fields on a save that lost nothing.
const keyList = (v: unknown) =>
  Array.isArray(v)
    ? v
        .map((x) => String(x ?? '').trim())
        .filter(Boolean)
        .sort()
        .join(',')
    : '';
const signatureOf = (op: OpLike) =>
  [
    String(op.operationType ?? ''),
    String(op.zone ?? ''),
    String(op.outputUnitKey ?? '').trim(),
    op.operationType === FUSING ? '' : keyList(op.inputKeys),
    keyList(op.bomLineKeys),
  ].join('|');

function alignSteps(
  sent: ReadonlyArray<OpLike>,
  read: ReadonlyArray<OpLike>,
  sentIdx: number[],
  readIdx: number[],
): number[] {
  const pairs = sent.map(() => -1);
  const a = sentIdx.map((i) => signatureOf(sent[i] ?? {}));
  const b = readIdx.map((i) => signatureOf(read[i] ?? {}));
  const n = a.length;
  const m = b.length;
  // LCS table, suffix form: lcs[i][j] = LCS of a[i..] and b[j..].
  const lcs: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const anchors: [number, number][] = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (a[i] === b[j]) {
      anchors.push([i, j]);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) i++;
    else j++;
  }
  // Gaps between anchors (and before the first / after the last), paired in order.
  let pi = 0;
  let pj = 0;
  for (const [ai, aj] of [...anchors, [n, m] as [number, number]]) {
    for (let k = 0; pi + k < ai && pj + k < aj; k++) pairs[sentIdx[pi + k]] = readIdx[pj + k];
    if (ai < n) pairs[sentIdx[ai]] = readIdx[aj];
    pi = ai + 1;
    pj = aj + 1;
  }
  return pairs;
}

// Сверяет отправленное с прочитанным В КООРДИНАТАХ ФОРМЫ: обе стороны — строки формы, а не тела
// провода. Прочитанное уже прошло `mapTechCardToForm`, отправленное пришло из той же формы, что
// им и заполнялась, — значит словарь чтения у обеих сторон один, и канонизация не даёт ложных
// срабатываний по построению.
//
// `step` and `path` of a loss are in SENT coordinates; `mergeOperationsAfterSave` moves them into
// the coordinates of the list the form is reset to.
export function auditOperationPresence(
  sent: ReadonlyArray<OpLike> | undefined,
  read: ReadonlyArray<OpLike> | undefined,
): PresenceAudit {
  const sentOps = sent ?? [];
  const readOps = read ?? [];
  const sentIdx = sentOps.flatMap((op, i) => (isServerManagedStep(op) ? [] : [i]));
  const readIdx = readOps.flatMap((op, i) => (isServerManagedStep(op) ? [] : [i]));
  const pairs = alignSteps(sentOps, readOps, sentIdx, readIdx);
  const fields = operationPresenceFields();
  const losses: PresenceLoss[] = [];
  for (const i of sentIdx) {
    const before = sentOps[i] ?? {};
    // Шага может не быть вовсе — тогда потеряно КАЖДОЕ его заполненное поле, и назвать их
    // поимённо честнее, чем сказать «шагов стало меньше» и оставить человека гадать какой.
    const after = pairs[i] >= 0 ? readOps[pairs[i]] : undefined;
    const fusing = before.operationType === FUSING;
    for (const field of fields) {
      if (fusing && FUSING_RECONCILED.has(field)) continue;
      if (!isPresent(before[field])) continue;
      if (after && isPresent(after[field])) continue;
      losses.push({ step: i, field, path: `operations.${i}.${field}` });
    }
  }
  return { sentSteps: sentIdx.length, readSteps: readIdx.length, losses, pairs };
}

// ─── THE LIST THE FORM STANDS ON AFTER A SAVE ────────────────────────────────────────────────────
// Operations are written by FULL REPLACE, and the server-managed Fusing steps are only kept by a
// write that sends them back (their private identity rides on the step number). A form reset to
// what it SENT would carry the list from before the reconciliation, and the next unrelated save
// would wipe the Fusing steps the server just made. So:
//   · nothing lost → the server's list, exactly what a reload would show;
//   · something lost (the version-skew windows above) → the server's list with every paired step
//     replaced by the SENT one (the banner promises «your values are still in the form»), an
//     unpaired server step kept only when the server manages it, each sent step that came back as
//     nothing put back after its sent predecessor, and the step number taken from the server, so
//     the Fusing identity is never claimed by another step.
export function mergeOperationsAfterSave<T extends OpLike>(
  sent: ReadonlyArray<T>,
  read: ReadonlyArray<T>,
  audit: PresenceAudit,
): { operations: T[]; audit: PresenceAudit } {
  if (!hasPresenceLoss(audit)) return { operations: [...read], audit };
  const sentOfRead = new Map<number, number>();
  audit.pairs.forEach((r, s) => {
    if (r >= 0) sentOfRead.set(r, s);
  });
  // Entries carry the sent index they stand for (-1: a server step with no sent twin).
  const entries: { op: T; sent: number }[] = read
    .map((op, r) => {
      const s = sentOfRead.get(r);
      return s === undefined
        ? { op, sent: -1 }
        : { op: { ...sent[s], operationNumber: op.operationNumber } as T, sent: s };
    })
    // Sent-centric: a read step no sent step came back as is kept only when the server manages it
    // (a draft Fusing step). Any other one is a step the operator deleted that an older backend
    // still returns — kept, it would come back into the form settled as clean.
    .filter((e) => e.sent >= 0 || isServerManagedStep(e.op));
  sent.forEach((op, s) => {
    if (audit.pairs[s] >= 0 || isServerManagedStep(op)) return;
    // After the nearest sent predecessor already placed; at the front of the operator's steps if
    // there is none.
    let at = -1;
    for (let k = entries.length - 1; k >= 0; k--) {
      if (entries[k].sent >= 0 && entries[k].sent < s) {
        at = k + 1;
        break;
      }
    }
    if (at < 0) {
      const first = entries.findIndex((e) => !isServerManagedStep(e.op));
      at = first < 0 ? entries.length : first;
    }
    entries.splice(at, 0, { op: { ...op }, sent: s });
  });
  const formIndexOfSent = new Map<number, number>();
  entries.forEach((e, k) => {
    if (e.sent >= 0) formIndexOfSent.set(e.sent, k);
  });
  const losses = audit.losses.map((l) => {
    const k = formIndexOfSent.get(l.step) ?? l.step;
    return { ...l, step: k, path: `operations.${k}.${l.field}` };
  });
  return { operations: entries.map((e) => e.op), audit: { ...audit, losses } };
}

// ─── ОТКАЗ, ПРОТИВОРЕЧАЩИЙ ЭКРАНУ (Ф5) ──────────────────────────────────────────────────────────

// Предикат «этот отказ противоречит тому, что человек видит» живёт ЗДЕСЬ, рядом с `isPresent`, и
// на то одна причина: он и аудит присутствия отвечают на ОДИН вопрос — «заполнено ли». Разведи их
// по двум файлам, и два ответа разойдутся на границе, где ошибиться легче всего (нулевой член
// словаря, ноль, `false`, пустой децимал) — а разойдясь, дадут либо ложный баннер про версии,
// либо молчание там, где карточка не сохранилась.
//
// Перехватываются РОВНО ДВЕ причины. `required` и `unknown_value` — единственные, которые сервер
// произносит про поле, НЕ ЗНАЯ его значения: он не увидел присланного члена словаря, потому что
// бинарь старше приложения. Все остальные (`not_applicable`, `needs_*`, `conflicts_with_*`) —
// законные правила ремесла: сервер значение УВИДЕЛ и отвергает по существу. Их место у контрола
// или в строке полосы остатков, и трогать их классификатору нельзя.
//
// Причина берётся машинным кодом (`violationReason`), а не поиском подстроки: «required» живёт и
// в человеческом хвосте чужого отказа («…; a required value is missing upstream»).
export function contradictsScreen(
  getValue: (formPath: string) => unknown,
): (formPath: string, violation: { description: string }) => boolean {
  return (formPath, violation) => {
    const reason = violationReason(violation.description);
    if (reason !== 'required' && reason !== 'unknown_value') return false;
    return isPresent(getValue(formPath));
  };
}
