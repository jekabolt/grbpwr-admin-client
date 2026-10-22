// «детали кроя из DXF» — DXF block → cut piece, for ONE cloth (design §2.2).
//
// The problem this exists for, in the owner's words: block names drift between files, and the
// same generic name («полочка») means different pieces in the main-fabric file and the lining
// file. So the mapping is stored SCOPED BY CLOTH and the name in the file is never the identity —
// `tech_card_piece.line_key` is. Once a block is mapped, renaming the piece is a one-place edit and
// every marker and DXF that mentions the block follows. The same scoping is why a SECOND SIZE of
// the same cloth needs no work at all: its blocks carry the same names, so they arrive already
// mapped.
//
// SINCE 0267 THE SCOPE IS A НАЗНАЧЕНИЕ where the card has been sorted, and the legacy BOM line
// where it has not (uniq on (card, COALESCE(fabric_purpose, bom_line_key), block_name)). Two
// consequences run through this whole file:
//
//   • «уже сопоставлено» has to be resolved, not raw-keyed. An alias written on line L before the
//     card was sorted belongs to L's назначение now. Comparing stored keys to the group's key would
//     offer every mapped block again and mint a second alias for the same physical piece.
//   • Two lines sorted into ONE назначение MERGE their alias sets, and if both held a «полочка»
//     the merge has two answers for one block. The server refuses that pair by failing the WHOLE
//     card save, so it is surfaced HERE, before anything is written, as a choice the operator makes
//     rather than a refusal they receive.
//
// Ф10.1 — the sheet is the primary surface, the list is the index. A block name is whatever the
// exporter minted («PERED_S», «Block_17»); nobody can tell which piece that is by reading it.
// The form and the neighbours answer it instantly, so the pieces are drawn where they lie in
// the drawing and named by clicking. The table stays as a keyboard-reachable list of the same
// state, never as the only way in.
//
// The machine proposes, the human decides. Auto-suggestion runs in three descending tiers
// (exact case-insensitive → normalized → similarity, the last one badged «предложено»), and
// every row still has to be confirmed by a person: a wrong mapping silently mis-assigns cloth
// to a piece, which is a cutting-floor error, not a UI annoyance.
//
// Writes nothing of its own — it stages `pieces` and `pieceDxfAliases` into the card form, and
// the card's own Save persists both in one transaction (the store upserts pieces first, so a
// piece created here resolves for the alias that references it).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import type { common_AdminColorwayRef, common_TechCardPieceAreaScope } from 'api/proto-http/admin';
import type { PieceDTO } from 'lib/nesting/types';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import {
  Chip,
  ChipRow,
  ConfirmationModal,
  GroupLabel,
  HeaderWarnings,
  type HeaderWarning,
  Input,
  Select,
  Text,
} from 'ui';
import { ulid } from 'utils/ulid';
import { notify } from 'lib/stores/store';
import { regenerateFusingSheets } from 'lib/fusing-dxf';
import { useTechCardStaging } from '../useTechCardStaging';
import { clampUtf8Bytes, isDxfUrl } from 'utils/pattern';
import { isOsSizeName } from '../size-ids-field';
import { recipeHoldersByPiece } from '../piece-recipe-hold';
import {
  IDENTICAL_CUT_SYMMETRY,
  grainlineOptionsFor,
  importedCutSymmetry,
  isCutSymmetryMarked,
} from '../piece-codes';
import type { TechCardFormData } from '../schema';
import {
  type FabricScope,
  type RollGoodsLine,
  aliasInScope,
  aliasScopeKey,
  bindingForScope,
} from '../bom-purpose';
import { bareToken, normBlock } from './block-code';
import { blocksMissingOnLayer, defaultContourLayer, layerOptions } from './contour-layer';
import { defaultGrainLayer, grainLayerOptions } from './grain';
import { CanvasSegments, PieceSheet, type PieceMark } from './piece-sheet';
import { FuseFields, type InterliningLine } from './fuse-fields';
import { FuseOverlay } from './fuse-overlay';
import {
  readFuseSpec,
  writeFuseFields,
  type PieceFuseFields,
  type PieceFuseSpec,
} from './fuse-spec';
import {
  aliasIdentity,
  foreignManifestSizes,
  missingSizesIn,
  splitPiecesBySize,
  useDictionarySizeTokens,
} from './use-block-sizes';
import {
  useSizeNames,
  useSizeOrdering,
} from 'components/managers/model/components/use-size-systems';
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { useNesting, type NestingFile } from './use-nesting';
import { manifestFactsOf } from './manifest-facts';
import { isFetchFailure } from './dxf-warnings';
import { planOldPieceOps } from './old-pieces-ops';
import {
  hasOldPieceLoss,
  OldPiecesDecision,
  type OldPieceDecision,
  type OldPieceItem,
} from './old-pieces-panel';

// Tier-2 key: case, spacing and punctuation carry no meaning across CAD systems — «Полочка_1»,
// «полочка 1» and «POLOCHKA-1» are one name to a human, and to this.
function loose(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

// Sørensen–Dice over character bigrams: cheap, order-insensitive enough to survive a
// transposition, and it does not reward length the way a raw common-prefix score does.
function similarity(a: string, b: string): number {
  const A = loose(a);
  const B = loose(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  if (A.length < 2 || B.length < 2) return A === B ? 1 : 0;
  const grams = new Map<string, number>();
  for (let i = 0; i < A.length - 1; i++) {
    const g = A.slice(i, i + 2);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < B.length - 1; i++) {
    const g = B.slice(i, i + 2);
    const n = grams.get(g) ?? 0;
    if (n > 0) {
      grams.set(g, n - 1);
      hits++;
    }
  }
  return (2 * hits) / (A.length - 1 + (B.length - 1));
}

// Below this a suggestion is noise: it would cost more to check than to pick by hand, and a
// plausible-looking wrong default is worse than no default.
const SUGGEST_MIN = 0.6;

type BlockRow = {
  // ИДЕНТИЧНОСТЬ детали, а не имя блока из файла: BP_1_XS, BP_1_M и BP_1_XL — это одна деталь
  // кроя BP_1 в трёх размерах, и в списке она обязана быть одной строкой.
  block: string;
  instances: number; // how many times it appears in the file(s)
  // Размеры, в которых эта деталь нашлась. Показывается рядом с именем: это и есть видимое
  // доказательство, что строка смерженная, а не «случайно попался только один размер».
  sizes: string[];
  // Имя без токена UNI и без базового размера при нём — ключ, по которому uni-копии ОДНОЙ детали
  // узнают друг друга (`PCK_L_UNI_M` и `PCK_L_UNI_S` из склеенных по-размерных выгрузок). '' у
  // не-uni блоков. Служит ИМЕНЕМ ПО УМОЛЧАНИЮ для новой детали — см. defaultPieceName.
  uniBase: string;
  // What the dialog proposes and why. 'exact' | 'loose' need no badge — they ARE the name;
  // 'similar' and 'other-fabric' are guesses and say so.
  suggested: string; // piece lineKey, '' = none
  // 'same-name-elsewhere' — ТОЛЬКО у строк файла с манифестом (F6b): имя совпало с деталью, которая
  // привязана к ДРУГОЙ ткани и не к этой. Подкладочная FP_L и FP_L верха — разные детали кроя, и
  // совпадение имени здесь — подсказка, а не ответ: предлагается, но не выбирается само (K1, C5).
  basis: 'exact' | 'loose' | 'similar' | 'other-fabric' | 'same-name-elsewhere' | 'none';
  // Слот, с которого пришла подсказка 'other-fabric'. '' для остальных оснований.
  fromSlot?: string;
  choice: string; // piece lineKey, '' = unmapped, NEW = create a piece named after the block
  // ИМЯ ДЕТАЛИ КАРТОЧКИ ИЗ МАНИФЕСТА КОНВЕРТАЦИИ (F6b). У пары — без руки: FP_L и FP_R предлагают
  // одно имя «FP», и вторая строка по общему правилу привязывается к детали, которую заводит первая —
  // одна деталь, ×2 по perGarmentFromBlocks. Нет ключа — манифеста нет, имя по умолчанию прежнее.
  manifestName?: string;
};

// Деталь кроя, которой в перезалитом чертеже больше нет. Собирается ниже (deleteCandidates),
// рисуется секцией «в чертеже больше нет» — имя, исчезнувшие блоки и выбор «удалить/оставить».
type DeleteCandidate = {
  lineKey: string;
  name: string;
  // Написание блоков так, как их несёт алиас: это единственный ответ на вопрос «чего именно не
  // стало», сам чертёж про них уже ничего не скажет.
  blocks: string[];
};

// ИМЯ НОВОЙ ДЕТАЛИ ПО УМОЛЧАНИЮ — имя блока, а у помеченного токеном UNI его uniBase.
//
// Склейка по-размерных выгрузок CLO приносит ОДНУ неградуируемую деталь под двумя именами
// (`PCK_L_UNI_M` и `PCK_L_UNI_S`), и диалог заводил по детали кроя на каждое: две строки в
// карточке, два комплекта площадей и удвоенный карман в счётчиках — при том, что настил кроит
// один (dedupeUniPieces). Общее имя по умолчанию сводит их в ОДНУ деталь тем же механизмом,
// которым диалог всегда объединял строки с одинаковым именем: вторая привязывается к уже
// созданной. Ключ АЛИАСА при этом не меняется — он и остаётся сырым именем блока, как его
// хранит сервер, так что связь деталь↔чертёж сохраняется у обеих копий.
//
// Имя — предложение, а не приговор: оно стоит в поле «название новой детали» и правится там же.
//
// F6b: у строки файла с манифестом конвертации имя по умолчанию — заявленное конвертером (у пары — без
// руки, см. BlockRow.manifestName). Оно стоит ПЕРВЫМ: манифест знает про деталь больше, чем имя блока.
const defaultPieceName = (row: { block: string; uniBase: string; manifestName?: string }): string =>
  row.manifestName || row.uniBase || row.block;

// Sentinel for «создать новую деталь», deliberately unable to collide with a piece lineKey: a
// ULID is 26 chars of upper-case Crockford base32, so a '+' and lower case can never be one.
// (It used to be a string containing a raw NUL byte — invisible in every editor, and enough to
// make grep treat this whole file as binary.)
const CREATE = '+create';

// tech_card_piece.name is VARCHAR(255) and the server counts UTF-8 BYTES (Go len()), so a
// 255-character Cyrillic name is twice over the limit and would fail the whole card save.
const MAX_PIECE_NAME = 255;

// Выпущенная карточка заморожена целиком — тот же ответ, что у pieces-tab и index.tsx. Модалка
// рисуется порталом, то есть ВНЕ `<fieldset disabled={frozen}>` страницы, поэтому гасит себя сама.
const RELEASED_STATE = 'TECH_CARD_APPROVAL_STATE_RELEASED';
// After every panel that can move pieces or the BOM (the sheets read both off the stored card).
const FUSING_SHEETS_ORDER = 90;

// Поля детали, которые правит редактор справа. Буферизуются в модалке и пишутся в форму только
// по SAVE (cancel = ничего не было). Пути и семантика — ровно pieces-tab.tsx (fused/fusingMode/
// fusingWidthMm/ungraded/grainline/note); имя существующей детали — тоже здесь.
type PieceFields = Partial<PieceFuseFields> & {
  name?: string;
  ungraded?: boolean;
  grainline?: string;
  note?: string;
  // The whole fuse markup as the panel holds it (lib/fusing-dxf PieceFuseSpec). The stored fuse
  // fields are kept in step by writeFuseFields on every change.
  fuse?: PieceFuseSpec;
};
// The stored fuse fields of a piece, as the editor reads them off the form.
const FUSE_KEYS = [
  'fused',
  'fusingMode',
  'fusingWidthMm',
  'fusingBomLineKey',
  'fusingEdges',
  'fusingZone',
  'fusingInsetMm',
  'fusingInsetNet',
  'fusingGrain',
  'fusingDarts',
] as const satisfies readonly (keyof PieceFuseFields)[];
const FIELD_KEYS = [...FUSE_KEYS, 'ungraded', 'grainline', 'note'] as const;
const storedFuseOf = (p: Partial<PieceFuseFields> | undefined): Partial<PieceFuseFields> => {
  const out: Record<string, unknown> = {};
  if (p) for (const k of FUSE_KEYS) out[k] = p[k];
  return out as Partial<PieceFuseFields>;
};
// Arrays / the zone object compare by value: a re-read is a new object with the same content.
const sameField = (a: unknown, b: unknown) =>
  a === b || (typeof a === 'object' && JSON.stringify(a) === JSON.stringify(b ?? null));

// No width of its own: a `w-full` here beat the caller's `w-24`/`w-56` in the stylesheet and
// squeezed the row's name to nothing (the gone-pieces rows read just «delete»).
const selectCls =
  'block min-h-[22px] appearance-none rounded-none border border-borderColor bg-bgColor px-[7px] py-[3px] text-textBaseSize transition-colors focus:border-textColor focus:outline-none disabled:bg-pageBg disabled:text-labelColor';

// The piece panel beside the sheet: one type size (micro) and one box height (22px) for every
// field, toggle and select in it.
const BOX =
  'block h-[22px] w-full appearance-none rounded-none border border-borderColor bg-bgColor px-[7px] text-micro transition-colors focus:border-textColor focus:outline-none disabled:bg-pageBg disabled:text-labelColor';
const INPUT_BOX = 'h-[22px] py-0 text-micro';
const TOGGLE_BOX = 'h-[22px] w-full justify-center';

// Label row (micro uppercase label, an optional door on the right) over one box.
function PanelField({
  label,
  door,
  children,
}: {
  label: string;
  door?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className='space-y-0.5'>
      <div className='flex items-baseline justify-between gap-2'>
        <Text size='micro' variant='label' component='span' className='uppercase'>
          {label}
        </Text>
        {door}
      </div>
      {children}
    </div>
  );
}

type PieceValue = NonNullable<TechCardFormData['pieces']>[number];
// Что известно про идентичность из разбора: сколько раз она в чертеже (максимум по файлам и
// размерам) и общий корень uni-копий, если он есть.
//
// `force` — ТОЛЬКО у идентичностей из файла с манифестом (F6b): конвертер нарисовал КАЖДЫЙ контур
// детали сам — обе руки пары отдельными блоками ('pair') или деталь со сгиба развёрнутой целиком
// ('unfolded'). Такая деталь режется как нарисована, и хранимая «зеркальная пара» / «со сгиба» ей
// прямо противоречит (см. planPieceUpdates и forcedSymmetryReason).
type BlockCount = { instances: number; uniBase: string; force?: 'pair' | 'unfolded' };

// Строка подсчёта блоков разбора: то, что знает о идентичности диалог (см. countBlocks).
type CountedBlock = {
  block: string;
  instances: number;
  sizes: string[];
  uniBase: string;
  manifestName?: string;
  force?: 'pair' | 'unfolded';
};

// ПОЧЕМУ ХРАНИМАЯ РАЗМЕТКА ПЕРЕПИСЫВАЕТСЯ НА «ОДИНАКОВЫЕ КОПИИ» (F6b) — словами для сводки.
//
// Решение и его цена записаны в tmp/plans/pdf-to-dxf/reports/F6b.md (D1). Коротко: раскладка
// карточки кладёт каждый контур как нарисован и НИКОГДА не отражает (flippedQuantity не ставится нигде),
// поэтому в настиле ЛИЦОМ ВВЕРХ (его и предлагает очередь партии) обе руки пары дают только два
// нарисованных блока — «зеркальная пара» там BLOCKER `lay_mirror_expansion`, а «одинаковые копии»
// считаются верно. В настиле ЛИЦОМ К ЛИЦУ сервер сочтёт отражения «одинаковой» детали перекроем и
// покажет ложную нехватку ×½ — это известная цена, она названа в сводке, а не скрыта.
const FORCED_REASON: Record<'pair' | 'unfolded', string> = {
  pair: 'the drawing carries both hands as separate pieces — cut as drawn',
  unfolded: 'the drawing carries the unfolded piece — cut flat, not on the fold',
};

// Подсчёт блоков разбора — тело эффекта диалога, вынесенное ЧИСТОЙ функцией, чтобы зонд проверял
// именно его, а не копию (K1 держал REPLICA этого цикла).
function countBlocks(
  contourPieces: readonly PieceDTO[],
  split: ReturnType<typeof splitPiecesBySize>,
): Map<string, CountedBlock> {
  // Blocks are counted under the SERVER's identity — normalized then case-folded — because
  // that is what its UNIQUE index collapses. Counting case-sensitively made «ПОЛОЧКА» in one
  // sheet and «Полочка» in another two rows, both auto-preselected, and the resulting pair of
  // aliases was rejected as a duplicate: the card then could not be saved at all, with the bad
  // aliases sitting in form state where nothing could delete them.
  // Per FILE, then max across files: two pattern rows of one fabric+size are usually two
  // REVISIONS of the same sheet, so summing their instances doubled pieces_per_garment and
  // every consumption derived from it.
  const perFile = new Map<string, Map<string, number>>();
  const spelling = new Map<string, string>(); // ci key → first spelling seen, stored verbatim
  const sizesByCi = new Map<string, Set<string>>(); // ci key → размеры, в которых деталь есть
  const uniBaseByCi = new Map<string, string>(); // ci key → uniBase у помеченных блоков
  // F6b: факты манифеста по идентичности (первое написание выигрывает, как у spelling).
  const declaredByCi = new Map<string, { name: string; force?: 'pair' | 'unfolded' }>();
  for (const p of contourPieces) {
    // The IDENTITY, not the raw block: one DXF carries the whole grade («BP_1_XS», «BP_1_M»…),
    // and those are one cut piece in five sizes, not five pieces. Stripping the size suffix
    // here is what keeps the piece count a property of the STYLE.
    const b = normBlock(split.codeById.get(p.id)?.identity ?? p.blockName ?? '');
    if (!b) continue; // a file with no per-piece blocks has nothing to map
    const ci = b.toLowerCase();
    if (!spelling.has(ci)) spelling.set(ci, b);
    const uniBase = split.codeById.get(p.id)?.uniBase ?? '';
    if (uniBase && !uniBaseByCi.has(ci)) uniBaseByCi.set(ci, normBlock(uniBase));
    const declared = manifestFactsOf(p);
    if (declared && !declaredByCi.has(ci)) {
      const force = declared.pairOf ? 'pair' : declared.unfolded ? 'unfolded' : undefined;
      declaredByCi.set(ci, { name: normBlock(declared.cardName), ...(force ? { force } : {}) });
    }
    const sz = split.codeById.get(p.id)?.size ?? '';
    if (sz) {
      const set = sizesByCi.get(ci) ?? new Set<string>();
      set.add(sz);
      sizesByCi.set(ci, set);
    }
    // Bucketed by the file's INDEX **and the size**, not by the file alone. Two sheets
    // legitimately share a display name (two revisions re-exported by the factory under one
    // filename), so the name cannot separate them — and now that one file holds every size,
    // counting per file would report «BP_1 ×5» for a piece cut once per garment, multiplying
    // pieces_per_garment and every consumption derived from it by the size run.
    const bucket = `${p.fileIndex ?? p.source}|${split.codeById.get(p.id)?.size ?? ''}`;
    const file = perFile.get(bucket) ?? new Map<string, number>();
    file.set(ci, (file.get(ci) ?? 0) + 1);
    perFile.set(bucket, file);
  }
  const counts = new Map<string, number>();
  for (const file of perFile.values()) {
    for (const [ci, n] of file) counts.set(ci, Math.max(counts.get(ci) ?? 0, n));
  }
  const all = new Map<string, CountedBlock>();
  for (const [ci, instances] of counts) {
    const sizes = [...(sizesByCi.get(ci) ?? [])].sort(
      (a, b) => (split.orderOfSize.get(a) ?? 1e6) - (split.orderOfSize.get(b) ?? 1e6),
    );
    const declared = declaredByCi.get(ci);
    all.set(ci, {
      block: spelling.get(ci)!,
      instances,
      sizes,
      uniBase: uniBaseByCi.get(ci) ?? '',
      ...(declared ? { manifestName: declared.name } : {}),
      ...(declared?.force ? { force: declared.force } : {}),
    });
  }
  return all;
}

// Предложение по строкам — второе тело того же эффекта, тоже чистой функцией. `elsewhereOnly` —
// детали (lineKey, ci), привязанные к ДРУГИМ тканям и ни разу к этой: по ним строка файла с
// манифестом получает 'same-name-elsewhere' вместо автоматического выбора (F6b). Блоки без
// манифеста этот набор не читают вовсе.
function proposeRows(
  counted: ReadonlyMap<string, CountedBlock>,
  args: {
    storedFirst: ReadonlyMap<string, string>;
    pieceOptions: readonly { lineKey: string; name: string }[];
    otherFabricByBlock: ReadonlyMap<string, { pieceKey: string; fromSlot: string }>;
    elsewhereOnly: ReadonlyMap<string, string>;
  },
): BlockRow[] {
  const { storedFirst, pieceOptions, otherFabricByBlock, elsewhereOnly } = args;
  const next: BlockRow[] = [];
  for (const [ci, c] of counted) {
    const block = c.block;
    const instances = c.instances;
    // "Already mapped" is tested on the SERVER's key, not on loose(): loose() strips all
    // punctuation, so «полочка 1» stored would have hidden a genuinely distinct «полочка-1»
    // from the dialog with no way to ever map it.
    if (storedFirst.has(ci)) continue;
    let suggested = '';
    let basis: BlockRow['basis'] = 'none';
    let fromSlot = '';
    // F6b: строка с манифестом сверяется ещё и по имени детали карточки, заявленному конвертером
    // (у пары — «FP» для FP_L и FP_R): деталь, заведённую мастером конвертации, она узнаёт сама.
    const names =
      c.manifestName && c.manifestName.toLowerCase() !== block.toLowerCase()
        ? [block, c.manifestName]
        : [block];
    const exact = pieceOptions.find((p) =>
      names.some((n) => p.name.toLowerCase() === n.toLowerCase()),
    );
    const byLoose = pieceOptions.find((p) => names.some((n) => loose(p.name) === loose(n)));
    const hint = otherFabricByBlock.get(loose(block));
    if (exact) {
      suggested = exact.lineKey;
      basis = 'exact';
    } else if (byLoose) {
      suggested = byLoose.lineKey;
      basis = 'loose';
    } else if (hint && pieceOptions.some((p) => p.lineKey === hint.pieceKey)) {
      suggested = hint.pieceKey;
      basis = 'other-fabric';
      fromSlot = hint.fromSlot;
    } else {
      let best = SUGGEST_MIN;
      for (const p of pieceOptions) {
        const s = similarity(p.name, block);
        if (s >= best) {
          best = s;
          suggested = p.lineKey;
          basis = 'similar';
        }
      }
    }
    // F6b: точное имя у ДРУГОЙ ткани — не ответ. Деталь подкладки FP_L и деталь верха FP_L — разные
    // детали кроя; автоматический выбор здесь молча посадил бы подкладку на деталь верха.
    if (c.manifestName && (basis === 'exact' || basis === 'loose')) {
      const from = elsewhereOnly.get(suggested.toLowerCase());
      if (from !== undefined) {
        basis = 'same-name-elsewhere';
        fromSlot = from;
      }
    }
    // Only the two exact tiers bind to an existing piece by default. A similarity guess or another
    // fabric's mapping is never applied — being wrong there costs cloth. Everything else defaults
    // to a NEW piece named after the block (patterns-lite: the target action is one SAVE; the old
    // «create all» button is now the default). The editor still offers «not a piece».
    const preselect = basis === 'exact' || basis === 'loose' ? suggested : CREATE;
    next.push({
      block,
      instances,
      sizes: c.sizes,
      uniBase: c.uniBase,
      suggested,
      basis,
      fromSlot,
      choice: preselect,
      ...(c.manifestName ? { manifestName: c.manifestName } : {}),
    });
  }
  next.sort((a, b) => a.block.localeCompare(b.block, 'ru'));
  return next;
}

// СКОЛЬКО ЭТОЙ ДЕТАЛИ В ИЗДЕЛИИ — ОДНА ФУНКЦИЯ НА ОБА ПУТИ (заведение и пересчёт).
//
// Правило одно: СУММА по РАЗЛИЧНЫМ деталям чертежа, МАКСИМУМ по копиям ОДНОЙ. «PLANKA_L» и
// «PLANKA_R» — две панели в изделии; `PCK_L_UNI_M` и `PCK_L_UNI_S` из склеенных по-размерных
// выгрузок CLO — одна деталь, нарисованная дважды, и настил кроит её один раз.
//
// НАХОДКА 4 адверсарного ревью: у пересчёта (planPieceUpdates) это правило было, а путь СОЗДАНИЯ
// сворачивал все блоки одной новой детали максимумом. Оператор, назвавший «PLANKA_L» и «PLANKA_R»
// одним именем, получал деталь с ×1, а следующее открытие диалога молча переписывало её на ×2 —
// то есть первое применение врало, а второе меняло данные без единой правки в чертеже. Две копии
// одного правила разъезжаются молча, поэтому копия здесь ровно одна.
function perGarmentFromBlocks(blocks: readonly { identity: string; instances: number }[]): number {
  const byIdentity = new Map<string, number>();
  for (const b of blocks) {
    // Ключ — общий корень uni-копий, если он есть, иначе сама идентичность: этим одним ключом и
    // отличается «две разные детали» от «двух копий одной».
    const k = b.identity.trim().toLowerCase();
    if (!k) continue;
    byIdentity.set(k, Math.max(byIdentity.get(k) ?? 0, b.instances));
  }
  let total = 0;
  for (const n of byIdentity.values()) total += n;
  return total;
}

// ЕСТЬ ЛИ ЭТОТ БЛОК В ЧЕРТЕЖЕ — СЛАБАЯ форма имени, общая для обеих сторон сравнения.
//
// НАХОДКА 2 адверсарного ревью. Свёртка алиаса к идентичности (aliasIdentity) спрашивает ФАЙЛ, а
// не форму имени, и это правильно: «FP_L» — левая полочка, и резать у неё «L» нельзя. Но вердикт
// о размерном хвосте выносит `deriveBlockSizes`, а он требует у основы имени НЕ МЕНЕЕ ДВУХ
// размерных хвостов — то есть в наборе с ОДНИМ размером не выносится вовсе. Тогда старый алиас
// «BP_1_XS» остаётся сам собой, файл несёт «BP_1_M», идентичности не совпадают — и живая деталь
// уходит в кандидаты на удаление вместе со строками рецепта и замерами.
//
// Отсюда вторая, заведомо более грубая форма: имя без последнего токена, если тот ВООБЩЕ бывает
// размером по словарю. Она используется ТОЛЬКО чтобы признать деталь присутствующей, никогда —
// чтобы объявить её исчезнувшей: «BP_1_XS» и «BP_1_M» сходятся на «bp_1», а «FP_L» и «FP_R» не
// сходятся ни на чём (у «R» размера не бывает). Ложное совпадение здесь оставляет лишнюю деталь в
// карточке — её видно и её удаляют руками; ложное расхождение уносит работу без следа.
function sizelessStem(block: string, isSizeToken: (token: string) => boolean): string {
  const parts = normBlock(block).split('_');
  if (parts.length < 2) return '';
  if (!isSizeToken(bareToken(parts[parts.length - 1]))) return '';
  const stem = parts.slice(0, -1).join('_').trim();
  return stem.toLowerCase();
}

// Что применение изменит у ОДНОЙ уже существующей детали. Незаполненное поле значит «не трогать»:
// запись того, что и так стоит, — это лишний dirty на форме и лишний сдвиг дайджеста CONSTRUCTION,
// то есть подпись, протухшая без единого изменения физического состава кроя.
//
// `reason` — только когда переписывается ЯВНАЯ разметка по манифесту конвертации (F6b): сводка обязана
// назвать, почему «зеркальная пара» или «со сгиба» стала «одинаковыми копиями».
type PieceUpdate = {
  index: number;
  piecesPerGarment?: number;
  cutSymmetry?: string;
  reason?: string;
};

// ЧТО ЭТОТ СКОУП БУДЕТ СВЯЗЫВАТЬ ПОСЛЕ ПРИМЕНЕНИЯ — блок (идентичность, ci) → деталь кроя.
//
// Считается ДО нажатия кнопки, потому что кнопка обязана называть свои исходы заранее. Порядок
// повторяет apply() ровно: хранимая привязка → снятые связи → выбор оператора в строках. Разойдись
// эти два прохода, и сводка обещала бы одно, а применение делало другое — а проверить это можно
// было бы только по сохранённой карточке, то есть после.
//
// Детали, заводимые ЭТИМ применением, в карту не попадают: в массиве формы их ещё нет, их × и
// разметку кладёт create-путь apply(). Здесь они только считаются — это N сводки.
function plannedScopeBinding(
  live: readonly PieceValue[],
  storedByBlock: ReadonlyMap<string, string>,
  unmapped: readonly string[],
  rows: readonly BlockRow[],
  draftNames: Record<string, string>,
): { bound: Map<string, string>; created: number; reused: number } {
  const liveKeys = new Set(
    live.map((p) => (p.lineKey ?? '').trim().toLowerCase()).filter(Boolean) as string[],
  );
  const keyByName = new Map<string, string>();
  for (const p of live) {
    const n = p.name?.trim().toLowerCase();
    if (n && p.lineKey?.trim()) keyByName.set(n, p.lineKey.trim());
  }
  const bound = new Map<string, string>();
  for (const [ci, pieceLineKey] of storedByBlock) {
    if (liveKeys.has(pieceLineKey.trim().toLowerCase())) bound.set(ci, pieceLineKey);
  }
  for (const b of unmapped) bound.delete(b);
  const createdNames = new Set<string>();
  let reused = 0;
  for (const r of rows) {
    if (!r.choice) continue;
    const ci = r.block.toLowerCase();
    if (r.choice !== CREATE) {
      bound.set(ci, r.choice);
      reused += 1;
      continue;
    }
    // Напечатанное имя, уже существующее в карточке, ПРИВЯЗЫВАЕТ к той детали, а не заводит вторую
    // с тем же именем (сервер такую пару отвергает целиком) — то же правило, что в apply().
    const name = ((draftNames[ci] ?? '').trim() || defaultPieceName(r)).toLowerCase();
    const existing = keyByName.get(name);
    if (existing) {
      bound.set(ci, existing);
      reused += 1;
      continue;
    }
    // Вторая uni-копия приходит с тем же именем по умолчанию и прицепляется к уже заводимой
    // детали — новой деталью она не считается, иначе сводка обещала бы две там, где будет одна.
    if (createdNames.has(name)) continue;
    createdNames.add(name);
  }
  return { bound, created: createdNames.size, reused };
}

// ПЕРЕСЧЁТ «× НА ИЗДЕЛИЕ» И АВТОРАЗМЕТКА «КАК КРОИТСЯ» у деталей, привязанных к этому скоупу.
// Модалка — единственный автор обоих полей: редакторы у детали убираются, и число, которое
// когда-то правили руками, теперь целиком читается из чертежа.
//
// × = СУММА по РАЗЛИЧНЫМ деталям чертежа: «PLANKA_L» и «PLANKA_R», привязанные к одной детали
// кроя, — это две панели в изделии. Но КОПИИ одной детали складывать нельзя: склейка по-размерных
// выгрузок CLO приносит одну неградуируемую деталь под двумя именами (`PCK_L_UNI_M` и
// `PCK_L_UNI_S`, общий uniBase), а настил кроит её ОДИН раз. Поэтому копии сворачиваются
// максимумом — тем же правилом, каким create-путь apply() сводит их при заведении. Разойдись эти
// два места, и повторное открытие модалки перебивало бы × у детали, которую она сама только что
// завела, без единой правки в файлах.
//
// Идентичность, которой в разборе нет, не вносит НИЧЕГО, а деталь, у которой не нашлось ни одной,
// пропускается целиком: ноль на изделие — это не «пересчитали», это стёрли. Этим же условием
// закрыт кандидат на удаление, которого оператор оставил «оставить»: его блоков в чертеже нет, и
// утверждать по такому чертежу «режется как нарисовано» было бы выдумыванием факта — ровно тем, от
// которого бережёт правило про явную разметку ниже.
//
// НАХОДКА 2 второго адверсарного ревью — `complete`. По НЕПОЛНОМУ разбору × и разметка у УЖЕ
// СУЩЕСТВУЮЩИХ деталей не трогаются вовсе. Раньше неполнота запрещала только удаление, а пересчёт
// продолжал считать по тому, что прочиталось: блоки одной детали законно лежат в двух файлах
// (верх + подкладка одного назначения, две по-размерных выгрузки), и потеря одного листа занижала
// «× на изделие» — а вслед за числом менялась и проставляемая симметрия (нечётное количество
// объявляет зеркальную пару невозможной и сбрасывает её в «одинаковые копии»). «Этой детали в
// изделии столько-то» — утверждение про ПОЛНЫЙ набор, и на неполном оно не выносится. Редакторов
// обоих полей в карточке не осталось, так что заниженное число оператору исправить нечем.
//
// Заведение новых деталей и сопоставление при этом продолжают работать: они утверждают про то, что
// В файле ЕСТЬ, а не про то, сколько его всего.
function planPieceUpdates(
  live: readonly PieceValue[],
  bound: ReadonlyMap<string, string>,
  blockCounts: ReadonlyMap<string, BlockCount>,
  complete: boolean,
): { updates: PieceUpdate[]; unchanged: number } {
  const blocksByPiece = new Map<string, string[]>();
  for (const [ci, pieceLineKey] of bound) {
    const k = pieceLineKey.trim().toLowerCase();
    if (!k) continue;
    const list = blocksByPiece.get(k) ?? [];
    list.push(ci);
    blocksByPiece.set(k, list);
  }
  const updates: PieceUpdate[] = [];
  let unchanged = 0;
  live.forEach((p, index) => {
    const cis = blocksByPiece.get((p.lineKey ?? '').trim().toLowerCase());
    if (!cis || cis.length === 0) return; // деталь не этой ткани — модалка про неё не знает ничего
    // Набор блоков неполон — считать «сколько этой детали в изделии» не по чему (см. заголовок).
    // Деталь идёт в «без изменений», а не пропускается молча: сводка обязана показать, что модалка
    // её ВИДЕЛА и не тронула, иначе ноль в «обновить ×» читается как «диалог ничего не заметил».
    if (!complete) {
      unchanged += 1;
      return;
    }
    // Правило считает perGarmentFromBlocks — та же функция, которой считает путь СОЗДАНИЯ в
    // apply(). Здесь остаётся только достать из разбора то, что она складывает.
    const total = perGarmentFromBlocks(
      cis.flatMap((ci) => {
        const found = blockCounts.get(ci);
        // Пустой (или пробельный) uniBase — это «копий нет», а не ключ: подставляется сама
        // идентичность, иначе блок выпал бы из счёта молча.
        return found ? [{ identity: found.uniBase.trim() || ci, instances: found.instances }] : [];
      }),
    );
    if (total <= 0) {
      unchanged += 1;
      return;
    }
    const update: PieceUpdate = { index };
    if ((p.piecesPerGarment ?? 0) !== total) update.piecesPerGarment = total;
    const current = (p.cutSymmetry ?? '').trim();
    // F6b: блоки детали пришли из файла с манифестом, и конвертер нарисовал КАЖДЫЙ её контур сам —
    // обе руки пары или развёрнутый сгиб. Пара побеждает сгиб в подписи: она называет больше.
    const forced = cis
      .map((ci) => blockCounts.get(ci)?.force)
      .reduce<
        'pair' | 'unfolded' | undefined
      >((acc, f) => (acc === 'pair' || f === 'pair' ? 'pair' : acc ?? f), undefined);
    // ОДНО правило с apply импорта (piece-codes `importedCutSymmetry`); ниже — почему каждая ветка.
    const symmetry = importedCutSymmetry(current, total, forced);
    if (symmetry && forced) {
      // Чертёж конвертера несёт каждый контур, раскладка карточки кладёт их как нарисованы и не
      // отражает ничего — значит деталь режется как нарисована, и хранимая «зеркальная пара» или
      // «со сгиба» ему прямо противоречит (первая — BLOCKER настила лицом вверх, второй печатает
      // «on fold» на полной детали). Расчёт и цена (лицом к лицу) — FORCED_REASON выше.
      update.cutSymmetry = symmetry;
      if (isCutSymmetryMarked(current)) update.reason = FORCED_REASON[forced];
    } else if (symmetry && !isCutSymmetryMarked(current)) {
      // Не размечено — значит никто не отвечал, а чертёж отвечает: он несёт КАЖДЫЙ контур, и
      // деталь режется как нарисована. Молчание здесь не нейтрально — оно гасит выводы бэка
      // (клетка покрытия настила становится UNKNOWN, проверки зеркального разворота и перекроя
      // перестают судить), поэтому ответ ставится, а не оставляется на потом.
      update.cutSymmetry = symmetry;
    } else if (symmetry) {
      // = cutSymmetryCountInvalid(current, total):
      // Единственное исключение к «явную разметку не трогаем»: новое количество делает хранимую
      // зеркальную пару невозможной (нечётное или < 2), и сохранение ВСЕЙ карточки упёрлось бы в
      // серверную проверку и двухколоночный CHECK `chk_tcp_mirrored_needs_even_count`.
      //
      // Ставится сразу IDENTICAL, а НЕ UNKNOWN. Чертёж авторитетнее пометки ровно тогда, когда
      // ПРЯМО ей противоречит: зеркальная пара из нечётного числа контуров невозможна, а сам
      // чертёж несёт каждый контур отдельно — значит деталь режется как нарисована. И это же
      // делает результат УСТОЙЧИВЫМ (находка 3 адверсарного ревью): UNKNOWN здесь читался
      // следующим проходом как «не размечено», ветка выше ставила ему IDENTICAL — и повторное
      // применение БЕЗ единой правки в чертеже меняло данные и роняло подписи. Теперь второй
      // проход не меняет ничего: cutSymmetryCountInvalid у IDENTICAL всегда false.
      update.cutSymmetry = symmetry;
    }
    // Явные «зеркальные пары» и «со сгибом», которым новое количество не противоречит, остаются
    // как есть: человек утверждал факт, и чертёж ему не возражает.
    if (update.piecesPerGarment === undefined && update.cutSymmetry === undefined) {
      unchanged += 1;
      return;
    }
    updates.push(update);
  });
  return { updates, unchanged };
}

export function PieceMatchModal({
  files,
  scope,
  fabricName,
  scopeLabelByKey,
  sizeLabel,
  colorways,
  pieceAreaScopes,
  techCardId,
  readOnly: readOnlyProp,
  onClose,
}: {
  files: NestingFile[] | null; // null = closed
  // The cloth this pass is about: a назначение with every line sorted into it, or a single line
  // nobody has sorted yet. Both halves matter — the KEY is what gets written, the LINES are what
  // decides which stored aliases already belong here.
  scope: FabricScope<RollGoodsLine>;
  fabricName: string;
  // Подпись скоупа по его ключу — чтобы подсказка «по другой ткани» могла сказать, ПО КАКОЙ.
  // Ключи строк тоже есть в карте: подсказка может прийти с алиаса, лежащего ещё на строке.
  scopeLabelByKey?: Map<string, string>;
  sizeLabel?: string;
  // ЧТО ДЕРЖИТСЯ НА ДЕТАЛЯХ — читается с СЕРВЕРА, а не из формы, и это не оплошность: ни строк
  // рецепта колорвея, ни замеренных площадей в форме карточки нет вовсе. Рецепт правится своим RPC,
  // площади пишет SaveTechCardPieceAreas — а удаление детали уносит и то, и другое (сервер чистит
  // обе таблицы в транзакции сохранения карточки). Показать состав потерь можно только отсюда.
  colorways?: readonly common_AdminColorwayRef[];
  pieceAreaScopes?: readonly common_TechCardPieceAreaScope[];
  // Карточка этой формы: размеры из манифеста ДРУГОЙ карточки сами в ряд не пишутся (F14f).
  techCardId?: number;
  // Optional override: the caller may already know the card cannot be edited (no write right).
  // A RELEASED card is detected here on its own either way.
  readOnly?: boolean;
  onClose: () => void;
}) {
  const { control, setValue, getValues } = useFormContext<TechCardFormData>();
  const { data: cardRead } = useTechCard(techCardId);
  const staging = useTechCardStaging();
  const readOnly = !!readOnlyProp || cardRead?.techCard?.approvalState === RELEASED_STATE;
  // Pieces are written by setValue on the ARRAY ROOT, not through a second useFieldArray.
  //
  // This looks like the thing pieces-tab.tsx warns against, and it is the opposite. Measured
  // against react-hook-form 7.62: `append` calls `_setFieldArray`, which emits ONLY on
  // `_subjects.state` — `_subjects.array` is fired from exactly two places, setValue on a field
  // array name and reset. So an append made HERE never reaches the useFieldArray that PiecesTab
  // owns on the same name: its `fields` stay as they were, and a piece created from this dialog
  // was invisible in the «детали кроя» table until the card was saved and refetched. The piece DID
  // exist in form values, so every other reader of the array listed it — two views of one array
  // disagreeing is worse than either being empty.
  //
  // The root write regenerates every field id, so the pieces table's rows remount. That costs
  // nothing but DOM focus here: those rows are fully CONTROLLED (value from useWatch + setValue
  // on change, not `register`), so a remount cannot lose a typed value — and this dialog is a
  // modal over the PATTERNS tab, which is where that table now lives, so it is behind the modal
  // and nothing in it is mid-edit. Aliases have no field array at all and always took an ordinary
  // setValue.
  const pieces = (useWatch({ control, name: 'pieces' }) ?? []) as TechCardFormData['pieces'];
  const aliases = (useWatch({ control, name: 'pieceDxfAliases' }) ??
    []) as TechCardFormData['pieceDxfAliases'];
  // The fusibles a piece can be fused with: the INTERLINING lines of the BOM.
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as TechCardFormData['bomItems'];
  const interlinings = useMemo<InterliningLine[]>(
    () =>
      (bomItems ?? [])
        .filter((b) => b.section === 'TECH_CARD_BOM_SECTION_INTERLINING' && b.lineKey?.trim())
        .map((b) => ({
          key: b.lineKey!.trim(),
          label:
            [b.supplierRef?.trim(), b.name?.trim()].filter(Boolean).join(' · ') || 'interlining',
          color: b.color ?? '',
        })),
    [bomItems],
  );
  const { parse, reparse } = useNesting(files);
  // РАЗБОР ПОЛОН — одно выражение на весь файл. Полнота (файлы скачаны и прочитаны ВСЕ, ни один блок
  // внутри них не пропущен) решает судьбу ДВУХ исходов сразу: предложений об удалении (находка 1
  // первого ревью) и пересчёта «× на изделие» с разметкой кроя (находка 2 второго). Собирать это
  // условие заново в каждом месте нельзя — однажды соберут не полностью, и это будет молчаливая
  // потеря данных оператора, которых он не сможет ни увидеть, ни исправить.
  const parseComplete = parse.phase === 'ready' && parse.complete;
  // One DXF carries the whole grade, so the size lives in the block name and has to be split off
  // before anything else: the piece «BP_1» exists once for the style, not once per size.
  const dictTokens = useDictionarySizeTokens();
  const allPieces = useMemo(() => (parse.phase === 'ready' ? parse.pieces : []), [parse]);
  const split = useMemo(() => splitPiecesBySize(allPieces, dictTokens), [allPieces, dictTokens]);
  // A block carries the piece on more than one layer (sewing line and cutting line). Only ONE of
  // them is the piece; the other must not reach the counting, or every block would be counted
  // twice and pieces_per_garment would double.
  const layerOpts = useMemo(() => layerOptions(allPieces, split.codeById), [allPieces, split]);
  // Always the heuristic's answer (patterns-lite #6): the override was never persisted, and
  // nobody should have to know what a contour layer is.
  const contourLayer = defaultContourLayer(layerOpts);
  const contourPieces = useMemo(
    () => allPieces.filter((p) => (p.layer ?? '') === contourLayer),
    [allPieces, contourLayer],
  );
  // Блоки, которых на выбранном слое нет вовсе: их не будет ни на листе, ни в списке.
  const missingOnLayer = useMemo(
    () => blocksMissingOnLayer(allPieces, contourLayer),
    [allPieces, contourLayer],
  );
  // Долевая на листе — та же линия, по которой раскладка разворачивает деталь.
  const grainLayer = useMemo(() => defaultGrainLayer(grainLayerOptions(allPieces)), [allPieces]);
  // Слои внутренней геометрии, найденные в файле: линия шва, надсечки, свёрла, вытачки. По
  // умолчанию показываются ВСЕ — деталь без них это голый силуэт, а режут именно по ним.
  const innerLayerNames = useMemo(() => {
    const seen = new Map<string, number>();
    for (const p of contourPieces) {
      for (const c of p.inner ?? []) {
        if (c.layer === grainLayer) continue; // долевая рисуется отдельно и красным
        seen.set(c.layer, (seen.get(c.layer) ?? 0) + 1);
      }
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [contourPieces, grainLayer]);
  const innerLayers = useMemo(() => new Set(innerLayerNames.map(([l]) => l)), [innerLayerNames]);
  // Размеры, которые есть в файле, но не заведены в карточке. Пока их там нет, хвост у таких
  // блоков не отрезается — и одна деталь двоится на строку в каждом непризнанном размере.
  const sizeById = useSizeNames();
  // Сколько операций сборки ссылается на деталь. Применение снимает эти ссылки САМО — и раньше
  // делало это молча, а операция, оставшаяся без детали, это потерянная работа технолога: он
  // расставлял их по деталям вручную. Число обязано стоять в составе потерь рядом с рецептом.
  const operations = (useWatch({ control, name: 'operations' }) ??
    []) as TechCardFormData['operations'];
  const opsByPiece = useMemo(() => {
    const out = new Map<string, number>();
    for (const o of operations ?? []) {
      for (const k of o?.inputKeys ?? []) {
        const key = (k ?? '').trim().toLowerCase();
        if (!key) continue;
        out.set(key, (out.get(key) ?? 0) + 1);
      }
    }
    return out;
  }, [operations]);
  const cardSizeIds = (useWatch({ control, name: 'sizeIds' }) ?? []) as number[];
  const orderSizes = useSizeOrdering();
  const fileSizes = useMemo(
    () => missingSizesIn(allPieces, dictTokens, cardSizeIds, sizeById, techCardId),
    [allPieces, dictTokens, cardSizeIds, sizeById, techCardId],
  );
  // OS (one size) and graded sizes exclude each other (size-ids-field). A graded file on a one-size
  // card appends NOTHING: it surfaces as a warning whose action swaps OS for the file's sizes. An
  // OS file on a graded card adds nothing either.
  const isOsId = (id: number) => {
    const raw = sizeById.get(id);
    return raw != null && isOsSizeName(raw);
  };
  const cardIsOs = cardSizeIds.some(isOsId);
  const cardIsGraded = cardSizeIds.some((id) => sizeById.has(id) && !isOsId(id));
  // Graded sizes of the file that the OS line keeps out of the card.
  const gradedOnOs = useMemo(
    () => (cardIsOs ? fileSizes.filter((m) => !isOsId(m.sizeId)) : []),
    // isOsId reads sizeById.
    [cardIsOs, fileSizes, sizeById],
  );
  const missingSizes = useMemo(() => {
    if (cardIsOs) return [];
    const fileGraded = fileSizes.some((m) => !isOsId(m.sizeId));
    return cardIsGraded || fileGraded ? fileSizes.filter((m) => !isOsId(m.sizeId)) : fileSizes;
    // isOsId reads sizeById.
  }, [cardIsOs, cardIsGraded, fileSizes, sizeById]);
  // F14f: что пишется само, а что только предлагается (манифест другой карточки, карточка без
  // размеров) — второе добавляет человек из предупреждения.
  const autoSizes = useMemo(() => missingSizes.filter((m) => !m.confirm), [missingSizes]);
  const proposedSizes = useMemo(() => missingSizes.filter((m) => m.confirm), [missingSizes]);
  // Swap OS for the file's graded sizes, pruning like removing OS in size-ids-field: DXF rows on OS
  // are re-filed onto the smallest new size. A PDF on OS would be lost, so the swap waits for it.
  const patterns = (useWatch({ control, name: 'patterns' }) ?? []) as Array<{
    sizeId?: number;
    url?: string;
  }>;
  const osPdfs = patterns.filter((p) => p.sizeId != null && isOsId(p.sizeId) && !isDxfUrl(p.url));
  const switchToFileSizes = () => {
    if (gradedOnOs.length === 0 || osPdfs.length > 0) return;
    const next = orderSizes([
      ...cardSizeIds.filter((id) => !isOsId(id)),
      ...gradedOnOs.map((m) => m.sizeId),
    ]);
    setValue('sizeIds', next, { shouldDirty: true });
    const target = next[0] ?? 0;
    const current = (getValues('patterns') ?? []) as typeof patterns;
    if (current.some((p) => p.sizeId != null && isOsId(p.sizeId))) {
      setValue(
        'patterns',
        current.map((p) =>
          p.sizeId != null && isOsId(p.sizeId) ? { ...p, sizeId: target } : p,
        ) as TechCardFormData['patterns'],
        { shouldDirty: true },
      );
    }
    setAddedSizes((prev) => [...prev, ...gradedOnOs.map((m) => formatSizeName(m.name))]);
  };
  // F14: размеры манифеста другой карточки или вне системы карточки не берутся из него — сказать.
  const foreignSizes = useMemo(
    () => foreignManifestSizes(allPieces, cardSizeIds, sizeById, techCardId),
    [allPieces, cardSizeIds, sizeById, techCardId],
  );
  // Размеры из файла заводятся в карточку САМИ, как только разбор закончился: файл — источник
  // истины о том, какие размеры у стиля есть, а ручная кнопка означала бы, что деталь может
  // остаться разорванной на строку в каждом непризнанном размере просто потому, что кнопку не
  // нажали. Пишется в форму, то есть видно сразу и сохраняется вместе с карточкой.
  //
  // Через корень массива: size-ids-field держит на нём свой useFieldArray, а append оттуда его
  // бы не уведомил — измерено на RHF 7.62 (см. комментарий у записи pieces).
  const [addedSizes, setAddedSizes] = useState<string[]>([]);
  const addedRef = useRef(false);
  useEffect(() => {
    if (parse.phase !== 'ready' || addedRef.current || autoSizes.length === 0 || readOnly) return;
    addedRef.current = true;
    setAddedSizes(autoSizes.map((m) => formatSizeName(m.name)));
    setValue('sizeIds', orderSizes([...cardSizeIds, ...autoSizes.map((m) => m.sizeId)]), {
      shouldDirty: true,
    });
  }, [parse.phase, autoSizes, cardSizeIds, orderSizes, setValue, readOnly]);
  // Предложенные размеры (F14f) — только по явному нажатию; тем же путём записи, что и выше.
  const addProposedSizes = () => {
    if (proposedSizes.length === 0) return;
    setAddedSizes((prev) => [...prev, ...proposedSizes.map((m) => formatSizeName(m.name))]);
    setValue('sizeIds', orderSizes([...cardSizeIds, ...proposedSizes.map((m) => m.sizeId)]), {
      shouldDirty: true,
    });
  };
  // A stored alias may still carry a size-suffixed name from before the split existed. Folding it
  // through the same rule collapses «BP_1_XS» and «BP_1_M» onto the one identity they always
  // meant, and the full-set write then rewrites them in that form. The rule asks the FILE, not the
  // shape of the name: «FP_L» is a whole piece name (left front), and cutting its «L» off just
  // because the grade has an L size filed the mapping under a stem no drawing has.
  const identityOf = (block: string) => aliasIdentity(block, split);

  const [rows, setRows] = useState<BlockRow[]>([]);
  // Every block found in the files with its instance count, mapped or not — «снять» needs the
  // count to offer the block again in the SAME pass. Rebuilding `rows` from the effect instead
  // would wipe whatever the operator has already chosen.
  const [blockCounts, setBlockCounts] = useState<Map<string, CountedBlock>>(new Map());
  // Blocks the operator asked to unmap in this dialog session (ci keys).
  const [unmapped, setUnmapped] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  // The block under the cursor's last click, ci key — shared by the sheet and the list so the
  // two are one selection, not two.
  const [selected, setSelected] = useState<string | null>(null);
  // Name typed for a block that is about to become a NEW piece, by ci key. The block name is
  // only a default: «PERED_S» is what the exporter called it, «полочка правая» is what the
  // garment calls it, and the second one is the one that has to reach the factory.
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  // Buffered editor fields. Existing pieces by lineKey (lower-cased) — a piece is one thing however
  // many blocks point at it; new pieces by their RESOLVED name (lower-cased, see newTargetOf), so
  // every block that will coalesce into one new piece shares one buffer — keyed by the creating
  // block, FP_R's edits were dropped whenever FP_L (same default name) was processed first.
  const [pieceEdits, setPieceEdits] = useState<Record<string, PieceFields>>({});
  const [newEdits, setNewEdits] = useState<Record<string, PieceFields>>({});
  // Block whose «this is» select was opened by the `relink` door (a linked block shows only its name).
  const [relinkOf, setRelinkOf] = useState<string | null>(null);
  // Canvas «Zoom»: a fused piece opens zoomed onto itself; the sheet's «whole sheet» button leaves
  // the zoom for that piece until its fuse mode changes again.
  const [zoomOut, setZoomOut] = useState<string | null>(null);
  // Which sheet is on screen. Several files reach one fabric slot when the same size was
  // re-uploaded (revisions) — they are separate drawings and must not be drawn on top of
  // each other.
  const [activeFile, setActiveFile] = useState(0);
  // Which SIZE is on screen. A graded DXF draws every size on one sheet; showing them together
  // is unreadable, and it is also the wrong question — a piece is one piece across the grade.
  // null = follow the first group.
  const [activeSize, setActiveSize] = useState<string | null>(null);

  // Only pieces that can actually be referenced: a keyless or nameless row is not addressable.
  const pieceOptions = useMemo(
    () =>
      (pieces ?? [])
        .filter((p) => !!p.lineKey?.trim() && !!p.name?.trim())
        .map((p) => ({ lineKey: p.lineKey!.trim(), name: p.name!.trim() })),
    [pieces],
  );

  // This fabric's stored mapping, keyed the way the server keys it (normalized + case-folded).
  // An alias whose piece has since been deleted is NOT counted as mapped: the server drops such
  // a row on the next save, and treating it as mapped would hide the block from this dialog
  // forever with no way to re-map it.
  const livePieceKeys = useMemo(
    () => new Set(pieceOptions.map((p) => p.lineKey.toLowerCase())),
    [pieceOptions],
  );
  // Blocks the operator has chosen a winner for, among the collapse conflicts below (ci → pieceKey).
  const [collapseChoice, setCollapseChoice] = useState<Record<string, string>>({});

  // What this scope already maps, and where two stored aliases disagree.
  //
  // Membership is RESOLVED (aliasInScope), not raw-keyed: a card sorted a minute ago still has its
  // aliases on the LINES, and they belong to this назначение now. The collapse falls out of the same
  // pass — the moment two of them claim one block for two different pieces, the merged set the
  // server would receive is invalid, and nothing further can be written until a human picks.
  // STORED half — depends only on what is on the card, never on what the operator is choosing right
  // now. That separation is load-bearing: the proposal effect below keys off «is this block already
  // mapped», and folding the live choice into the same memo gave it a new identity on every pick,
  // re-running the effect and wiping every row choice made above it.
  const stored = useMemo(() => {
    const first = new Map<string, string>();
    const spelling = new Map<string, string>();
    const conflict = new Map<string, { block: string; pieceKeys: string[] }>();
    for (const a of aliases ?? []) {
      if (!aliasInScope(a, scope)) continue;
      const pk = (a.pieceLineKey ?? '').trim();
      if (!livePieceKeys.has(pk.toLowerCase())) continue;
      const block = identityOf(a.blockName ?? '');
      const ci = block.toLowerCase();
      if (!spelling.has(ci)) spelling.set(ci, block);
      const prev = first.get(ci);
      if (prev === undefined) {
        first.set(ci, pk);
        continue;
      }
      if (prev.toLowerCase() === pk.toLowerCase()) continue;
      const c = conflict.get(ci) ?? { block, pieceKeys: [prev] };
      if (!c.pieceKeys.some((k) => k.toLowerCase() === pk.toLowerCase())) c.pieceKeys.push(pk);
      conflict.set(ci, c);
    }
    return { first, spelling, collapses: conflict };
  }, [aliases, scope, livePieceKeys, split]);
  const mineSpelling = stored.spelling;
  const collapses = stored.collapses;
  // A resolved conflict answers as its winner everywhere — sheet, list and write — so the dialog
  // never shows one thing and saves another. WHICH block is mapped never changes here, only WHICH
  // PIECE it maps to, so the proposal effect can keep reading the stable map.
  const mineByBlock = useMemo(() => {
    if (collapses.size === 0) return stored.first;
    const m = new Map(stored.first);
    for (const [ci, chosen] of Object.entries(collapseChoice)) {
      if (chosen && collapses.has(ci)) m.set(ci, chosen);
    }
    return m;
  }, [stored, collapses, collapseChoice]);
  const unresolvedCollapses = [...collapses.keys()].filter((ci) => !collapseChoice[ci]);
  // Блок с тем же именем, уже сопоставленный на ДРУГОМ слоте. Подсказка полезная, но с тех пор
  // как выкройка привязывается к любой рулонной строке, «другой слот» может быть другой РОЛЬЮ:
  // градалка называет полочку подкладки ровно так же, как полочку верха, а это разные детали
  // кроя. Поэтому запоминается ещё и слот-источник — подсказка обязана называть, откуда она, а
  // не выглядеть как факт: её принимают пачкой.
  const otherFabricByBlock = useMemo(() => {
    const m = new Map<string, { pieceKey: string; fromSlot: string }>();
    for (const a of aliases ?? []) {
      if (aliasInScope(a, scope)) continue;
      // The SOURCE key as the alias itself carries it — a назначение when it has one, its line
      // otherwise. That is what scopeLabelByKey is keyed on both ways, so a hint coming off a
      // not-yet-sorted line can still name where it came from instead of degrading to «по другой
      // ткани», which reads as a fact rather than as a guess.
      const from = aliasScopeKey(a);
      const k = loose(identityOf(a.blockName ?? ''));
      if (!m.has(k)) m.set(k, { pieceKey: a.pieceLineKey ?? '', fromSlot: from });
    }
    return m;
  }, [aliases, scope, split]);

  // F6b: детали, привязанные к ДРУГИМ тканям и ни разу к этой, — lineKey (ci) → ключ первой такой
  // ткани. Читается только строками файла с манифестом (см. proposeRows, 'same-name-elsewhere').
  const elsewhereOnly = useMemo(() => {
    const here = new Set<string>();
    const there = new Map<string, string>();
    for (const a of aliases ?? []) {
      const pk = (a.pieceLineKey ?? '').trim().toLowerCase();
      if (!pk || !livePieceKeys.has(pk)) continue;
      if (aliasInScope(a, scope)) here.add(pk);
      else if (!there.has(pk)) there.set(pk, aliasScopeKey(a));
    }
    for (const pk of here) there.delete(pk);
    return there;
  }, [aliases, scope, livePieceKeys]);

  // Rebuild the proposal whenever a parse lands. Blocks this fabric already maps are left out —
  // the dialog is for what is NOT yet answered.
  useEffect(() => {
    if (parse.phase !== 'ready') return;
    const all = countBlocks(contourPieces, split);
    setBlockCounts(all);
    setRows(
      proposeRows(all, {
        storedFirst: stored.first,
        pieceOptions,
        otherFabricByBlock,
        elsewhereOnly,
      }),
    );
  }, [parse, split, contourPieces, pieceOptions, stored, otherFabricByBlock, elsewhereOnly]);

  const decided = rows.filter((r) => r.choice).length;
  const toUnmap = unmapped.length;
  // A live piece list with the buffered renames applied — what «a typed name that already exists
  // binds to that piece» has to compare against, in the plan and in apply() alike.
  const withEditedNames = (list: readonly PieceValue[]): PieceValue[] =>
    list.map((p) => {
      const e = pieceEdits[(p.lineKey ?? '').trim().toLowerCase()];
      return e?.name !== undefined ? { ...p, name: clampUtf8Bytes(e.name, MAX_PIECE_NAME) } : p;
    });

  // ── исчезнувшие детали ────────────────────────────────────────────────────────────────
  // ЧТО РАЗБОР ЗНАЕТ ПРИСУТСТВУЮЩИМ: по всем файлам скоупа и по ВСЕМ слоям, а не по контурному.
  // Слой выбирается эвристикой и переключается руками (layerOpts выше), и он отвечает на вопрос
  // «каким контуром нарисована деталь», а не «есть ли она в файле». Спроси мы про существование
  // блока у contourPieces — один неверно выбранный слой объявил бы исчезнувшими ВСЕ детали ткани
  // и предложил вырезать карточку.
  //
  // Каждая идентичность кладётся ДВАЖДЫ: сама собой и своей слабой формой без размерного хвоста
  // (sizelessStem) — см. находку 2 у этой функции. Обе стороны сравнения считаются одним и тем же
  // правилом, иначе набор с одним размером («BP_1_M») расходится со старым алиасом («BP_1_XS») и
  // объявляет живую деталь исчезнувшей. Отсюда и имя: это набор КЛЮЧЕЙ ПРИСУТСТВИЯ, а не набор
  // идентичностей — спрашивать у него «как называется деталь» нельзя.
  //
  // НАХОДКА 1 третьего адверсарного ревью — ИСТОЧНИК. Набор строится по ВСТРЕЧЕННЫМ ВСТАВКАМ
  // (parse.blockNames), а не только по построенным контурам. Между блоком и деталью лежит вся
  // геометрия — сшивка разомкнутых цепочек, порог MIN_PIECE_AREA_CM2, отбор внешнего контура,
  // `sanitizeLoop` (lib/nesting/dxf/pieces.ts:184-186), — и любой её шаг законно возвращает по блоку
  // НОЛЬ контуров: тонкая деталь, кривая, которую не удалось замкнуть, самопересечение, которое
  // клиппер не вычистил. Для раскладки это верный ответ («класть нечего»), а вопрос здесь другой:
  // «есть ли такой блок в чертеже». Блок, который в файле есть, но чью геометрию мы не смогли
  // использовать, — это «не смогли прочитать», а не «его не стало», и разница между этими двумя
  // ответами равна удалению детали кроя со строками рецепта колорвеев и замеренными площадями.
  //
  // Контуры при этом остаются вторым источником, а не заменяются: их идентичности уже свёрнуты
  // вердиктом по размерам (codeById), и терять эту свёртку нельзя.
  const parsedBlocks = useMemo(() => (parse.phase === 'ready' ? parse.blockNames : []), [parse]);
  const parsedPresence = useMemo(() => {
    const s = new Set<string>();
    const isSizeToken = (t: string) => dictTokens.has(t);
    // Один ключ и его слабая форма — тем же правилом, что и на стороне алиаса (см. sizelessStem).
    const add = (name: string) => {
      const ident = normBlock(name);
      if (!ident) return;
      s.add(ident.toLowerCase());
      const stem = sizelessStem(ident, isSizeToken);
      if (stem) s.add(stem);
    };
    for (const p of allPieces) add(split.codeById.get(p.id)?.identity ?? p.blockName ?? '');
    for (const b of parsedBlocks) {
      // Сырое имя из файла И его свёртка к идентичности: блок, не давший контура, в вердикт по
      // размерам не попал вовсе (тот считается по разобранным деталям), поэтому «BP_9_M» обязано
      // лечь и как есть, и как «BP_9», иначе старый алиас в другом написании с ним не сойдётся.
      add(b);
      add(identityOf(b));
    }
    return s;
  }, [allPieces, parsedBlocks, split, dictTokens]);

  // Перезалитый в скоуп чертёж БЕЗ блока — это заявление «такой детали в крое больше нет», и до
  // сих пор единственным ответом на него было ручное удаление на вкладке деталей, которого никто
  // не делал: деталь оставалась в карточке, в операциях и в кат-листе как призрак.
  //
  // Три условия, каждое отсекает свой способ снести чужое:
  //   (а) деталь привязана В ЭТОМ скоупе — иначе разговор вообще не про этот чертёж;
  //   (б) у неё нет алиасов ни в одном ДРУГОМ скоупе: одна деталь кроя законно кроится из двух
  //       полотен (верх + дублерин), и файл верха про второе ничего не знает;
  //   (в) НИ ОДИН её блок не найден в разборе — деталь, привязанная к нескольким блокам (две
  //       uni-копии из склеенных по-размерных выгрузок), уходит, только когда исчезли ВСЕ.
  // Сравнение идёт по идентичности и теми же хелперами, что на записи алиасов (identityOf →
  // normBlock → ci): на сырых именах первый же старый алиас «BP_1_XS» разошёлся бы с файлом,
  // где лежит «BP_1», и деталь с живой связью попала бы под нож.
  //
  // Читается СЫРОЙ набор алиасов, а не mineByBlock: тот сворачивает спор двух алиасов на одного
  // победителя, и проигравшая деталь — тоже исчезнувшая — молча осталась бы в карточке.
  //
  // НАХОДКА 1 адверсарного ревью: раньше здесь стояла оговорка «цена ошибки ограничена — лист,
  // который не скачался, даёт предупреждение разбора», и этого было мало. Не докачавшийся лист
  // отдаёт `ready` с УМЕНЬШЕННЫМ набором блоков, его детали попадают сюда неотличимо от настоящих
  // с дефолтом «удалить», а красный advisory загорается только при потере половины ткани. Одно
  // применение + сохранение карточки — и деталей, их строк рецепта и замеров площадей нет, и
  // восстановить нечем. Поэтому по НЕПОЛНОМУ разбору предложений об удалении не бывает вовсе:
  // отсутствие блока в неполном наборе не значит ничего.
  const deleteCandidates = useMemo<DeleteCandidate[]>(() => {
    // Пока разбор не закончился, блоков нет НИ ОДНОГО — и «исчезли все» было бы правдой про
    // каждую привязанную деталь ткани.
    if (parse.phase !== 'ready') return [];
    // Разобрано не всё — утверждать «блока в чертеже больше нет» не по чему. Признак структурный
    // (use-nesting: filesParsed/filesTotal + blocksSkipped), а не догадка по тексту предупреждения:
    // формулировку однажды перепишут, и защита отвалится молча. Заведение деталей и сопоставление
    // при этом продолжают работать — они утверждают про то, что В файле ЕСТЬ, а не про то, чего в
    // нём нет; пересчёт × на неполном наборе тоже выключен, но по своей причине — см. находку 2 у
    // planPieceUpdates.
    if (!parseComplete) return [];
    const mine = new Map<string, string[]>(); // деталь (ci) → её блоки в этом скоупе
    const elsewhere = new Set<string>(); // деталь (ci), привязанная ещё и к другой ткани
    for (const a of aliases ?? []) {
      const pk = (a.pieceLineKey ?? '').trim().toLowerCase();
      if (!pk) continue;
      if (!aliasInScope(a, scope)) {
        elsewhere.add(pk);
        continue;
      }
      const ident = identityOf(a.blockName ?? '');
      if (!ident) continue;
      const list = mine.get(pk) ?? [];
      if (!list.some((b) => b.toLowerCase() === ident.toLowerCase())) list.push(ident);
      mine.set(pk, list);
    }
    // Деталь, на которую оператор ПРЯМО СЕЙЧАС вешает блок, исчезнувшей не является, даже если
    // её прежний блок из файла пропал: это переименование блока в CAD. Удали её здесь — и apply
    // запишет алиас на деталь, которой в `pieces` уже нет, а сервер ответит not_found и откажет
    // в сохранении ВСЕЙ карты.
    const staged = new Set(
      rows.filter((r) => r.choice && r.choice !== CREATE).map((r) => r.choice.toLowerCase()),
    );
    const out: DeleteCandidate[] = [];
    for (const p of pieceOptions) {
      const pk = p.lineKey.toLowerCase();
      const blocks = mine.get(pk);
      if (!blocks || blocks.length === 0) continue;
      if (elsewhere.has(pk) || staged.has(pk)) continue;
      // Присутствие проверяется в ОБЕ стороны одной нормализацией (находка 2): точное совпадение
      // идентичности ИЛИ совпадение слабых форм без размерного хвоста. Не свернулось однозначно —
      // значит НЕ кандидат: сомнение всегда в пользу сохранения детали.
      if (blocks.some((b) => parsedPresence.has(b.toLowerCase()))) continue;
      if (
        blocks.some((b) => {
          const stem = sizelessStem(b, (t) => dictTokens.has(t));
          return !!stem && parsedPresence.has(stem);
        })
      )
        continue;
      out.push({ lineKey: p.lineKey, name: p.name, blocks });
    }
    out.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    return out;
  }, [parse, parseComplete, aliases, scope, split, pieceOptions, parsedPresence, rows, dictTokens]);

  // ── состав потерь ─────────────────────────────────────────────────────────────────────
  // Строки рецепта, которые держатся на детали. Правило одно на два экрана (панель детали и эта
  // модалка) и живёт в piece-recipe-hold.ts — вместе с оговоркой о НЕПОЛНОТЕ проекции: архивные
  // колорвеи чтение карточки не отдаёт, а их строки уедут с деталью так же. Поэтому счёт ниже
  // подписан «в колорвеях карточки», а не выдаётся за полный.
  const recipeHold = useMemo(() => recipeHoldersByPiece(colorways), [colorways]);
  // Замеренные площади детали — по строке на размер. Считаются по ВСЕМ скоупам, а не по текущей
  // ткани: сервер удаляет их одним `piece_line_key IN (…)` без оглядки на скоуп, в той же
  // транзакции, что и саму деталь (techcard/materials.go). Считать по одному скоупу значило бы
  // назвать оператору меньшее число, чем он потеряет.
  const areaRowsByPiece = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of pieceAreaScopes ?? []) {
      for (const a of s.areas ?? []) {
        const k = (a.pieceLineKey ?? '').trim().toLowerCase();
        if (!k) continue;
        m.set(k, (m.get(k) ?? 0) + 1);
      }
    }
    return m;
  }, [pieceAreaScopes]);

  // Ответ по каждому кандидату. Пустая карта теперь значит безопасный пресет: удалить только
  // действительно пустые детали, а всё, что держит рецепты, нормы, площади или операции, оставить.
  // Явный выбор материализуется только после действия оператора, поэтому новый кандидат получает
  // тот же безопасный ответ без эффекта-засева, который мог бы затереть уже сделанный выбор.
  const oldPieceItems = useMemo<OldPieceItem[]>(
    () =>
      deleteCandidates.map((candidate) => {
        const key = candidate.lineKey.trim().toLowerCase();
        const hold = recipeHold.get(key);
        return {
          lineKey: candidate.lineKey,
          name: candidate.name?.trim() || candidate.lineKey,
          losses: {
            recipeRows: hold?.rows ?? 0,
            norms: hold?.withNorm ?? 0,
            areas: areaRowsByPiece.get(key) ?? 0,
            operations: opsByPiece.get(key) ?? 0,
          },
        };
      }),
    [deleteCandidates, recipeHold, areaRowsByPiece, opsByPiece],
  );
  const oldPieceByKey = useMemo(
    () => new Map(oldPieceItems.map((item) => [item.lineKey, item])),
    [oldPieceItems],
  );
  const [deleteChoice, setDeleteChoice] = useState<Map<string, OldPieceDecision>>(new Map());
  const [pickingOldPieces, setPickingOldPieces] = useState(false);
  const deleteDecision = (lineKey: string): OldPieceDecision => {
    const explicit = deleteChoice.get(lineKey);
    if (explicit) return explicit;
    const item = oldPieceByKey.get(lineKey);
    return item && hasOldPieceLoss(item.losses) ? 'keep' : 'delete';
  };
  const setGoneDecisions = (entries: readonly (readonly [string, OldPieceDecision])[]) =>
    setDeleteChoice((previous) => {
      const next = new Map(previous);
      entries.forEach(([lineKey, decision]) => next.set(lineKey, decision));
      return next;
    });
  const setAllGone = (decision: OldPieceDecision) =>
    setGoneDecisions(deleteCandidates.map((candidate) => [candidate.lineKey, decision] as const));
  // То, что реально применит apply(), — и то, по чему считается сводка исходов.
  const toDelete = useMemo(
    () => deleteCandidates.filter((candidate) => deleteDecision(candidate.lineKey) === 'delete'),
    // oldPieceItems carries the default decision even while deleteChoice stays intentionally sparse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deleteCandidates, deleteChoice, oldPieceItems],
  );

  // ── четыре исхода одного нажатия ──────────────────────────────────────────────────────
  // Диалог давно перестал быть только сопоставлением: он заводит детали, удаляет исчезнувшие,
  // пересчитывает число на изделие и размечает крой — и всё это уходит ОДНОЙ кнопкой. Значит
  // кнопка обязана называть свои исходы до нажатия, а не после сохранения карточки.
  //
  // «Без изменений» — тоже исход, и он здесь не для симметрии: это единственное видимое
  // доказательство, что повторное применение по тем же файлам ничего не переписывает. Молчание на
  // его месте читалось бы как «диалог ничего не заметил».
  const outcome = useMemo(() => {
    const dropped = new Set(toDelete.map((c) => c.lineKey.trim().toLowerCase()));
    const live = withEditedNames(
      ((pieces ?? []) as NonNullable<TechCardFormData['pieces']>).filter(
        (p) => !dropped.has((p.lineKey ?? '').trim().toLowerCase()),
      ),
    );
    const { bound, created, reused } = plannedScopeBinding(
      live,
      mineByBlock,
      unmapped,
      rows,
      draftNames,
    );
    const { updates, unchanged } = planPieceUpdates(live, bound, blockCounts, parseComplete);
    return {
      created,
      reused,
      removed: toDelete.length,
      updated: updates.length,
      unchanged,
      // F6b: явная разметка, которую применение перепишет по манифесту, — с причиной для сводки.
      rewritten: updates
        .filter((u) => u.reason)
        .map((u) => ({ name: live[u.index]?.name ?? '', reason: u.reason! })),
    };
    // pieceEdits: withEditedNames reads it.
  }, [
    pieces,
    toDelete,
    mineByBlock,
    unmapped,
    rows,
    draftNames,
    blockCounts,
    parseComplete,
    pieceEdits,
  ]);

  // Сколько деталей вообще привязано к этой ткани — знаменатель предупреждения о массовом
  // исчезновении. Считается по тем же СЫРЫМ алиасам, что и кандидаты, и только по живым деталям:
  // висячий алиас (деталь уже удалена) нигде не показывается и в знаменателе занижал бы долю.
  const scopeBoundPieces = useMemo(() => {
    const s = new Set<string>();
    for (const a of aliases ?? []) {
      if (!aliasInScope(a, scope)) continue;
      const pk = (a.pieceLineKey ?? '').trim().toLowerCase();
      if (pk && livePieceKeys.has(pk)) s.add(pk);
    }
    return s.size;
  }, [aliases, scope, livePieceKeys]);
  // Исчезла половина ткани и больше. Правка лекала так не выглядит — так выглядит файл, залитый не
  // в тот слот. Случай НЕ ДОКАЧАВШЕГОСЯ листа этим порогом больше не прикрывается и прикрываться не
  // должен: по неполному разбору кандидатов не бывает вовсе (находка 1), а половина — слишком
  // грубое сито, чтобы ловить потерю одного листа из пяти. Здесь остаётся ПРЕДУПРЕЖДЕНИЕ, а не
  // запрет: массовая замена лекал законна, и запретить её значило бы отнять единственный способ её
  // применить, оставив карточку с призраками навсегда.
  const massVanish = deleteCandidates.length > 0 && deleteCandidates.length * 2 >= scopeBoundPieces;

  // ── the sheet ─────────────────────────────────────────────────────────────────────────
  // One entry per parsed FILE, in parse order. Keyed by fileIndex rather than by `source`:
  // two rows of one fabric+size legitimately carry the same display name (two revisions
  // re-exported by the factory under one filename), and merging them would draw two drawings
  // on one sheet.
  const sheets = useMemo(() => {
    if (parse.phase !== 'ready') return [];
    const byFile = new Map<number, { name: string; pieces: PieceDTO[] }>();
    contourPieces.forEach((p, i) => {
      const idx = p.fileIndex ?? i;
      const entry = byFile.get(idx) ?? { name: p.source || `sheet ${idx + 1}`, pieces: [] };
      entry.pieces.push(p);
      byFile.set(idx, entry);
    });
    return [...byFile.entries()].sort((a, b) => a[0] - b[0]).map(([index, v]) => ({ index, ...v }));
  }, [parse, contourPieces]);
  const sheet = sheets[Math.min(activeFile, Math.max(0, sheets.length - 1))];

  // Sizes present in the ACTIVE sheet — a second file can legitimately carry a different subset.
  //
  // У группы считается ещё и `uniCount` — сколько её контуров помечены токеном UNI. Группировка от
  // этого не меняется НИ НА ЙОТУ (связывание блоков обязано остаться прежним): признак нужен
  // только подписи и предупреждению, которые иначе называют заявление автора недосмотром.
  const sizeOptions = useMemo(() => {
    if (!sheet) return [];
    const seen = new Map<string, { count: number; uniCount: number }>();
    for (const p of sheet.pieces) {
      const code = split.codeById.get(p.id);
      const s = code?.size ?? '';
      const prev = seen.get(s) ?? { count: 0, uniCount: 0 };
      seen.set(s, { count: prev.count + 1, uniCount: prev.uniCount + (code?.uni ? 1 : 0) });
    }
    const rank = (s: string) => split.orderOfSize.get(s) ?? 1e6;
    return [...seen.entries()]
      .map(([size, v]) => ({ size, ...v }))
      .sort((a, b) => rank(a.size) - rank(b.size));
  }, [sheet, split]);
  // The chosen size, falling back to the BIGGEST group when the operator has not picked or the
  // sheet changed under them. Not the first in grade order: the '' group is a remainder, not a
  // size, and it sorts last — so a file where only a couple of blocks carry a recognised size
  // would open showing those two and hide everything else behind a toggle nobody would press.
  const shownSize = sizeOptions.some((o) => o.size === activeSize)
    ? (activeSize as string)
    : sizeOptions.reduce<{ size: string; count: number } | null>(
        (best, o) => (!best || o.count > best.count ? o : best),
        null,
      )?.size ?? '';
  const sheetPieces = useMemo(
    () =>
      sheet ? sheet.pieces.filter((p) => (split.codeById.get(p.id)?.size ?? '') === shownSize) : [],
    [sheet, split, shownSize],
  );

  const nameByPieceKey = useMemo(
    () => new Map(pieceOptions.map((p) => [p.lineKey.toLowerCase(), p.name])),
    [pieceOptions],
  );
  const rowByCi = useMemo(() => new Map(rows.map((r) => [r.block.toLowerCase(), r])), [rows]);
  // A contour with no block carries no identity the alias table can hold, so it is drawn but
  // not clickable — '' is the sheet's own signal for that. Keyed on the IDENTITY, so the same
  // piece in another size is the same thing to click.
  const ciOf = (p: PieceDTO) =>
    normBlock(split.codeById.get(p.id)?.identity ?? p.blockName ?? '').toLowerCase();

  // The display name of an existing piece, with a buffered rename applied.
  const pieceName = (lineKey: string): string => {
    const k = lineKey.toLowerCase();
    const e = pieceEdits[k]?.name;
    return e !== undefined ? e : nameByPieceKey.get(k) ?? '';
  };

  // What a block IS right now, in one place: the sheet, the editor and the plan all read this.
  //   existing — bound to a piece of the card (stored link, or chosen in this pass)
  //   new      — becomes a new piece on save
  //   none     — «not a piece» (a skipped block, or a stored link being dropped)
  type BlockState =
    | { kind: 'existing'; key: string; stored: boolean }
    | { kind: 'new'; row: BlockRow }
    | { kind: 'none'; stored: boolean };
  const stateOf = (ci: string): BlockState => {
    const stored = mineByBlock.get(ci);
    const off = unmapped.includes(ci);
    if (stored && !off) return { kind: 'existing', key: stored, stored: true };
    const row = rowByCi.get(ci);
    if (row?.choice === CREATE) return { kind: 'new', row };
    if (row?.choice) return { kind: 'existing', key: row.choice, stored: false };
    return { kind: 'none', stored: !!stored };
  };
  const newNameOf = (row: BlockRow): string =>
    (draftNames[row.block.toLowerCase()] ?? '').trim() || defaultPieceName(row);
  // The piece a NEW block will actually land on — resolved exactly as apply() resolves it: a name
  // that a live piece (buffered renames applied, leaving pieces excluded) already carries binds to
  // that piece; otherwise every block under this name coalesces into ONE new piece. The editor
  // buffers by this target, so blocks resolving to the same piece read and write the same values.
  const liveKeyByName = (() => {
    const dropped = new Set(toDelete.map((c) => c.lineKey.trim().toLowerCase()));
    const m = new Map<string, string>();
    const live = ((pieces ?? []) as NonNullable<TechCardFormData['pieces']>).filter(
      (p) => !dropped.has((p.lineKey ?? '').trim().toLowerCase()),
    );
    for (const p of withEditedNames(live)) {
      const n = p.name?.trim().toLowerCase();
      if (n && p.lineKey?.trim()) m.set(n, p.lineKey.trim().toLowerCase());
    }
    return m;
  })();
  const newEditKey = (name: string) => name.toLowerCase();
  const newTargetOf = (row: BlockRow): { kind: 'piece' | 'new'; key: string } => {
    const n = newEditKey(newNameOf(row));
    const k = liveKeyByName.get(n);
    return k ? { kind: 'piece', key: k } : { kind: 'new', key: n };
  };

  const markOf = (p: PieceDTO): PieceMark => {
    const ci = ciOf(p);
    if (!ci) return 'unnamed';
    const st = stateOf(ci);
    if (st.kind === 'existing') return st.stored ? 'mapped' : 'staged';
    if (st.kind === 'new') return 'staged';
    // «not a piece»: a dropped stored link keeps its red dash (the link goes on save); a block
    // that was never a piece is simply dimmed.
    return st.stored ? 'dropped' : 'unnamed';
  };
  // The label on the shape is the PIECE NAME it will be saved as — the block name only when the
  // block is not a piece. Uni copies share their default name, so they read as one piece.
  const labelOf = (p: PieceDTO): string => {
    const ci = ciOf(p);
    if (!ci) return '';
    const st = stateOf(ci);
    if (st.kind === 'existing') return pieceName(st.key) || p.blockName || '';
    if (st.kind === 'new') return newNameOf(st.row);
    return '';
  };

  const setChoice = (ci: string, value: string) =>
    setRows((prev) =>
      prev.map((r) => (r.block.toLowerCase() === ci ? { ...r, choice: value } : r)),
    );

  // «this is: …» — the one transition for every block. A STORED link changed to anything else is
  // the old unlink (the block goes to `unmapped`) plus a row carrying the new answer; changed back
  // to its stored piece it is the old restore. Rows are appended, never rebuilt by the effect,
  // which would throw away every choice already made.
  const choose = (ci: string, value: string) => {
    const stored = mineByBlock.get(ci);
    if (!stored) {
      setChoice(ci, value);
      return;
    }
    const off = unmapped.includes(ci);
    if (value.toLowerCase() === stored.toLowerCase()) {
      if (!off) return;
      setUnmapped((prev) => prev.filter((x) => x !== ci));
      setRows((prev) => prev.filter((r) => r.block.toLowerCase() !== ci));
      return;
    }
    if (off) {
      setChoice(ci, value);
      return;
    }
    setUnmapped((prev) => (prev.includes(ci) ? prev : [...prev, ci]));
    setRows((prev) => {
      if (prev.some((r) => r.block.toLowerCase() === ci)) {
        return prev.map((r) => (r.block.toLowerCase() === ci ? { ...r, choice: value } : r));
      }
      const found = blockCounts.get(ci);
      if (!found) return prev;
      return [
        ...prev,
        {
          block: found.block,
          instances: found.instances,
          sizes: found.sizes,
          uniBase: found.uniBase,
          suggested: '',
          basis: 'none',
          choice: value,
          ...(found.manifestName ? { manifestName: found.manifestName } : {}),
        },
      ];
    });
  };

  // The editor's subject: everything the dialog knows about the clicked block.
  const focus = useMemo(() => {
    if (!selected) return null;
    const counted = blockCounts.get(selected);
    const row = rowByCi.get(selected);
    return {
      ci: selected,
      block: counted?.block ?? row?.block ?? selected,
      instances: counted?.instances ?? row?.instances ?? 0,
      sizes: counted?.sizes ?? row?.sizes ?? [],
      known: !!counted || !!row || mineByBlock.has(selected),
    };
  }, [selected, blockCounts, rowByCi, mineByBlock]);

  function apply() {
    setSaving(true);
    try {
      const created: NonNullable<TechCardFormData['pieces']> = [];
      // Read at commit time, not from the render-time snapshot: the operator can have added or
      // renamed a piece in the table behind this dialog while it was open.
      const all = (getValues('pieces') ?? []) as NonNullable<TechCardFormData['pieces']>;
      // Детали, которых в чертеже больше нет и которые оператор не оставил вручную. Всё
      // дальнейшее считается уже БЕЗ них: имена (иначе новый блок с тем же именем привязался бы
      // к уходящей детали), набор живых ключей (по нему отсеиваются её алиасы) и сама запись
      // массива. Каскад на сервере (строки рецепта, замеренные площади) сработает при
      // СОХРАНЕНИИ карточки, не здесь.
      const dropped = new Set(toDelete.map((c) => c.lineKey.trim().toLowerCase()));
      const live = all.filter((p) => !dropped.has((p.lineKey ?? '').trim().toLowerCase()));
      // Ссылки на деталь снимаются ДО того, как она исчезнет, — тот же контракт, что у
      // pieces-tab.removePiece: операция, всё ещё называющая удалённую деталь, роняет сохранение
      // на сервере (operations[N].piece_line_key: no cut-piece "…") и откатывает всю транзакцию —
      // по ключу, которого оператор не видит, в строке, которую он не трогал. Выноски при этом
      // НЕ трогаются: выноска — номер на эскизе, она переживает деталь.
      // Сверка входов ПОБАЙТНАЯ, как у removePiece и classifyAssemblyInputs: снимаются сырые ключи
      // ровно тех деталей, что ушли из массива выше. Свёрнутый `dropped` для входов не годится —
      // деталь «ABC» и узел «abc» два разных входа, и удаление детали снимало бы заодно чужой узел.
      const goneKeys = new Set(
        all.map((p) => p.lineKey ?? '').filter((k) => k && dropped.has(k.trim().toLowerCase())),
      );
      if (goneKeys.size > 0) {
        // Шов, оставшийся меньше чем с двумя входами, растворяется или уходит (old-pieces-ops):
        // иначе карточка не сохраняется по join-arity в шаге, которого оператор не трогал.
        const operations = (getValues('operations') ?? []) as NonNullable<
          TechCardFormData['operations']
        >;
        const plan = planOldPieceOps(operations, goneKeys);
        if (plan.changed) setValue('operations', plan.operations, { shouldDirty: true });
      }
      // Two pieces sharing a name make every reference to «полочка» ambiguous on the factory
      // sheet, and the server rejects the save for it — and since this dialog became the only
      // place a cut piece is created, that rule now has exactly one keeper. So a typed name that
      // already exists REUSES that piece instead of minting a second one.
      const keyByName = new Map<string, string>();
      // Buffered renames count: a new piece typed as «полочка» right after an existing piece was
      // renamed to «полочка» binds to it rather than minting a duplicate name.
      for (const p of withEditedNames(live)) {
        const n = p.name?.trim().toLowerCase();
        if (n && p.lineKey?.trim()) keyByName.set(n, p.lineKey.trim());
      }

      // Rebuilt rather than appended to, so the set this dialog hands over is deduped under the
      // server's own identity: a second alias for the same (scope, block) fails the whole card
      // save, and nothing else in the app can see or delete the offender.
      //
      // The scope half is NOT case-folded: a ULID is opaque and a назначение is a fixed enum name,
      // so folding buys nothing and would merge two cloths' mappings if either ever stopped being
      // single-case.
      const aliasKey = (scopeKey: string, block: string) =>
        `${scopeKey}|${normBlock(block).toLowerCase()}`;
      const byKey = new Map<
        string,
        { bomLineKey: string; fabricPurpose: string; blockName: string; pieceLineKey: string }
      >();
      // Итоговая привязка ЭТОГО скоупа — блок (ci) → деталь, — собираемая там же, где пишется
      // alias-набор. По ней ниже пересчитывается «× на изделие» и ставится разметка кроя: считать
      // их по параллельно собранной догадке значило бы завести второй ответ на вопрос «что связано
      // с чем», а расходятся такие пары всегда молча.
      const boundHere = new Map<string, string>();
      // Everything this dialog writes is filed under THIS scope's binding — назначение when the card
      // has been sorted, the line when it has not, with the compatibility line riding along only
      // when the назначение owns exactly one. That is also what MIGRATES a card sorted a moment ago:
      // its line-scoped aliases are re-filed here, in one save, without anyone re-doing the work.
      const bind = bindingForScope(scope);
      // Считается от списка ПОСЛЕ удаления — этим же набором ниже отсеиваются алиасы уходящих
      // деталей, и переносящему проходу не нужно знать про удаление ничего отдельно.
      const liveKeys = new Set(
        live.map((p) => p.lineKey?.trim().toLowerCase()).filter(Boolean) as string[],
      );
      // 1. Aliases of OTHER cloths ride through untouched, under their own scopes.
      for (const a of aliases ?? []) {
        // An alias whose piece was deleted is DROPPED, not carried over. The server resolves
        // piece_line_key against this card's pieces and answers `not_found` for one it cannot
        // resolve — which fails the entire card save over a row the UI deliberately hides (a
        // dangling alias is excluded from `mineByBlock` so its block can be mapped again). The
        // full-set write makes dropping it the repair.
        if (!liveKeys.has((a.pieceLineKey ?? '').trim().toLowerCase())) continue;
        if (aliasInScope(a, scope)) continue;
        // Свёрнуто к ИДЕНТИЧНОСТИ и на записи тоже. Читающая сторона (mineByBlock, mappedRows,
        // ciOf, unmapped) вся работает по идентичности, и пока эта петля переносила сырое имя,
        // ключи двух сторон не совпадали: «снять связь» удаляла ключ «B1|bp_1», а алиас лежал
        // под «B1|bp_1_xs» и переживал сохранение — кнопка отчитывалась об удалении, которого
        // не было. Хуже того, следующее сопоставление того же блока добавляло ВТОРОЙ алиас на
        // ту же физическую деталь, невидимый и неудаляемый ничем, кроме удаления самой детали.
        const ident = identityOf(a.blockName ?? '');
        byKey.set(aliasKey(aliasScopeKey(a), ident), {
          bomLineKey: a.bomLineKey ?? '',
          fabricPurpose: a.fabricPurpose ?? '',
          blockName: ident,
          pieceLineKey: a.pieceLineKey ?? '',
        });
      }
      // 2. This scope's own mapping, re-filed under the scope binding. mineByBlock has already
      // collapsed any conflicting pair onto the winner the operator picked, so this loop writes
      // exactly one row per block — which is what the UNIQUE index is asking for.
      for (const [ci, pieceLineKey] of mineByBlock) {
        // Деталь могла уйти этим же применением: её блоков в чертеже больше нет. Проход выше
        // сюда не дотягивается (он про ЧУЖИЕ скоупы), а алиас на несуществующую деталь сервер
        // не разрешит — piece_line_key: not_found, и падает сохранение всей карты.
        if (!liveKeys.has(pieceLineKey.trim().toLowerCase())) continue;
        boundHere.set(ci, pieceLineKey);
        byKey.set(aliasKey(scope.key, mineSpelling.get(ci) ?? ci), {
          ...bind,
          blockName: mineSpelling.get(ci) ?? ci,
          pieceLineKey,
        });
      }
      // Unmapping is a first-class action: a wrong mapping assigns the wrong cloth to a piece on
      // the cutting floor, and before this the only exit was deleting the target piece.
      for (const b of unmapped) {
        byKey.delete(aliasKey(scope.key, b));
        boundHere.delete(b);
      }
      // Блоки, стоящие за КАЖДОЙ заводимой деталью: её ключ → идентичности с числом экземпляров.
      // Копится, а не считается на месте, потому что второй блок под тем же именем приходит позже
      // по циклу, а правило (сумма по РАЗЛИЧНЫМ, максимум по копиям ОДНОЙ) отвечает только на
      // ПОЛНОМ наборе — см. perGarmentFromBlocks и находку 4.
      const createdBlocks = new Map<string, { identity: string; instances: number }[]>();
      for (const r of rows) {
        if (!r.choice) continue;
        let pieceLineKey = r.choice;
        if (r.choice === CREATE) {
          const typed = (draftNames[r.block.toLowerCase()] ?? '').trim();
          const name = typed || defaultPieceName(r);
          const existing = keyByName.get(name.toLowerCase());
          if (existing) {
            // The operator typed the name of a piece that already exists — bind to it. Число на
            // изделие досчитается ниже: у ЖИВОЙ детали его ставит planPieceUpdates по boundHere,
            // у заводимой этим же применением — фикс-ап по createdBlocks.
            pieceLineKey = existing;
          } else {
            pieceLineKey = ulid();
            keyByName.set(name.toLowerCase(), pieceLineKey);
            // Fields typed in the editor for this new piece — one buffer per resolved name, shared
            // by every block that coalesces into it (newTargetOf). A name that binds to an existing
            // piece takes the branch above; its edits sit in pieceEdits and land in the loop below.
            const ed = newEdits[newEditKey(name)] ?? {};
            created.push({
              lineKey: pieceLineKey,
              name,
              // How many times the block appears in the file IS how many of that piece a garment
              // takes — the operator can still correct it on the pieces tab. Значение
              // ПРЕДВАРИТЕЛЬНОЕ: под этим же именем может прийти ещё блок, и итог считает фикс-ап
              // по createdBlocks сразу после цикла.
              piecesPerGarment: r.instances,
              // РЕЖЕТСЯ КАК НАРИСОВАНА. Деталь заводится ИЗ чертежа, а чертёж несёт КАЖДЫЙ контур:
              // ничего здесь не зеркалится неявно, и n панелей — это n одинаковых копий. Оставить
              // поле неразмеченным значило бы отдать деталь бэку немым: клетка покрытия настила
              // становится UNKNOWN, проверки зеркального разворота и перекроя перестают судить, а
              // на бумаге голая «2» и так читается как «две одинаковые» — то есть молчание всё
              // равно утверждает этот же ответ, просто не давая его проверить.
              cutSymmetry: IDENTICAL_CUT_SYMMETRY,
              grainline: ed.grainline ?? '',
              fused: ed.fused ?? false,
              ...(ed.fused && ed.fusingMode !== undefined ? { fusingMode: ed.fusingMode } : {}),
              ...(ed.fused && ed.fusingWidthMm !== undefined
                ? { fusingWidthMm: ed.fusingWidthMm }
                : {}),
              ...(ed.ungraded !== undefined ? { ungraded: ed.ungraded } : {}),
              ...(ed.fused && ed.fuse ? writeFuseFields(ed.fuse) : {}),
              calloutNumber: 0,
              note: ed.note ?? '',
              materials: [],
            });
          }
          // Идентичность блока — тем же ключом, что и в пересчёте: общий корень uni-копий, если он
          // есть, иначе сама идентичность.
          const list = createdBlocks.get(pieceLineKey) ?? [];
          list.push({ identity: r.uniBase.trim() || r.block, instances: r.instances });
          createdBlocks.set(pieceLineKey, list);
        }
        boundHere.set(r.block.toLowerCase(), pieceLineKey);
        byKey.set(aliasKey(scope.key, r.block), {
          ...bind,
          blockName: r.block,
          pieceLineKey,
        });
      }
      // ЧИСЛО НА ИЗДЕЛИЕ У ЗАВОДИМЫХ ДЕТАЛЕЙ — на полном наборе их блоков и ТЕМ ЖЕ правилом, что
      // и пересчёт ниже (находка 4). Две РАЗЛИЧНЫЕ детали чертежа под одним именем («PLANKA_L» и
      // «PLANKA_R») дают ×2, две копии ОДНОЙ (`PCK_L_UNI_M` и `PCK_L_UNI_S` из склеенных
      // по-размерных выгрузок) — ×1. Иначе первое применение заводило деталь с ×1, а следующее
      // открытие диалога молча переписывало её на ×2, без единой правки в чертеже.
      for (const c of created) {
        const blocks = createdBlocks.get(c.lineKey ?? '');
        if (!blocks) continue;
        const total = perGarmentFromBlocks(blocks);
        if (total > 0) c.piecesPerGarment = total;
      }
      // Массив пишется, когда состав деталей изменился хоть в одну сторону: заведение новых или
      // уход исчезнувших. Без второго условия «применить» с одними удалениями не писало бы
      // ничего, и диалог отчитался бы об удалении, которого не было.
      if (created.length > 0 || live.length !== all.length) {
        setValue('pieces', [...live, ...created] as TechCardFormData['pieces'], {
          shouldDirty: true,
        });
      }
      // ПЕРЕСЧЁТ × И РАЗМЕТКА КРОЯ — точечными записями по вложенному пути, как renamePiece выше, а
      // не через корень массива и не через useFieldArray.update: корень выше уже записан, второй
      // полный write шёл бы от устаревшего снимка и стирал правку, сделанную в таблице за модалкой.
      //
      // Индексы — по `live`: он сохраняет порядок исходного массива, а в записанном выше
      // `[...live, ...created]` живая деталь стоит ровно на своём месте. Заводимые детали сюда не
      // попадают по построению (их ключей в `live` нет) — их × ставит create-путь выше.
      //
      // Сдвиг дайджеста CONSTRUCTION и протухшая подпись здесь ОЖИДАЕМЫ и правильны: физический
      // состав кроя изменился. То же с подписью костинга и отпечатком набора раскладок — «набор
      // изменился» и есть правда. Гасить этот сигнал значило бы утвердить крой, которого никто не
      // видел.
      // Тот же `parseComplete`, что и в сводке выше: сводка обязана называть ровно то, что сделает
      // применение, и разойтись эти два вызова могут только молча.
      const { updates } = planPieceUpdates(live, boundHere, blockCounts, parseComplete);
      for (const u of updates) {
        if (u.piecesPerGarment !== undefined) {
          setValue(`pieces.${u.index}.piecesPerGarment`, u.piecesPerGarment, {
            shouldDirty: true,
          });
        }
        if (u.cutSymmetry !== undefined) {
          setValue(`pieces.${u.index}.cutSymmetry`, u.cutSymmetry, { shouldDirty: true });
        }
      }
      // BUFFERED EDITOR FIELDS of existing pieces — nested-path writes, indices by `live` (same
      // reasoning as the recount above). A piece leaving in this same apply gets nothing.
      live.forEach((p, i) => {
        const ed = pieceEdits[(p.lineKey ?? '').trim().toLowerCase()];
        if (!ed) return;
        for (const f of FIELD_KEYS) {
          if (ed[f] === undefined || sameField(ed[f], p[f])) continue;
          setValue(`pieces.${i}.${f}`, ed[f] as never, { shouldDirty: true });
        }
        if (ed.name !== undefined && ed.name !== (p.name ?? '')) {
          const value = clampUtf8Bytes(ed.name, MAX_PIECE_NAME);
          setValue(`pieces.${i}.name`, value, { shouldDirty: true });
          // S8: a piece pinned to a sketch callout has its name rewritten from `callout.part` by
          // the server on every save — the rename has to reach the callout too (pieces-tab
          // renamePiece), or the save silently reverts it.
          const n = (p.calloutNumber as number) || 0;
          if (n) {
            const cs = (getValues('callouts') ?? []) as Array<{ number?: number }>;
            cs.forEach((c, ci) => {
              if ((c.number ?? 0) === n)
                setValue(`callouts.${ci}.part`, value.trim(), { shouldDirty: true });
            });
          }
        }
      });
      setValue('pieceDxfAliases', [...byKey.values()], { shouldDirty: true });
      // The fusible sheets follow the fuse markup. Staged behind the card body: the header's save
      // writes the pieces first, then this rebuilds the DXFs off the stored card. A failed rebuild
      // is a toast — the pieces stay saved.
      const fuseTouched = [...Object.values(pieceEdits), ...Object.values(newEdits)].some(
        (ed) => ed.fuse !== undefined,
      );
      if (fuseTouched && staging && techCardId) {
        const id = techCardId;
        staging.stage({
          key: 'fusingSheets',
          label: 'fusing DXF',
          order: FUSING_SHEETS_ORDER,
          commit: async () => {
            try {
              const r = await regenerateFusingSheets(id);
              if (r.skippedSizes.length)
                notify({
                  sev: 'warn',
                  subject: 'FUSING DXF',
                  text: `${r.skippedSizes.length} sizes skipped`,
                  detail: r.skippedSizes
                    .map((x) => `${x.piece} ${x.size}: ${x.reason}`)
                    .join('\n'),
                });
            } catch (error) {
              notify({
                sev: 'error',
                subject: 'FUSING DXF',
                text: 'not rebuilt',
                detail: error instanceof Error ? error.message : String(error),
              });
            }
          },
        });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  // ── header warnings ───────────────────────────────────────────────────────────────────
  // A warning's «show»: bring the contour's file and size on screen and select it.
  const showContour = (p: PieceDTO | undefined) => {
    if (!p) return;
    const fi = sheets.findIndex((sh) => sh.pieces.includes(p));
    if (fi >= 0) setActiveFile(fi);
    setActiveSize(split.codeById.get(p.id)?.size ?? '');
    const ci = ciOf(p);
    if (ci) setSelected(ci);
  };
  const showBlock = (ci: string) => showContour(contourPieces.find((p) => ciOf(p) === ci));
  // First contour of the active sheet whose size was not recognised (UNI is declared, not missed).
  const showUnsized = () =>
    showContour(
      sheet?.pieces.find((p) => {
        const code = split.codeById.get(p.id);
        return !code?.size && !code?.uni;
      }),
    );
  // Everything the parse or the plan wants to say, as one `! N warnings` door in the top bar
  // (patterns-lite #11). Nothing of it sits in the body.
  const unrecognisedSizes = (() => {
    if (missingSizes.length > 0 || sizeOptions.length <= 1) return 0;
    const rest = sizeOptions.find((o) => o.size === '');
    // UNI contours carry no size by declaration, not by a parse failure.
    return rest ? Math.max(0, rest.count - rest.uniCount) : 0;
  })();
  const warnings: HeaderWarning[] = [];
  if (parse.phase === 'error') warnings.push({ text: parse.message, error: true });
  if (parse.phase === 'ready') {
    // Units are asked at upload — the parse's «units are not set» note is not repeated here.
    warnings.push(
      ...parse.warnings
        .filter((w) => !/units are not set in the file/.test(w))
        .map(
          (w): HeaderWarning =>
            isFetchFailure(w)
              ? { text: w, error: true, action: { label: 'retry', onClick: reparse } }
              : w,
        ),
    );
    if (!parse.complete) {
      warnings.push(
        `files read: ${parse.filesParsed} of ${parse.filesTotal}${
          parse.blocksSkipped > 0 ? ` · blocks skipped: ${parse.blocksSkipped}` : ''
        }`,
      );
    }
    if (blockCounts.size === 0 && mineByBlock.size === 0) warnings.push('no named pieces');
  }
  if (foreignSizes.length > 0) {
    warnings.push(
      `sizes not taken from the file: ${foreignSizes.map((n) => formatSizeName(n)).join(', ')}`,
    );
  }
  if (gradedOnOs.length > 0) {
    const names = orderSizes(gradedOnOs.map((m) => m.sizeId)).map((id) =>
      formatSizeName(sizeById.get(id) ?? `#${id}`),
    );
    const range = names.length > 1 ? `${names[0]}–${names[names.length - 1]}` : names[0];
    warnings.push({
      text: `the file is graded (${range}), the card is one size`,
      action: readOnly
        ? undefined
        : osPdfs.length > 0
          ? { label: 'remove one-size PDFs first', onClick: () => {}, disabled: true }
          : { label: 'switch to these sizes', onClick: switchToFileSizes },
    });
  }
  if (proposedSizes.length > 0) {
    warnings.push({
      text: `new sizes in the file: ${proposedSizes.map((m) => formatSizeName(m.name)).join(', ')}`,
      action: readOnly ? undefined : { label: 'add sizes', onClick: addProposedSizes },
    });
  }
  if (addedSizes.length > 0) warnings.push(`sizes added: ${addedSizes.join(', ')}`);
  if (unrecognisedSizes > 0) {
    warnings.push({
      text: `size not recognised on ${unrecognisedSizes} contours`,
      action: { label: 'show', onClick: showUnsized },
    });
  }
  if (missingOnLayer.length > 0) {
    warnings.push(
      `no contour for ${missingOnLayer.length} pieces: ${missingOnLayer.slice(0, 6).join(', ')}${
        missingOnLayer.length > 6 ? '…' : ''
      }`,
    );
  }
  for (const r of outcome.rewritten) warnings.push(`${r.name}: cut as drawn, identical copies`);
  // Once the operator has answered the old-pieces question, the alarm has done its job.
  if (massVanish && deleteChoice.size === 0) {
    warnings.push({
      text: `${deleteCandidates.length} of ${scopeBoundPieces} pieces gone from the file`,
      error: true,
      action:
        readOnly || toDelete.length === 0
          ? undefined
          : {
              label: 'keep all',
              onClick: () => setAllGone('keep'),
            },
    });
  }
  if (unresolvedCollapses.length > 0) {
    warnings.push({
      text: `one block, two pieces: ${unresolvedCollapses.length} to pick`,
      error: true,
      action: { label: 'show', onClick: () => showBlock(unresolvedCollapses[0]) },
    });
  }

  // ── save / done ───────────────────────────────────────────────────────────────────────
  // Anything apply() would write. Nothing → the primary just closes.
  const hasEdits = Object.keys(pieceEdits).length > 0;
  const changed =
    decided > 0 ||
    toUnmap > 0 ||
    collapses.size > 0 ||
    outcome.removed > 0 ||
    outcome.updated > 0 ||
    hasEdits;
  const canSave = changed && !readOnly;
  // Until every dispute is settled there is nothing valid to save: the server would reject the
  // whole card.
  const blocked = unresolvedCollapses.length > 0;

  // ── the editor ────────────────────────────────────────────────────────────────────────
  const optionKeyOf = (key: string) =>
    pieceOptions.find((p) => p.lineKey.toLowerCase() === key.toLowerCase())?.lineKey ?? key;

  // ── pieces gone from the file ─────────────────────────────────────────────────────────
  // ONE question, asked where the eye already is (the panel beside the sheet) when no piece is
  // picked. The card stores no outline, and a candidate is absent from the new file by definition,
  // so the pick tiles honestly carry words only: there is no old geometry to preview on hover.
  const goneQuestion =
    deleteCandidates.length > 0 ? (
      <OldPiecesDecision
        items={oldPieceItems}
        decisionOf={deleteDecision}
        onDecide={setGoneDecisions}
        picking={pickingOldPieces}
        onPickingChange={(picking) => {
          setPickingOldPieces(picking);
          if (picking) setSelected(null);
        }}
        readOnly={readOnly}
      />
    ) : null;

  // What the panel shows for a block and where its edits go, per kind. Existing pieces read the
  // form and overlay the buffer; new pieces read only the buffer (they do not exist yet). The
  // canvas reads the same thing for every fused piece on the sheet.
  const ioOf = (ci: string) => {
    const st = stateOf(ci);

    let index = -1;
    let vals: PieceFields = {};
    let patch: (p: PieceFields) => void = () => {};
    let title = '';
    if (st.kind === 'existing') {
      const k = st.key.toLowerCase();
      index = (pieces ?? []).findIndex((p) => (p.lineKey ?? '').trim().toLowerCase() === k);
      const p = index >= 0 ? (pieces ?? [])[index] : undefined;
      vals = {
        name: pieceName(st.key),
        ...storedFuseOf(p),
        ungraded: p?.ungraded,
        grainline: p?.grainline,
        note: p?.note,
        ...pieceEdits[k],
      };
      vals.name = pieceName(st.key);
      patch = (d) =>
        setPieceEdits((prev) => {
          const next = { ...(prev[k] ?? {}), ...d };
          if (d.name !== undefined && d.name === (nameByPieceKey.get(k) ?? '')) delete next.name;
          const rest = { ...prev };
          if (Object.keys(next).length === 0) delete rest[k];
          else rest[k] = next;
          return rest;
        });
      title = vals.name;
    } else if (st.kind === 'new') {
      const row = st.row;
      const shownName = draftNames[ci] ?? defaultPieceName(row);
      const tgt = newTargetOf(row);
      if (tgt.kind === 'piece') {
        // The typed name is an existing piece's: the block binds to it on save, so its fields are
        // that piece's — read the form, overlay the shared piece buffer, write the shared buffer.
        const p = (pieces ?? []).find((x) => (x.lineKey ?? '').trim().toLowerCase() === tgt.key);
        vals = {
          ...storedFuseOf(p),
          ungraded: p?.ungraded,
          grainline: p?.grainline,
          note: p?.note,
          ...pieceEdits[tgt.key],
          name: shownName,
        };
      } else {
        vals = { ...newEdits[tgt.key], name: shownName };
      }
      patch = (d) => {
        const { name, ...rest } = d;
        let target = tgt;
        if (name !== undefined) {
          setDraftNames((prev) => ({ ...prev, [ci]: name }));
          const nk = newEditKey(name.trim() || defaultPieceName(row));
          const pk = liveKeyByName.get(nk);
          target = pk ? { kind: 'piece', key: pk } : { kind: 'new', key: nk };
          // Renaming carries this piece's buffered fields to the new name unless that name already
          // has its own (another block's piece). The old buffer stays: other blocks may still
          // resolve to it.
          if (tgt.kind === 'new' && target.kind === 'new' && target.key !== tgt.key) {
            const from = tgt.key;
            const to = target.key;
            setNewEdits((prev) =>
              prev[from] && !prev[to] ? { ...prev, [to]: { ...prev[from] } } : prev,
            );
          }
        }
        if (Object.keys(rest).length === 0) return;
        const t = target;
        if (t.kind === 'piece')
          setPieceEdits((prev) => ({ ...prev, [t.key]: { ...(prev[t.key] ?? {}), ...rest } }));
        else setNewEdits((prev) => ({ ...prev, [t.key]: { ...(prev[t.key] ?? {}), ...rest } }));
      };
      title = newNameOf(row);
    }
    return { st, index, vals, patch, title };
  };
  // The fuse spec of a block that is a fused piece (the buffer's, else read off the stored fields).
  const fuseOfCi = (ci: string): PieceFuseSpec | undefined => {
    if (!ci) return undefined;
    const { st, vals } = ioOf(ci);
    if (st.kind === 'none' || !vals.fused) return undefined;
    return vals.fuse ?? readFuseSpec(vals);
  };
  const setFuse = (ci: string, next: PieceFuseSpec) => {
    const { vals, patch } = ioOf(ci);
    const prev = vals.fuse ?? readFuseSpec(vals);
    if (next.mode !== prev.mode) setZoomOut(null);
    patch({ fuse: next, ...writeFuseFields(next) });
  };
  // Zoomed onto the selected piece: it is fused with a mode and the zoom was not left.
  const zoomed = (() => {
    if (!selected || zoomOut === selected) return null;
    const f = fuseOfCi(selected);
    return f?.mode ? selected : null;
  })();

  // The piece's fuse fields again, for the phone dock above the footer (set by the editor).
  let fuseDock: React.ReactNode = null;
  // The zoomed piece's box, mm / Y up (PieceSheet's focus contract).
  const zoomFocus = (() => {
    if (!zoomed) return null;
    const p = sheetPieces.find((q) => ciOf(q) === zoomed && q.originX != null);
    if (!p) return null;
    const ox = p.originX ?? 0;
    const oy = p.originY ?? 0;
    return { minX: ox * 10, minY: oy * 10, maxX: (ox + p.bboxW) * 10, maxY: (oy + p.bboxH) * 10 };
  })();
  const editor = (() => {
    if (pickingOldPieces && goneQuestion) return goneQuestion;
    if (!focus) {
      return (
        goneQuestion ?? (
          <Text size='micro' variant='label' component='p'>
            click a piece to edit it
          </Text>
        )
      );
    }
    const ci = focus.ci;
    const st = stateOf(ci);
    const value = st.kind === 'existing' ? optionKeyOf(st.key) : st.kind === 'new' ? CREATE : '';
    const io = ioOf(ci);
    const { index, vals, patch } = io;
    const title = io.title || focus.block;
    // Form anchors only for a piece that exists in the form (error deep links land here).
    const anchor = (f: string) => (index >= 0 ? { 'data-field': `pieces.${index}.${f}` } : {});
    const isPiece = st.kind !== 'none';
    const linked = st.kind === 'existing';

    const thisIs = (
      <PanelField label='this is'>
        <select
          className={BOX}
          aria-label={`what block ${focus.block} is`}
          value={value}
          disabled={readOnly || !focus.known}
          onChange={(e) => choose(ci, e.target.value)}
        >
          <option value={CREATE}>+ new piece</option>
          <option value=''>not a piece</option>
          {pieceOptions.map((p) => (
            <option key={p.lineKey} value={p.lineKey}>
              {pieceName(p.lineKey) || p.name}
            </option>
          ))}
        </select>
      </PanelField>
    );

    // Not a piece, or the `relink` door is open: the block's name and what it is.
    if (!isPiece || (linked && relinkOf === ci)) {
      return (
        <div className='space-y-2'>
          <div>
            <Text
              size='micro'
              component='p'
              className='truncate border-b border-borderColor pb-0.5 uppercase'
              title={title}
            >
              {title}
            </Text>
            <Text size='micro' variant='label' component='p' className='pt-0.5'>
              ×{focus.instances} per garment
              {focus.sizes.length > 0 ? ` · ${focus.sizes.join(' ')}` : ''}
            </Text>
          </div>
          {thisIs}
        </div>
      );
    }

    // A piece, panel «Fold»: NAME · FUSING (phone: docked above the footer) · GRAIN + UNGRADED ·
    // NOTE.
    const fuse = vals.fuse ?? readFuseSpec(vals);
    const fuseFields = (
      <FuseFields
        key={ci}
        spec={fuse}
        fused={!!vals.fused}
        lines={interlinings}
        readOnly={readOnly}
        toggleBox={TOGGLE_BOX}
        onChange={(next) => setFuse(ci, next)}
      />
    );
    fuseDock = fuseFields;
    return (
      <div className='space-y-2'>
        {!linked && thisIs}
        <PanelField
          label='name'
          door={
            linked &&
            !readOnly &&
            focus.known && (
              <button
                type='button'
                className='text-micro text-labelColor underline underline-offset-2 hover:text-textColor'
                onClick={() => setRelinkOf(ci)}
              >
                relink
              </button>
            )
          }
        >
          <Input
            {...anchor('name')}
            className={INPUT_BOX}
            aria-label='piece name'
            placeholder='piece name'
            disabled={readOnly}
            value={vals.name ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ name: e.target.value })}
          />
        </PanelField>
        <div className='hidden sm:block' {...anchor('fusingMode')}>
          {fuseFields}
        </div>
        <div className='grid grid-cols-2 items-end gap-2'>
          <PanelField label='grain'>
            <div {...anchor('grainline')}>
              <Select
                name='grainline'
                size='sm'
                items={grainlineOptionsFor(vals.grainline)}
                value={vals.grainline ?? ''}
                readOnly={readOnly}
                onValueChange={(x: string) => patch({ grainline: x })}
              />
            </div>
          </PanelField>
          <Chip
            className={TOGGLE_BOX}
            selected={!!vals.ungraded}
            pressed={!!vals.ungraded}
            disabled={readOnly}
            aria-label='ungraded'
            onClick={() => patch({ ungraded: !vals.ungraded })}
          >
            ungraded
          </Chip>
        </div>
        <PanelField label='note'>
          <Input
            {...anchor('note')}
            className={INPUT_BOX}
            aria-label='note'
            disabled={readOnly}
            value={vals.note ?? ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch({ note: e.target.value })}
          />
        </PanelField>
      </div>
    );
  })();

  return (
    <ConfirmationModal
      open={files != null}
      onOpenChange={(o: boolean) => {
        if (!o && !saving) onClose();
      }}
      onConfirm={canSave ? apply : onClose}
      onCancel={onClose}
      title={`pieces · ${fabricName}${sizeLabel ? ` · ${sizeLabel}` : ''}`}
      confirmLabel={canSave ? 'save' : 'done'}
      confirmDisabled={canSave && (saving || blocked)}
      width='lg'
      closeOnConfirm={false}
      dock={
        fuseDock && (
          <div className='shrink-0 border-t border-textColor bg-bgColor px-2.5 py-2 sm:hidden'>
            {fuseDock}
          </div>
        )
      }
    >
      <div className='space-y-2'>
        {(sheets.length > 1 || parse.phase === 'loading' || warnings.length > 0) && (
          <div className='flex min-h-[22px] flex-wrap items-center gap-2'>
            {sheets.length > 1 && (
              <ChipRow>
                {sheets.map((s, i) => (
                  <Chip key={s.index} selected={i === activeFile} onClick={() => setActiveFile(i)}>
                    {s.name}
                  </Chip>
                ))}
              </ChipRow>
            )}
            {parse.phase === 'loading' && (
              <Text size='micro' variant='label' component='span'>
                reading…
              </Text>
            )}
            <div className='ml-auto'>
              <HeaderWarnings items={warnings} />
            </div>
          </div>
        )}

        {parse.phase === 'ready' && sheet && (
          <div className='flex flex-wrap gap-4'>
            <div className='min-w-0' style={{ flex: '999 1 560px' }}>
              <PieceSheet
                // Keyed by the FILE and the SIZE: zoom/pan live inside the sheet, so without a
                // remount switching either kept the previous drawing's viewBox.
                // …and by the zoom: leaving it remounts onto the whole sheet.
                key={`${sheet.index}|${shownSize}|${zoomed ?? ''}`}
                pieces={sheetPieces}
                grainLayer={grainLayer}
                innerLayers={innerLayers}
                keyOf={ciOf}
                // Zoomed: everything but the piece being fused steps back.
                markOf={(p) => (zoomed && ciOf(p) !== zoomed ? 'unnamed' : markOf(p))}
                labelOf={labelOf}
                selectedKey={selected}
                onPick={(key) => {
                  if (pickingOldPieces) return;
                  // Zone mode: a block that is not a piece (the patternmaker's fusible shape)
                  // becomes the zone instead of the selection.
                  const f = zoomed ? fuseOfCi(zoomed) : undefined;
                  if (
                    zoomed &&
                    f?.mode === 'zone' &&
                    key !== zoomed &&
                    stateOf(key).kind === 'none'
                  ) {
                    setFuse(zoomed, { ...f, zone: { dxfPieceKey: key } });
                    return;
                  }
                  setSelected(key);
                }}
                focus={zoomFocus}
                onFit={() => setZoomOut(selected)}
                overlay={(px) => (
                  <FuseOverlay
                    px={px}
                    pieces={sheetPieces}
                    ciOf={ciOf}
                    sel={zoomed}
                    fuseOf={fuseOfCi}
                    onChange={setFuse}
                  />
                )}
                tall
                bare
                topLeft={
                  // One size on screen at a time: a piece is ONE piece across the grade, so
                  // switching changes what you look at, never what gets created.
                  sizeOptions.length > 1 && (
                    <CanvasSegments
                      label='size on screen'
                      value={shownSize}
                      onChange={setActiveSize}
                      options={sizeOptions.map((o) => ({
                        key: o.size,
                        label:
                          o.size || (o.count > 0 && o.uniCount === o.count ? 'UNI' : 'no size'),
                      }))}
                    />
                  )
                }
              />
            </div>
            <div
              className='min-w-0 max-w-[420px] space-y-4 lg:max-h-[60vh] lg:overflow-y-auto'
              style={{ flex: '1 1 380px' }}
            >
              {editor}
              {/* A piece is open: the open question stays one click away instead of vanishing. */}
              {focus && deleteCandidates.length > 0 && (
                <button
                  type='button'
                  className='text-micro text-labelColor underline underline-offset-2 hover:text-textColor'
                  onClick={() => setSelected(null)}
                >
                  {deleteCandidates.length === 1
                    ? '1 card piece not in this file'
                    : `${deleteCandidates.length} card pieces not in this file`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Blocking: two BOM lines sorted into one purpose merged two answers for one block. The
            server refuses that pair by failing the whole card save, so a human picks here. */}
        {collapses.size > 0 && (
          <div>
            <GroupLabel>one block, two pieces</GroupLabel>
            {[...collapses.entries()].map(([ci, c]) => (
              <div key={ci} className='flex items-center gap-2 py-0.5'>
                <Text size='micro' component='span' className='min-w-0 flex-1 truncate'>
                  {c.block}
                </Text>
                <select
                  className={`${selectCls} w-56`}
                  aria-label={`piece for ${c.block}`}
                  disabled={readOnly}
                  value={collapseChoice[ci] ?? ''}
                  onChange={(e) => setCollapseChoice((prev) => ({ ...prev, [ci]: e.target.value }))}
                >
                  <option value=''>choose a piece…</option>
                  {c.pieceKeys.map((k) => (
                    <option key={k} value={k}>
                      {pieceName(k) || k}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        )}

        {/* No sheet to sit beside (nothing drew): the gone-pieces question stands on its own. */}
        {parse.phase === 'ready' && !sheet && goneQuestion}
      </div>
    </ConfirmationModal>
  );
}
