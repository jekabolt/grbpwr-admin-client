// Сверка перезалитого DXF с карточкой — КОНТРАКТ.
//
// ПОВОРОТ 21.10 (владелец): окна сверки нет, вопросов при заливке нет вообще. Залил DXF → всё
// применяется само → на шагах сборки метка «проверить» (review), решение принимается в самом шаге;
// страховка вместо вопросов — «вернуть v.N».
//
// Поток: старый лист scope уже разобран, новый файл разобран тем же worker'ом →
// `reconcile(input)` строит план (ярусы по деталям + сводка для чипа «что изменилось») →
// `applyPlan(input, plan, deps)` детерминированно отдаёт новые pieces/aliases/operations, список
// review-меток и нарушения assemblySweep. Нарушение, которого не было ДО, отказывает применение
// целиком; форма не трогается.
//
// Правила исхода:
//   · то же имя, форма поменялась → новая форма принята, шаги с деталью (входом или аннотацией)
//     получают review 'reshaped', «Конструкция» по детали протухает (reshapedPieceKeys);
//   · деталь пропала и на неё есть ссылки → остаётся призраком (алиас снят), её шаги — 'orphan';
//     без ссылок — удаляется молча. Шаг не удаляется НИКОГДА;
//   · разрез → деталь идёт за большей частью, остальные части — новые детали; перед первым шагом,
//     где деталь стоит входом, вставляется ОДИН обычный шаг join (вход: деталь + части, выход —
//     узел ▣ под старым именем детали), метка 'split' только на нём; шаги, где была деталь, берут
//     этот узел вместо неё и остаются без метки (круг 2, 21.10). Единственный случай, когда
//     applyPlan добавляет шаг и переписывает входы. Деталь не стоит ни в одном входе — join нет,
//     метки нет, части — просто новые детали; слияние → без автоматики: деталь идёт за новым блоком,
//     поглощённая остаётся призраком/удаляется по правилу выше, шаги обеих — 'remapped';
//   · перепривязка по форме с неполной уверенностью (две одинаковые формы, заметная разница) →
//     'remapped';
//   · переименование по форме, новые детали, L/R-пара → одна деталь ×2 — молча. Новые детали в
//     шаги не встают: чип «+N в сборку» (addedPieceKeys).
//
// Библиотека чистая: ни React, ни формы, ни сети. Создание строк формы — фабриками ApplyDeps.
import type { AssemblyViolation } from 'components/managers/tech-card/components/assembly-frontier';
import type { PieceDTO } from 'lib/nesting/types';

// ─── вход ─────────────────────────────────────────────────────────────────────────────────────

/** Строка детали карточки. Остальные поля строки проезжают насквозь (generic P). */
export type CardPiece = {
  lineKey: string;
  name: string;
  piecesPerGarment?: number;
  cutSymmetry?: string;
};

/** Алиас (scope, блок) → деталь. scope = fabricPurpose, иначе bomLineKey (как в схеме, 0267). */
export type CardAlias = {
  bomLineKey?: string;
  fabricPurpose?: string;
  blockName?: string;
  pieceLineKey?: string;
};

export type CardAnnotation = {
  pieceLineKey?: string;
  pieceLineKeys?: string[];
};

export type CardMedia = {
  annotations?: CardAnnotation[];
};

/** Шаг сборки. inputKeys — ключи деталей и узлов в ОДНОМ пространстве (как у assemblySweep). */
export type CardOperation = {
  inputKeys?: string[];
  outputUnitKey?: string;
  outputUnitName?: string;
  media?: CardMedia[];
  /** метка «проверить» (Review) или '' — читают хелперы marks.ts / candidates.ts */
  review?: string;
};

/** Разобранный лист scope — ровно то, что отдаёт `parseSheets` (все файлы scope одной пачкой). */
export type ParsedSheetLite = {
  pieces: readonly PieceDTO[];
  blockNames: readonly string[];
};

export type SheetSide = {
  parse: ParsedSheetLite;
  /** sha256 файла(ов) листа; равные sha старого и нового → план `noop`. */
  sha256?: string | null;
};

export type ReconcileScope = {
  bomLineKey: string;
  fabricPurpose: string;
};

export type ReconcileInput<
  P extends CardPiece = CardPiece,
  A extends CardAlias = CardAlias,
  O extends CardOperation = CardOperation,
> = {
  /** scope листа, который перезаливают; новые алиасы получают ровно эти два поля. */
  scope: ReconcileScope;
  /** Все детали карточки, в порядке формы. */
  pieces: readonly P[];
  /** ВСЕ алиасы карточки (все scope): чужие проезжают нетронутыми. */
  aliases: readonly A[];
  /** Все шаги, в порядке формы. */
  operations: readonly O[];
  /** Активный лист scope до замены; null — листа не было (сверка только по именам). */
  oldSheet: SheetSide | null;
  newSheet: SheetSide;
  /** Токены словаря, которые бывают размерами (как у splitPiecesBySize), в нижнем регистре. */
  sizeTokens: readonly string[];
  /**
   * Ссылки на деталь ВНЕ шагов/аннотаций, которых либа не видит (рецепт, площади, CONSTRUCTION…):
   * pieceLineKey → число. Деталь со ссылками не удаляется — остаётся призраком.
   */
  externalRefs?: Readonly<Record<string, number>>;
  /** Листы других scope — для T7 moved/shared по точному имени И форме. Необязательно. */
  otherSheets?: readonly { scope: ReconcileScope; parse: ParsedSheetLite }[];
  /**
   * Принадлежит ли алиас scope этого листа. По умолчанию — сравнение (fabricPurpose || bomLineKey);
   * форма передаёт резолв по сегодняшнему BOM (scopeKeyOfBinding), как piece-block-refs.
   */
  aliasInScope?: (alias: A) => boolean;
};

// ─── план ─────────────────────────────────────────────────────────────────────────────────────

/**
 *   unchanged T0 · minor T1 (дрейф экспорта, молча) · reshaped T1' (то же имя, другая форма) ·
 *   renamed T2/T3 · split T4 · merged T4' (и L/R-пара → одна деталь ×2) · added T5 ·
 *   removed T6 · moved T7 · unlinked (блок, за которым на карте нет детали — не трогаем).
 * «Другой файл» (T8) — не ярус, а флаг сводки `otherFile`.
 */
export type Tier =
  | 'unchanged'
  | 'minor'
  | 'reshaped'
  | 'renamed'
  | 'split'
  | 'merged'
  | 'added'
  | 'removed'
  | 'moved'
  | 'unlinked';

/** Насколько уверен матч — диагностика; 'medium'/'low' у перепривязки дают метку 'remapped'. */
export type Confidence = 'high' | 'medium' | 'low';

/** Что станет со старой деталью строки. */
export type PieceFate =
  /** остаётся и связана с блоком нового листа */
  | 'keep'
  /** остаётся без блока (алиас снят): на неё есть ссылки */
  | 'ghost'
  /** удаляется: ссылок нет */
  | 'delete';

/** Деталь карточки на старой стороне строки. */
export type OldRef = {
  /** '' — у старого блока не было детали (ярус unlinked) */
  pieceLineKey: string;
  pieceName: string;
  /** идентичность блока старого листа (без размерного хвоста); '' — блока не было */
  identity: string;
  fate: PieceFate;
};

/** Связь блока нового листа с деталью: pieceLineKey null — завести новую деталь с именем `name`. */
export type NewLink = {
  identity: string;
  pieceLineKey: string | null;
  /** имя новой детали (идентичность, уникализированная по карте); '' у существующей */
  name: string;
};

/** Метка на шаги, где деталь — вход или участник аннотации. */
export type RowReview = {
  review: Review;
  pieceKeys: string[];
};

/** Блок нового листа (одна идентичность = все её размеры). */
export type NewRef = {
  identity: string;
  /** сырые имена блоков этой идентичности, в каноническом порядке */
  blocks: string[];
  /** максимум экземпляров на файл и размер (кандидат в piecesPerGarment) */
  instances: number;
};

/** Кандидат матча — диагностика (почему выбран именно этот блок). */
export type Candidate = {
  identity: string;
  cost: number;
};

/** Что именно поменялось в форме — для подписи. */
export type ShapeDelta = {
  cost: number;
  /** размер, на котором разница наибольшая ('' — без размера) */
  size: string;
  dArea: number;
  dPerim: number;
  /** относительное изменение габарита по осям, ×1.10 → 0.10 */
  dW: number;
  dH: number;
  /** надсечки: новый − старый */
  dNotches: number;
  frame: 'asis' | 'rot180' | 'mirrorU' | 'mirrorV';
};

export type ReconcileRow = {
  /** стабильный id (от имён, не от индексов) */
  id: string;
  tier: Tier;
  old: OldRef[];
  new: NewRef[];
  confidence: Confidence;
  /** диагностика: ближайшие блоки по форме, в каноническом порядке (стоимость, имя) */
  candidates: Candidate[];
  delta: ShapeDelta | null;
  /** решение: какой блок к какой детали (алиасы scope пересобираются ровно из этого) */
  links: NewLink[];
  /** имя детали идёт за блоком, только если было авто-именем (= старой идентичности) */
  rename: { pieceLineKey: string; to: string } | null;
  /** L/R-пара свернулась в одну деталь: ×2, зеркально (null — поля детали уже такие) */
  pieceUpdate: { pieceLineKey: string; piecesPerGarment: number; cutSymmetry: string } | null;
  /** метки на шаги; пусто — шаги не трогаются */
  reviews: RowReview[];
  /** форма связанной детали изменилась (протухает «Конструкция») */
  reshapedPieceKeys: string[];
  /** короткая подпись: «×1.10 по ширине», «+2 надсечки», «пара → ×2» */
  note: string;
};

export type ReconcileSummary = Readonly<Record<Tier, number>> & {
  /** доля связанных старых блоков scope, нашедших пару в новом листе */
  matchedShare: number;
  /** < 30 % нашли пару: похоже на другой файл (матч по форме при этом выключен) */
  otherFile: boolean;
  /** множитель единиц, найденный по парам одноимённых блоков (1 — совпали) */
  scale: number;
};

export type PlanStatus =
  /** sha равны — применять нечего, версия не растёт */
  | 'noop'
  /** применить (в том числе когда все строки unchanged — новый файл, та же геометрия) */
  | 'ready';

export type ReconcilePlan = {
  status: PlanStatus;
  rows: ReconcileRow[];
  summary: ReconcileSummary;
};

export type Reconcile = <P extends CardPiece, A extends CardAlias, O extends CardOperation>(
  input: ReconcileInput<P, A, O>,
) => ReconcilePlan;

// ─── применение ───────────────────────────────────────────────────────────────────────────────

/** Значения колонки tech_card_operation.review (0422). Любая метка блокирует релиз. */
export type Review = 'reshaped' | 'remapped' | 'split' | 'orphan';

/**
 * Одна метка на шаг. Если шаг задет несколькими строками, побеждает более тяжёлая:
 * orphan > split > remapped > reshaped (REVIEW_RANK в defaults.ts).
 */
export type ReviewMark = {
  /** индекс шага в РЕЗУЛЬТАТЕ (operations после вставки join разреза; без разреза = входной) */
  opIndex: number;
  review: Review;
  /** детали, из-за которых метка, в порядке деталей карточки */
  pieceKeys: string[];
};

export type NewPieceSeed = {
  lineKey: string;
  name: string;
  piecesPerGarment: number;
  cutSymmetry: string;
  /** идентичность блока, из которого деталь родилась */
  identity: string;
};

export type NewAliasSeed = ReconcileScope & {
  blockName: string;
  pieceLineKey: string;
};

/** Шаг join разреза: собирает деталь и её части обратно в узел под старым именем детали. */
export type NewJoinSeed<O extends CardOperation = CardOperation> = {
  /** [деталь, части…] — деталь первой, части в порядке строки плана */
  inputKeys: string[];
  /** ключ узла: из старого имени, не совпадает ни с деталью, ни с выходом другого шага */
  outputUnitKey: string;
  /** старое имя детали (до переименования за большей частью) */
  outputUnitName: string;
  /** шаг, перед которым встаёт join (первый, где деталь стоит входом) — откуда взять зону и т.п. */
  before: O;
};

export type ApplyDeps<P extends CardPiece, A extends CardAlias, O extends CardOperation> = {
  mintKey: () => string;
  makePiece: (seed: NewPieceSeed) => P;
  makeAlias: (seed: NewAliasSeed) => A;
  /** Строка шага join разреза (без метки — метку ставит setReview). */
  makeJoin: (seed: NewJoinSeed<O>) => O;
  /** Ставит review на шаг. Без неё метки только в списке `reviews`. */
  setReview?: (op: O, review: Review) => O;
};

export type ApplyRefusal =
  | { reason: 'noop' }
  /** применение дало нарушение сборки, которого не было до — названо шагом */
  | { reason: 'sweep'; violations: AssemblyViolation[] };

export type ApplyResult<P extends CardPiece, A extends CardAlias, O extends CardOperation> = {
  refused: ApplyRefusal | null;
  pieces: P[];
  aliases: A[];
  operations: O[];
  reviews: ReviewMark[];
  /** нарушения assemblySweep ПОСЛЕ, которых не было ДО (непусто ⇒ refused.reason === 'sweep') */
  violations: AssemblyViolation[];
  /**
   * все новые детали этой заливки. Части разреза сразу стоят входом join — чип «+N в сборку»
   * считает по факту (unplacedPieceKeys в marks.ts), а не по этому списку.
   */
  addedPieceKeys: string[];
  /** вставленные join разреза: индекс в результате, деталь, части, узел */
  joins: SplitJoin[];
  /** форма изменилась — «Конструкция» по этим деталям протухла */
  reshapedPieceKeys: string[];
  /** остались на карте без блока (алиас снят) */
  ghostPieceKeys: string[];
  removedPieceKeys: string[];
  renamed: { pieceLineKey: string; from: string; to: string }[];
  /** строка для tech_card_revision / snapshot_reason */
  revisionNote: string;
};

export type SplitJoin = {
  opIndex: number;
  parentKey: string;
  partKeys: string[];
  unitKey: string;
  unitName: string;
};

export type ApplyPlan = <P extends CardPiece, A extends CardAlias, O extends CardOperation>(
  input: ReconcileInput<P, A, O>,
  plan: ReconcilePlan,
  deps: ApplyDeps<P, A, O>,
) => ApplyResult<P, A, O>;
