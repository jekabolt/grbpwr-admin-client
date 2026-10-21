// Сверка перезалитого DXF с карточкой — КОНТРАКТ (L1 ↔ L2).
//
// Поток: старый лист scope уже разобран, новый файл разобран тем же worker'ом → `reconcile(input,
// answers)` строит план → модалка показывает строки итога и строки квиза (у каждой дефолт
// предвыбран) → при каждом ответе план пересчитывается ЗАНОВО из (input, answers): строки, которые
// зависят от ответа (выбрал CLR_3 вместо CLR_4 → «пропала» переезжает на CLR_4), появляются и
// исчезают сами → «Применить» = `applyPlan(input, plan, deps)`: новые pieces/aliases/operations одним
// пакетом, список review-меток, нарушения assemblySweep. Нарушение, которого не было ДО, отказывает
// применение целиком; форма не трогается.
//
// Квиз владельца 21.10 (перекрывает 03-SYNTHESIS §7): пропала деталь со ссылками, то же имя с другой
// формой и разрез — ВОПРОСЫ с предвыбранным дефолтом, не автоматика. Шаг сборки не удаляется
// никогда. Новые детали в сборку не встают сами — чип «+N в сборку» (addedPieceKeys).
//
// Библиотека чистая: ни React, ни формы, ни сети. Всё, что требует знания формы (создать строку
// детали, алиаса, шага-джойна, поставить review), приходит фабриками в ApplyDeps.
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
};

/** Разобранный лист scope — ровно то, что отдаёт `parseSheets` (все файлы scope одной пачкой). */
export type ParsedSheetLite = {
  pieces: readonly PieceDTO[];
  blockNames: readonly string[];
};

export type SheetSide = {
  parse: ParsedSheetLite;
  /** sha256 файла(ов) листа; равные sha старого и нового → план `noop` без разбора. */
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
  /** ВСЕ алиасы карточки (все scope): чужие проезжают нетронутыми и нужны для «moved/shared». */
  aliases: readonly A[];
  /** Все шаги, в порядке формы. */
  operations: readonly O[];
  /** Активный лист scope до замены; null — листа не было (тогда всё «added», вопросов нет). */
  oldSheet: SheetSide | null;
  newSheet: SheetSide;
  /** Токены словаря, которые бывают размерами (как у splitPiecesBySize). */
  sizeTokens: readonly string[];
  /**
   * Ссылки на деталь ВНЕ шагов/аннотаций, которые либа не видит (рецепт, площади, CONSTRUCTION…):
   * pieceLineKey → число. Деталь с ссылками не удаляется без ответа.
   */
  externalRefs?: Readonly<Record<string, number>>;
  /** Листы других scope (для T7 moved/shared по точному имени + форме). Необязательно. */
  otherSheets?: readonly { scope: ReconcileScope; parse: ParsedSheetLite }[];
};

// ─── план ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Ярус строки — ТО, ВО ЧТО строка разрешается при текущих ответах (без ответа — при дефолте).
 * Нужен ли вопрос — отдельно (`quizId`, `needsAnswer`).
 *   unchanged T0 · minor T1 (дрейф, молча) · reshaped T1' (то же имя, другая форма — вопрос) ·
 *   renamed T2/T3 · split/merged T4/T4' (и L/R-пара → одна деталь ×2) · added T5 · removed T6 ·
 *   moved T7 · unlinked (блок старого листа без детали на карте — ничего не делаем) · other T8.
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
  | 'unlinked'
  | 'other';

export type Confidence = 'high' | 'medium' | 'low';

/** Деталь карточки на старой стороне строки. */
export type OldRef = {
  pieceLineKey: string;
  pieceName: string;
  /** идентичность блока старого листа (без размерного хвоста); '' — блока не было */
  identity: string;
};

/** Блок нового листа (одна идентичность = все её размеры). */
export type NewRef = {
  identity: string;
  /** сырые имена блоков этой идентичности, в каноническом порядке */
  blocks: string[];
  /** максимум экземпляров на файл (кандидат в piecesPerGarment) */
  instances: number;
};

export type Candidate = {
  /** id выбора в строке квиза (`QuizChoice.id`) */
  choiceId: string;
  pieceLineKey: string | null;
  label: string;
  /** стоимость формы (0 — та же); null — не сравнивалось */
  cost: number | null;
};

/** Что именно поменялось в форме — для подписи строки итога. */
export type ShapeDelta = {
  cost: number;
  /** размер, на котором сравнивали ('' — без размера) */
  size: string;
  dArea: number;
  dPerim: number;
  /** относительное изменение габарита по осям нового кадра, ×1.10 → 0.10 */
  dW: number;
  dH: number;
  /** надсечки новый − старый */
  dNotches: number;
  frame: 'asis' | 'rot180' | 'mirrorU' | 'mirrorV';
};

export type ReconcileRow = {
  /** стабильный id (от имён, не от индексов) — ключ строки в модалке */
  id: string;
  tier: Tier;
  old: OldRef[];
  new: NewRef[];
  confidence: Confidence;
  /** кандидаты в каноническом порядке (стоимость, затем имя) — для T3/removed→map */
  candidates: Candidate[];
  delta: ShapeDelta | null;
  /** строка квиза, которая решает эту строку; null — автоматика */
  quizId: string | null;
  /** quizId есть, а явного ответа нет (стоит дефолт) */
  needsAnswer: boolean;
  /** короткая подпись: «×1.10 по ширине», «+2 надсечки», «пара → ×2» */
  note: string;
};

export type QuizKind =
  | 'ambiguous' // T3: «COLLAR_UNDER = CLR_4?» [кандидаты…, new]
  | 'reshape' //   T1': «BP_2: другая форма?» [accept, keep-old]
  | 'removed' //   T6: «CLR_3: деталь пропала?» [keep, remove, map]
  | 'split' //     T4: «BP → BP_U + BP_D?» [split, keep-old]
  | 'merge' //     T4': «BP_U + BP_D → BP?» [merge, keep-split]
  | 'units' //     «Масштаб ×10?» [apply, cancel]
  | 'other-file'; // T8: «Другой файл?» [cancel, replace]

export type QuizChoice = {
  /** id ответа; для removed→map ответ пишется как `map:<identity>` */
  id: string;
  label: string;
  /** только у `map`: идентичности нового листа, на которые можно перевести деталь */
  targets?: string[];
};

export type QuizRow = {
  /** стабильный id: `${kind}:${subject}` */
  id: string;
  kind: QuizKind;
  /** о чём строка: идентичность/имя детали; для units/other-file — '' */
  subject: string;
  text: string;
  choices: QuizChoice[];
  default: string;
  /** действующий ответ (явный, иначе дефолт) */
  answer: string;
  answered: boolean;
};

/** Ответы модалки: id строки квиза → id выбора. Пустой объект = все дефолты. */
export type ReconcileAnswers = Readonly<Record<string, string>>;

export type ReconcileSummary = Readonly<Record<Tier, number>> & {
  /** доля старых деталей scope, нашедших пару в новом листе (T8 при < 0.3) */
  matchedShare: number;
};

export type PlanStatus =
  /** sha равны или ни одной разницы — применять нечего, версия не растёт */
  | 'noop'
  /** есть что применить (квиз может быть, у всех строк дефолт) */
  | 'ready'
  /** ответ «отмена» в units/other-file — применять нельзя */
  | 'cancelled';

export type ReconcilePlan = {
  status: PlanStatus;
  rows: ReconcileRow[];
  quiz: QuizRow[];
  summary: ReconcileSummary;
  /** множитель единиц, применённый к новому листу (1 — без гипотезы) */
  scale: number;
  /** действующие ответы (явные + дефолты) — то, с чем apply будет работать */
  answers: Readonly<Record<string, string>>;
};

export type Reconcile = <P extends CardPiece, A extends CardAlias, O extends CardOperation>(
  input: ReconcileInput<P, A, O>,
  answers?: ReconcileAnswers,
) => ReconcilePlan;

// ─── применение ───────────────────────────────────────────────────────────────────────────────

/** Значения колонки tech_card_operation.review (0422). Любая метка блокирует релиз. */
export type Review = 'reshaped' | 'remapped' | 'split' | 'orphan';

export type ReviewMark = {
  /** индекс шага в РЕЗУЛЬТИРУЮЩЕМ operations */
  opIndex: number;
  review: Review;
  /** детали, из-за которых метка */
  pieceKeys: string[];
};

export type AnnotationEdit = {
  opIndex: number;
  mediaIndex: number;
  annotationIndex: number;
  before: string[];
  after: string[];
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

/** Шаг «N1 + N2 → узел» для split. Тип операции/зона/машина — забота формы (rowFromStep). */
export type JoinSeed = {
  inputKeys: string[];
  outputUnitKey: string;
  outputUnitName: string;
};

export type ApplyDeps<P extends CardPiece, A extends CardAlias, O extends CardOperation> = {
  mintKey: () => string;
  makePiece: (seed: NewPieceSeed) => P;
  makeAlias: (seed: NewAliasSeed) => A;
  makeJoin: (seed: JoinSeed) => O;
  /** Ставит review на шаг (когда в схеме появится поле, L3). Без неё метки только в списке. */
  setReview?: (op: O, review: Review) => O;
};

export type ApplyRefusal =
  | { reason: 'noop' }
  | { reason: 'cancelled' }
  /** применение дало нарушение сборки, которого не было до — названо шагом */
  | { reason: 'sweep'; violations: AssemblyViolation[] };

export type ApplyResult<P extends CardPiece, A extends CardAlias, O extends CardOperation> = {
  refused: ApplyRefusal | null;
  pieces: P[];
  aliases: A[];
  operations: O[];
  reviews: ReviewMark[];
  annotationEdits: AnnotationEdit[];
  /** нарушения assemblySweep ПОСЛЕ, которых не было ДО (непусто ⇒ refused.reason === 'sweep') */
  violations: AssemblyViolation[];
  /** новые детали — чип «+N в сборку» (в шаги не вставлены) */
  addedPieceKeys: string[];
  /** форма изменилась — «Конструкция» по этим деталям протухла (квиз 21.10 п.8) */
  reshapedPieceKeys: string[];
  /** остались на карте без блока (алиас снят) */
  ghostPieceKeys: string[];
  removedPieceKeys: string[];
  renamed: { pieceLineKey: string; from: string; to: string }[];
  /** строка для tech_card_revision / snapshot_reason */
  revisionNote: string;
};

export type ApplyPlan = <P extends CardPiece, A extends CardAlias, O extends CardOperation>(
  input: ReconcileInput<P, A, O>,
  plan: ReconcilePlan,
  deps: ApplyDeps<P, A, O>,
) => ApplyResult<P, A, O>;
