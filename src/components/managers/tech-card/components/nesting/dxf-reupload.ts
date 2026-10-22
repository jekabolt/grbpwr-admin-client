// ПЕРЕЗАЛИВ DXF В СЛОТ, ГДЕ ЛИСТ УЖЕ ЕСТЬ (L4a, 21.10): без диалога и без вопросов.
//
// Новый файл заменяет лист слота и применяется сразу: `reconcile` → `applyPlan` → новые детали,
// алиасы и шаги (с метками `review`). Переименования и новые детали молчат; перекрой, призрак,
// разрез и перепривязка ставят метку на шаги, и метки держат релиз (сервер).
//
// Единицы и размеры НЕ спрашиваются: файл без $INSUNITS получает единицы заменяемого листа, а строка
// листа сохраняет свой size_id. Просмотр деталей после замены не открывается.
//
// Отказ — старый лист остаётся как был. Загрузка файла — только после удачного плана, так что отказ
// не оставляет на сервере ничьих файлов. Тот же sha256, что у заменяемого листа, — ничего не делать.
//
// Чистый модуль: ни React, ни формы, ни сети — всё приходит зависимостями, поэтому весь путь
// гоняется в node (scripts/dxf-reupload-check.mjs) на тех же функциях, что и в браузере.
import {
  applyPlan,
  firstMarkedOperation,
  reconcile,
  type ApplyResult,
  type CardAlias,
  type CardOperation,
  type CardPiece,
  type NewAliasSeed,
  type NewJoinSeed,
  type NewPieceSeed,
  type ParsedSheetLite,
  type ReconcileInput,
  type ReconcilePlan,
  type ReconcileScope,
} from 'lib/dxf-reconcile';
import {
  asciiDxfProblem,
  bytesToLatin1,
  latin1ToBytes,
  readInsunits,
  unitsMissing,
  writeInsunits,
} from 'lib/nesting/dxf/insunits';
import type { TechCardSeamWire } from 'lib/seams';

/** Причина снимка карточки при первом сохранении после перезалива (UpdateTechCardRequest). */
export const REUPLOAD_SNAPSHOT_REASON = 'dxf-reupload';

/**
 * Опции разбора, на которых откалибрована сверка (проба `reconcile:probe`). Свои, а не NEST_DEFAULTS:
 * пороги формы считались на этом допуске.
 */
export const RECONCILE_PARSE = { unit: 'auto', tol: 0.05, tolChain: 0.05 } as const;

/** Строка листа формы — ровно то, что читает перезалив. */
export type ReuploadSheetRow = {
  lineKey?: string;
  url?: string;
  filename?: string;
  name?: string;
  sha256?: string;
  fabricPurpose?: string;
  bomLineKey?: string;
};

export type ReuploadFile = { name: string; bytes: Uint8Array };

/** Разобранная пачка листов (как `parseSheets` / воркер) + сколько файлов не прочиталось. */
export type ParsedBatch = ParsedSheetLite & { failedFiles: number };

export type UploadedSheet = { url: string; filename: string; sizeBytes: number; sha256: string };

export type ReuploadDeps<P extends CardPiece, A extends CardAlias, O extends CardOperation> = {
  /** байты листа, который уже на карточке */
  download: (url: string) => Promise<Uint8Array>;
  /** разбор пачки одним вызовом (RECONCILE_PARSE) */
  parse: (files: readonly ReuploadFile[]) => Promise<ParsedBatch>;
  /** sha256 в нижнем hex; '' — посчитать нельзя (тогда «тот же файл» не узнаётся) */
  sha256: (bytes: Uint8Array) => Promise<string>;
  upload: (file: ReuploadFile) => Promise<UploadedSheet>;
  /**
   * листы ДРУГИХ слотов (T7: деталь переехала из другой ткани). Есть другие листы — их разбор
   * обязан удаться: сбой (throw) = отказ, а не «других листов нет» (иначе переехавшая деталь
   * заводится второй раз).
   */
  otherSheets?: () => Promise<{ scope: ReconcileScope; parse: ParsedSheetLite }[]>;
  mintKey: () => string;
  /**
   * Новая деталь. `from` — деталь карточки, от которой новая родилась (часть разреза — её родитель,
   * блок, сопоставленный старой детали, но заведённый новой строкой): форма переносит с неё свойства
   * кроя (L5 п.6). Без `from` — деталь новая по-настоящему.
   */
  makePiece: (seed: NewPieceSeed, from?: P) => P;
  makeAlias: (seed: NewAliasSeed) => A;
  makeJoin: (seed: NewJoinSeed<O>) => O;
};

export type ReuploadCard<P extends CardPiece, A extends CardAlias, O extends CardOperation> = {
  patterns: readonly ReuploadSheetRow[];
  pieces: readonly P[];
  aliases: readonly A[];
  operations: readonly O[];
  /** разрешённый ключ слота, в который бросили файл */
  scopeKey: string;
  /** привязка слота (bindingForScope) — её получают новые алиасы */
  scope: ReconcileScope;
  /** разрешённый слот привязки по сегодняшнему BOM (scopeKeyOfBinding); '' — ни к чему живому */
  scopeOf: (b: { fabricPurpose?: string; bomLineKey?: string }) => string;
  isDxf: (url: string) => boolean;
  sizeTokens: readonly string[];
  /** ссылки на деталь вне шагов (рецепт, площади, материалы детали, швы): деталь станет призраком */
  externalRefs?: Readonly<Record<string, number>>;
  /**
   * строка листа, которую заменяет файл (sheetRowId: lineKey, у старых строк — url). Задана — только
   * она; нет — единственный лист слота или лист с наибольшим числом общих блоков. Занятый слот
   * НИКОГДА не уходит в первую заливку: не нашлась строка — отказ 'target'.
   */
  target?: string;
  /** дефекты карточки: их номера шагов переезжают за вставленным join (remapIssueNumbers) */
  issues?: readonly { operationNumber?: number }[];
  /**
   * подтверждённые швы карточки (сохранённые + оптимистичные стора, провод TechCardSeam): по ним
   * сверка перемеряет швы перекроенной детали (L5a п.1). Необязательно.
   */
  seams?: readonly TechCardSeamWire[];
};

/** Идентичность строки листа: lineKey, у строк без него — url. */
export const sheetRowId = (r: ReuploadSheetRow) => (r.lineKey ?? '').trim() || (r.url ?? '');

/** Новая правда строки листа: файл другой — номер версии назначит сервер (0 = «присвой»). */
export type SheetPatch = UploadedSheet & { version: 0; uploadedAt: '' };

export type ReuploadRefusal = 'file' | 'download' | 'parse' | 'sweep' | 'upload' | 'target';

export type ReuploadOutcome<P extends CardPiece, A extends CardAlias, O extends CardOperation> =
  /** в слоте нет DXF — сегодняшний путь первой заливки (занятый слот сюда не попадает никогда) */
  | { kind: 'first' }
  /** тот же файл — ничего не делать */
  | { kind: 'noop'; rowIndex: number }
  | { kind: 'refused'; why: ReuploadRefusal; detail?: string }
  | {
      kind: 'applied';
      /** индекс заменённой строки в `card.patterns` */
      rowIndex: number;
      /** url заменённого листа — форма сверяет строку и по нему (индекс мог уехать) */
      replacedUrl: string;
      /** sheetRowId заменённой строки — форма ищет строку по нему */
      rowId: string;
      /** новые issues[].operationNumber по порядку `card.issues` (join сдвигает номера) */
      issueNumbers: number[];
      row: SheetPatch;
      pieces: P[];
      aliases: A[];
      operations: O[];
      plan: ReconcilePlan;
      result: ApplyResult<P, A, O>;
    }
  /**
   * чужой файл (план `refused: 'foreign'`, L5a п.5): карточка не меняется, файл загружен и ложится
   * ДОПОЛНИТЕЛЬНЫМ листом слота; `rowIndex` — строка, от которой он берёт размер.
   */
  | { kind: 'foreign'; rowIndex: number; row: UploadedSheet };

/**
 * План «чужой файл». До L5a в типах плана этого нет — признак читается структурно: строка
 * `'foreign'` в `refused` или `status` плана либо в `reason` отказа применения.
 */
export function isForeignPlan(plan: unknown, applied?: unknown): boolean {
  const p = (plan ?? {}) as { refused?: unknown; status?: unknown };
  const r = ((applied ?? {}) as { refused?: { reason?: unknown } | null }).refused;
  return p.refused === 'foreign' || p.status === 'foreign' || r?.reason === 'foreign';
}

const lower = (s: string | undefined) => (s ?? '').trim().toLowerCase();

/**
 * Какую строку слота заменяет файл, если строка не названа явно: единственную; из нескольких — ту,
 * с которой у файла больше общих блоков (ничья — первая по порядку). -1 — общих блоков нет ни с
 * одной (перезалив тогда отказывает, а не дописывает лист).
 */
export function pickReplacedSheet(
  oldBatch: ParsedSheetLite,
  sheetCount: number,
  newBlockNames: readonly string[],
): number {
  if (sheetCount <= 1) return sheetCount === 1 ? 0 : -1;
  const want = new Set(newBlockNames.map(lower).filter(Boolean));
  const seen = Array.from({ length: sheetCount }, () => new Set<string>());
  for (const p of oldBatch.pieces) {
    const i = p.fileIndex ?? -1;
    const b = lower(p.blockName);
    if (i >= 0 && i < sheetCount && b && want.has(b)) seen[i].add(b);
  }
  let best = -1;
  let score = 0;
  seen.forEach((s, i) => {
    if (s.size > score) {
      best = i;
      score = s.size;
    }
  });
  return best;
}

/** Единицы заменяемого листа — в новый файл, если у нового их нет. Иначе байты как есть. */
export function inheritUnits(next: Uint8Array, replaced: Uint8Array): Uint8Array {
  const text = bytesToLatin1(next);
  if (!unitsMissing(text)) return next;
  const old = bytesToLatin1(replaced);
  if (unitsMissing(old)) return next;
  return latin1ToBytes(writeInsunits(text, readInsunits(old)!));
}

// Деталь, рождённая от детали карточки (часть разреза), берёт её крой: долевую, градацию, дублирование,
// материалы по расцветкам и примечание («cut on fold» — указание производству; чистый разрез без
// метки, и потерю никто бы не увидел). Имя и выноска — свои.
const BORN_CUT_KEYS = [
  'grainline',
  'fused',
  'ungraded',
  'fusingMode',
  'fusingWidthMm',
  'materials',
  'note',
] as const;
type BornCutKey = (typeof BORN_CUT_KEYS)[number];

/** Поля кроя родителя для рождённой детали; только заданные, материалы — копиями. */
export function inheritedCut<P extends object>(
  from: P | undefined,
): Partial<Pick<P, Extract<keyof P, BornCutKey>>> {
  const out: Record<string, unknown> = {};
  if (!from) return out as Partial<Pick<P, Extract<keyof P, BornCutKey>>>;
  const src = from as Record<string, unknown>;
  for (const k of BORN_CUT_KEYS) {
    const v = src[k];
    if (v === undefined) continue;
    out[k] = Array.isArray(v) ? v.map((m) => (m && typeof m === 'object' ? { ...m } : m)) : v;
  }
  return out as Partial<Pick<P, Extract<keyof P, BornCutKey>>>;
}

const sheetName = (r: ReuploadSheetRow, i: number) =>
  (r.name ?? '').trim() || (r.filename ?? '').trim() || `sheet ${i + 1}`;

/**
 * Перезалив одного DXF в слот. Ничего не пишет в форму — возвращает, что писать (`applied`), или
 * почему нечего. Загружает файл на сервер ТОЛЬКО в `applied`.
 */
export async function reuploadSheet<
  P extends CardPiece,
  A extends CardAlias,
  O extends CardOperation,
>(
  card: ReuploadCard<P, A, O>,
  file: ReuploadFile,
  deps: ReuploadDeps<P, A, O>,
): Promise<ReuploadOutcome<P, A, O>> {
  const rows = card.patterns.flatMap((r, i) =>
    r.url && card.isDxf(r.url) && card.scopeOf(r) === card.scopeKey ? [{ r, i }] : [],
  );
  if (rows.length === 0) return { kind: 'first' };
  // Явная строка: только она. Её нет среди листов слота — отказ, не первая заливка.
  const want = (card.target ?? '').trim();
  const pinned = want ? rows.findIndex((x) => sheetRowId(x.r) === want) : -1;
  if (want && pinned < 0) return { kind: 'refused', why: 'target' };

  const problem = asciiDxfProblem(file.bytes);
  if (problem) return { kind: 'refused', why: 'file', detail: problem };

  // Тот же файл по записанному дайджесту — без единого скачивания.
  const rawSha = lower(await deps.sha256(file.bytes));
  const storedSame = rawSha ? rows.find((x) => lower(x.r.sha256) === rawSha) : undefined;
  if (storedSame) return { kind: 'noop', rowIndex: storedSame.i };

  let olds: Uint8Array[];
  try {
    olds = await Promise.all(rows.map((x) => deps.download(x.r.url!)));
  } catch (e) {
    return { kind: 'refused', why: 'download', detail: e instanceof Error ? e.message : String(e) };
  }
  // Строка без записанного дайджеста (до 0423) — считаем по скачанным байтам.
  const oldShas = await Promise.all(
    rows.map(async (x, k) => lower(x.r.sha256) || lower(await deps.sha256(olds[k]))),
  );
  const rawHit = rawSha ? oldShas.indexOf(rawSha) : -1;
  if (rawHit >= 0) return { kind: 'noop', rowIndex: rows[rawHit].i };

  const oldFiles = rows.map((x, k) => ({ name: sheetName(x.r, k), bytes: olds[k] }));
  const oldParse = await deps.parse(oldFiles);
  if (oldParse.failedFiles > 0) return { kind: 'refused', why: 'parse', detail: 'old sheet' };

  let t = pinned >= 0 ? pinned : 0;
  if (pinned < 0 && rows.length > 1) {
    const alone = await deps.parse([file]);
    if (alone.failedFiles > 0 || alone.pieces.length === 0)
      return { kind: 'refused', why: 'parse', detail: 'new file' };
    t = pickReplacedSheet(oldParse, rows.length, alone.blockNames);
    // Ни одного общего блока: какой лист меняется — не угадать. Занятый слот не дописывается.
    if (t < 0) return { kind: 'refused', why: 'target' };
  }

  const bytes = inheritUnits(file.bytes, olds[t]);
  const sha = bytes === file.bytes ? rawSha : lower(await deps.sha256(bytes));
  if (sha && sha === oldShas[t]) return { kind: 'noop', rowIndex: rows[t].i };

  const newFiles = oldFiles.map((f, k) => (k === t ? { name: file.name, bytes } : f));
  const newParse = await deps.parse(newFiles);
  if (newParse.failedFiles > 0 || newParse.pieces.length === 0)
    return { kind: 'refused', why: 'parse', detail: 'new file' };

  let otherSheets: { scope: ReconcileScope; parse: ParsedSheetLite }[];
  try {
    otherSheets = (await deps.otherSheets?.()) ?? [];
  } catch (e) {
    return {
      kind: 'refused',
      why: 'parse',
      detail: `other sheets: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // Дайджест набора слота: старый и новый различаются ровно заменённым файлом. Без дайджеста
  // (нет WebCrypto) — null: «тот же набор» не утверждается.
  const all = (list: string[]) => (list.every(Boolean) ? list.join(',') : null);
  // `seams` — поле L5a; до него ReconcileInput его не знает, и тип расширяется здесь.
  const input: ReconcileInput<P, A, O> & { seams?: readonly TechCardSeamWire[] } = {
    scope: card.scope,
    pieces: card.pieces,
    aliases: card.aliases,
    operations: card.operations,
    oldSheet: { parse: oldParse, sha256: all(oldShas) },
    newSheet: { parse: newParse, sha256: all(oldShas.map((s, k) => (k === t ? sha : s))) },
    sizeTokens: card.sizeTokens,
    externalRefs: card.externalRefs,
    otherSheets,
    aliasInScope: (a) => card.scopeOf(a) === card.scopeKey,
    // Несколько листов в слоте: «чужой файл» решается по заменяемому листу, не по всему слоту.
    ...(rows.length > 1 ? { targetFileIndex: t } : {}),
    ...(card.seams ? { seams: card.seams } : {}),
  };
  const plan = reconcile(input);
  if (plan.status === 'noop') return { kind: 'noop', rowIndex: rows[t].i };
  const foreign = async (): Promise<ReuploadOutcome<P, A, O>> => {
    try {
      return {
        kind: 'foreign',
        rowIndex: rows[t].i,
        row: await deps.upload({ name: file.name, bytes }),
      };
    } catch (e) {
      return { kind: 'refused', why: 'upload', detail: e instanceof Error ? e.message : String(e) };
    }
  };
  if (isForeignPlan(plan)) return foreign();
  // Новая деталь, рождённая от детали карточки: строка плана со старой деталью и блоком без детали
  // (часть разреза; блок, заведённый новой строкой вместо старой). Ключ — идентичность блока.
  const byKey = new Map(card.pieces.map((p) => [p.lineKey, p]));
  const originOf = new Map<string, P>();
  for (const r of plan.rows) {
    const src = byKey.get(r.old.find((o) => o.pieceLineKey)?.pieceLineKey ?? '');
    if (!src) continue;
    for (const l of r.links)
      if (l.pieceLineKey === null && !originOf.has(lower(l.identity)))
        originOf.set(lower(l.identity), src);
  }
  const result = applyPlan(input, plan, {
    mintKey: deps.mintKey,
    makePiece: (seed) => deps.makePiece(seed, originOf.get(lower(seed.identity))),
    makeAlias: deps.makeAlias,
    makeJoin: deps.makeJoin,
    setReview: (op, review) => ({ ...op, review }),
  });
  if (result.refused?.reason === 'noop') return { kind: 'noop', rowIndex: rows[t].i };
  if (isForeignPlan(plan, result)) return foreign();
  if (result.refused) return { kind: 'refused', why: 'sweep', detail: result.revisionNote };

  let up: UploadedSheet;
  try {
    up = await deps.upload({ name: file.name, bytes });
  } catch (e) {
    return { kind: 'refused', why: 'upload', detail: e instanceof Error ? e.message : String(e) };
  }
  return {
    kind: 'applied',
    rowIndex: rows[t].i,
    replacedUrl: rows[t].r.url!,
    rowId: sheetRowId(rows[t].r),
    issueNumbers: remapIssueNumbers(card.issues ?? [], card.operations.length, result.opIndexOf),
    row: { ...up, sha256: lower(up.sha256) || sha, version: 0, uploadedAt: '' },
    pieces: result.pieces,
    aliases: result.aliases,
    operations: result.operations,
    plan,
    result,
  };
}

// ─── после применения ─────────────────────────────────────────────────────────────────────────

/**
 * Номера шагов дефектов после применения: правило OperationsField.remapIssues. Позиционна только
 * ссылка, которую мог выдать редактор, — кратная 10 внутри текущего ряда шагов; остальное уже висит
 * и не трогается (сдвиг отмыл бы её в чужой валидный номер). `indexOf` — ApplyResult.opIndexOf.
 */
export function remapIssueNumbers(
  issues: readonly { operationNumber?: number }[],
  opCount: number,
  indexOf: readonly number[],
): number[] {
  return issues.map((iss) => {
    const n = iss.operationNumber ?? 0;
    if (!n || n % 10 !== 0) return n;
    const oldIndex = n / 10 - 1;
    if (oldIndex < 0 || oldIndex >= opCount) return n;
    const next = indexOf[oldIndex];
    return next == null ? n : (next + 1) * 10;
  });
}

/**
 * Куда вести после перезалива: есть метки — на вкладку сборки с первым помеченным шагом (`opi` —
 * индекс шага в форме, его читает OperationsField); меток нет — null, остаёмся на выкройках.
 */
export function markJumpParams(
  prev: URLSearchParams,
  operations: readonly CardOperation[],
): URLSearchParams | null {
  const at = firstMarkedOperation(operations);
  if (at < 0) return null;
  const p = new URLSearchParams(prev);
  p.set('tab', 'construction');
  p.delete('sample');
  p.delete('fits');
  p.delete('op');
  p.delete('unit');
  p.set('opi', String(at));
  return p;
}

// ─── ссылки на деталь вне шагов ───────────────────────────────────────────────────────────────

/** Сторона шва: сохранённая (провод, `{ parts }`) или оптимистичная (StoredSeam, массив якорей). */
type SeamSideLike =
  | { parts?: readonly { pieceLineKey?: string }[] }
  | readonly { piece?: string }[]
  | undefined;

/**
 * Ключи деталей, на которые опираются швы (TechCardSeam.sideA/sideB): и сохранённые строки карточки,
 * и оптимистичные из стора швов. Каждый якорь — одна ссылка.
 */
export function seamAnchorKeys(
  seams: readonly { sideA?: SeamSideLike; sideB?: SeamSideLike }[] | undefined,
): string[] {
  const out: string[] = [];
  const side = (s: SeamSideLike) => {
    if (!s) return;
    if (Array.isArray(s)) {
      for (const a of s as readonly { piece?: string }[]) if (a.piece) out.push(a.piece);
      return;
    }
    for (const a of (s as { parts?: readonly { pieceLineKey?: string }[] }).parts ?? [])
      if (a.pieceLineKey) out.push(a.pieceLineKey);
  };
  for (const r of seams ?? []) {
    side(r.sideA);
    side(r.sideB);
  }
  return out;
}

/**
 * Ссылки, которых сверка не видит, по ключу детали: строки рецепта колорвеев, замеры площадей,
 * материалы самой детали, якоря швов (seamAnchorKeys). Деталь с такой ссылкой не удаляется пропажей
 * блока — остаётся призраком. Ключ — как у детали карточки (регистр детали, не ссылки).
 *
 * Аудит схемы карточки (L4c): прочие pieceLineKey вне шагов — алиасы (это не ссылка, их и
 * пересобирает сверка), детали сохранённых раскладок (TechCardMarkerPiece: снимок на момент
 * сохранения, читатель падает на сохранённое имя) и записи производства (ProductionLayCheck, …:
 * история прогона, не карточка). Удаление детали их не ломает.
 */
export function externalPieceRefs(
  pieces: readonly {
    lineKey?: string;
    materials?: readonly { bomLineKey?: string; fusingBomLineKey?: string }[];
  }[],
  colorways: readonly { usages?: readonly { pieceLineKey?: string }[] }[] | undefined,
  pieceAreaScopes: readonly { areas?: readonly { pieceLineKey?: string }[] }[] | undefined,
  seamKeys: readonly string[] = [],
): Record<string, number> {
  const keyOf = new Map<string, string>();
  for (const p of pieces) {
    const k = (p.lineKey ?? '').trim();
    if (k) keyOf.set(k.toLowerCase(), k);
  }
  const out: Record<string, number> = {};
  const bump = (raw: string | undefined) => {
    const k = keyOf.get(lower(raw));
    if (k) out[k] = (out[k] ?? 0) + 1;
  };
  for (const c of colorways ?? []) for (const u of c.usages ?? []) bump(u.pieceLineKey);
  for (const s of pieceAreaScopes ?? []) for (const a of s.areas ?? []) bump(a.pieceLineKey);
  for (const k of seamKeys) bump(k);
  for (const p of pieces)
    for (const m of p.materials ?? [])
      if ((m.bomLineKey ?? '').trim() || (m.fusingBomLineKey ?? '').trim()) bump(p.lineKey);
  return out;
}
