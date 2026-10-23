// ПЕРЕЗАЛИВ DXF В СЛОТ, ГДЕ ЛИСТ УЖЕ ЕСТЬ (L4a, 21.10).
//
// Разрешённый план применяется сразу: `reconcile` → `applyPlan` → новые детали, алиасы и шаги
// (с метками `review`). Если хотя бы один блок остался без решения, файл передаётся существующему
// PieceMatchModal и карточка не меняется до его SAVE.
//
// Единицы и размеры НЕ спрашиваются: файл без $INSUNITS получает единицы заменяемого листа, а строка
// листа сохраняет свой size_id. Просмотр деталей после замены не открывается.
//
// Отказ — старый лист остаётся как был. Загрузка файла — только после удачного плана, так что отказ
// не оставляет на сервере ничьих файлов. Чужой файл тоже возвращается ДО загрузки: в занятом
// слоте выбор уже сделан до сверки, и файл может только заменить строку. Тот же sha256, что у заменяемого
// листа, — ничего не делать.
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
import { splitBlockSize } from './block-code';

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
  /**
   * разрешённый слот привязки по сегодняшнему BOM (scopeKeyOfBinding над набором своего вида —
   * листы или связи); '' — ни к чему живому
   */
  scopeOf: (b: { fabricPurpose?: string; bomLineKey?: string }, kind: 'sheet' | 'link') => string;
  isDxf: (url: string) => boolean;
  sizeTokens: readonly string[];
  /** Dictionary tokens of the card's base/sample size, preferred for shape comparison. */
  preferredSizeTokens?: readonly string[];
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
  /**
   * Тот же planSheetDelete, которым форма удаляет строку. На чужом файле план снимается сейчас,
   * пока карточка совпадает со входом сверки, и едет в исходе как точные потери + готовый каскад.
   * knownBlocks — уже разобранные этим прогоном листы слота; форма подмешивает их к общему pack.
   */
  planDelete: (
    rowId: string,
    knownBlocks: ReadonlyMap<string, readonly string[]>,
  ) => ReuploadDeletePlan<P, A, O> | null;
};

/** Идентичность строки листа: lineKey, у строк без него — url. */
export const sheetRowId = (r: ReuploadSheetRow) => (r.lineKey ?? '').trim() || (r.url ?? '');

/** Новая правда строки листа: файл другой — номер версии назначит сервер (0 = «присвой»). */
export type SheetPatch = UploadedSheet & { version: 0; uploadedAt: '' };

export type ReuploadRefusal = 'file' | 'download' | 'parse' | 'sweep' | 'upload' | 'target';

/** Каскад целевого листа, снятый тем же planSheetDelete, что использует × в строке файла. */
export type ReuploadDeletePlan<
  P extends CardPiece,
  A extends CardAlias,
  O extends CardOperation,
> = {
  rowIndex: number;
  rowUrl: string;
  pieces: P[];
  aliases: A[];
  operations: O[];
  issueNumbers: number[];
  removedSeamIds: string[];
  counts: { pieces: number; steps: number };
};

export type ForeignReuploadOutcome<
  P extends CardPiece,
  A extends CardAlias,
  O extends CardOperation,
> = {
  kind: 'foreign';
  rowIndex: number;
  replacedUrl: string;
  rowId: string;
  replacedName: string;
  /** Файл с унаследованными единицами; его ещё нет на сервере. */
  file: ReuploadFile;
  sha256: string;
  /** Разбор только нового файла, для подписи и первой заливки после подтверждения. */
  parsed: ParsedSheetLite;
  pieceCount: number;
  loss: { pieces: number; steps: number; seams: number };
  deletion: ReuploadDeletePlan<P, A, O>;
};

export type ReuploadOutcome<P extends CardPiece, A extends CardAlias, O extends CardOperation> =
  /** в слоте нет DXF — сегодняшний путь первой заливки (занятый слот сюда не попадает никогда) */
  | { kind: 'first' }
  /** тот же файл — ничего не делать */
  | { kind: 'noop'; rowIndex: number }
  | { kind: 'refused'; why: ReuploadRefusal; detail?: string }
  | {
      kind: 'match';
      rowIndex: number;
      replacedUrl: string;
      rowId: string;
      row: SheetPatch;
      plan: ReconcilePlan;
    }
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
  /** чужой файл: разобран, но не загружен и ничего на карточке ещё не изменил. */
  | ForeignReuploadOutcome<P, A, O>;

export type ForeignReplacementPlan<
  P extends CardPiece,
  A extends CardAlias,
  O extends CardOperation,
> = {
  kind: 'replace';
  rowIndex: number;
  replacedUrl: string;
  rowId: string;
  row: SheetPatch;
  pieces: P[];
  aliases: A[];
  operations: O[];
  issueNumbers: number[];
  removedSeamIds: string[];
  /** Новый лист отдаётся существующему пути первой заливки (pieces viewer). */
  parsed: ParsedSheetLite;
};

/** The only two decisions for files dropped on an occupied material slot. */
export type OccupiedChoice = 'replace' | 'merge';

/**
 * Files handed to the merge modal after the occupied-slot decision. Replace merges only a dropped
 * batch; merge prepends the current sheet, making it the template and duplicate-block winner.
 */
export function planOccupiedFiles<T>(
  existing: T,
  dropped: readonly T[],
  choice: OccupiedChoice,
): { files: T[]; merge: boolean } {
  if (choice === 'merge') return { files: [existing, ...dropped], merge: true };
  return { files: [...dropped], merge: dropped.length > 1 };
}

/** Загрузка отложенного чужого файла. До этого вызова на сервере и в форме ничего нового нет. */
export async function uploadForeignSheet<
  P extends CardPiece,
  A extends CardAlias,
  O extends CardOperation,
>(
  out: ForeignReuploadOutcome<P, A, O>,
  upload: ReuploadDeps<P, A, O>['upload'],
): Promise<SheetPatch> {
  const row = await upload(out.file);
  return {
    ...row,
    sha256: lower(row.sha256) || out.sha256,
    version: 0,
    uploadedAt: '',
  };
}

/** Чистый план подтверждённой замены чужим файлом; добавить вторую строку нельзя. */
export function planForeignReplacement<
  P extends CardPiece,
  A extends CardAlias,
  O extends CardOperation,
>(out: ForeignReuploadOutcome<P, A, O>, row: SheetPatch): ForeignReplacementPlan<P, A, O> {
  return {
    kind: 'replace',
    rowIndex: out.rowIndex,
    replacedUrl: out.replacedUrl,
    rowId: out.rowId,
    row,
    pieces: out.deletion.pieces,
    aliases: out.deletion.aliases,
    operations: out.deletion.operations,
    issueNumbers: out.deletion.issueNumbers,
    removedSeamIds: out.deletion.removedSeamIds,
    parsed: out.parsed,
  };
}

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
  // The fuse markup that does not hang on the parent's outline (edges and the zone do: a cut
  // part has its own segments, so it starts without them and the panel flags it).
  'fusingBomLineKey',
  'fusingInsetMm',
  'fusingInsetNet',
  'fusingGrain',
  'fusingDarts',
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
    r.url && card.isDxf(r.url) && card.scopeOf(r, 'sheet') === card.scopeKey ? [{ r, i }] : [],
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
  const digestRows = pinned >= 0 ? [rows[pinned]] : rows;
  const storedSame = rawSha ? digestRows.find((x) => lower(x.r.sha256) === rawSha) : undefined;
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
  const rawHit = rawSha
    ? pinned >= 0
      ? oldShas[pinned] === rawSha
        ? pinned
        : -1
      : oldShas.indexOf(rawSha)
    : -1;
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

  // Нетронутый сосед может нести те же блоки: решаем «замена или чужой» только по двум файлам.
  // Для одного листа старый разбор уже ровно целевой; новый разбирается здесь один раз и ниже
  // переиспользуется как общий разбор слота.
  const [targetOld, targetNew] = await Promise.all([
    rows.length === 1 ? Promise.resolve(oldParse) : deps.parse([oldFiles[t]]),
    deps.parse([{ name: file.name, bytes }]),
  ]);
  if (targetOld.failedFiles > 0) return { kind: 'refused', why: 'parse', detail: 'old sheet' };
  if (targetNew.failedFiles > 0 || targetNew.pieces.length === 0)
    return { kind: 'refused', why: 'parse', detail: 'new file' };

  const foreign = (): ReuploadOutcome<P, A, O> => {
    const knownBlocks = new Map<string, readonly string[]>();
    for (let k = 0; k < rows.length; k++) {
      const names =
        k === t
          ? [...targetOld.blockNames]
          : [
              ...new Set(
                oldParse.pieces
                  .filter((p) => (p.fileIndex ?? -1) === k)
                  .map((p) => (p.blockName ?? '').trim())
                  .filter(Boolean),
              ),
            ];
      knownBlocks.set(rows[k].r.url!, names);
    }
    const rowId = sheetRowId(rows[t].r);
    const deletion = card.planDelete(rowId, knownBlocks);
    if (!deletion || deletion.rowUrl !== rows[t].r.url)
      return { kind: 'refused', why: 'sweep', detail: 'delete plan' };
    const sizeTokens = new Set(card.sizeTokens);
    return {
      kind: 'foreign',
      rowIndex: rows[t].i,
      replacedUrl: rows[t].r.url!,
      rowId,
      replacedName: sheetName(rows[t].r, t),
      file: { name: file.name, bytes },
      sha256: sha,
      parsed: { pieces: targetNew.pieces, blockNames: targetNew.blockNames },
      // The parser emits every size and contour separately. The panel counts sizeless identities,
      // which is what the operator calls pieces (and what the existing slot thumbnail counts).
      pieceCount: new Set(
        targetNew.blockNames
          .map((name) => lower(splitBlockSize(name, sizeTokens).identity))
          .filter(Boolean),
      ).size,
      loss: {
        pieces: deletion.counts.pieces,
        steps: deletion.counts.steps,
        seams: deletion.removedSeamIds.length,
      },
      deletion,
    };
  };

  if (rows.length > 1) {
    const targetPlan = reconcile({
      scope: card.scope,
      pieces: card.pieces,
      aliases: card.aliases,
      operations: card.operations,
      oldSheet: { parse: targetOld, sha256: oldShas[t] },
      newSheet: { parse: targetNew, sha256: sha },
      sizeTokens: card.sizeTokens,
      preferredSizeTokens: card.preferredSizeTokens,
      externalRefs: card.externalRefs,
      aliasInScope: (a) => card.scopeOf(a, 'link') === card.scopeKey,
      targetFileIndex: 0,
      ...(card.seams ? { seams: card.seams } : {}),
    });
    if (isForeignPlan(targetPlan)) return foreign();
  }

  const newFiles = oldFiles.map((f, k) => (k === t ? { name: file.name, bytes } : f));
  const newParse = rows.length === 1 ? targetNew : await deps.parse(newFiles);
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
    preferredSizeTokens: card.preferredSizeTokens,
    externalRefs: card.externalRefs,
    otherSheets,
    aliasInScope: (a) => card.scopeOf(a, 'link') === card.scopeKey,
    // Несколько листов в слоте: «чужой файл» решается по заменяемому листу, не по всему слоту.
    ...(rows.length > 1 ? { targetFileIndex: t } : {}),
    ...(card.seams ? { seams: card.seams } : {}),
  };
  const plan = reconcile(input);
  if (plan.status === 'noop') return { kind: 'noop', rowIndex: rows[t].i };
  if (isForeignPlan(plan)) return foreign();
  if (plan.needsPieceMatch || plan.needsShapeReview) {
    let up: UploadedSheet;
    try {
      up = await deps.upload({ name: file.name, bytes });
    } catch (e) {
      return { kind: 'refused', why: 'upload', detail: e instanceof Error ? e.message : String(e) };
    }
    return {
      kind: 'match',
      rowIndex: rows[t].i,
      replacedUrl: rows[t].r.url!,
      rowId: sheetRowId(rows[t].r),
      row: { ...up, sha256: lower(up.sha256) || sha, version: 0, uploadedAt: '' },
      plan,
    };
  }
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
