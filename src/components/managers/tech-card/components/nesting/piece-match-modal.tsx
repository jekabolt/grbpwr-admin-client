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
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { DataTable } from 'ui/components/data-table';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import { ulid } from 'utils/ulid';
import { clampUtf8Bytes } from 'utils/pattern';
import { recipeHoldersByPiece } from '../piece-recipe-hold';
import {
  IDENTICAL_CUT_SYMMETRY,
  cutSymmetryCountInvalid,
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
import { PieceSheet, type PieceMark } from './piece-sheet';
import {
  aliasIdentity,
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
  basis: 'exact' | 'loose' | 'similar' | 'other-fabric' | 'none';
  // Слот, с которого пришла подсказка 'other-fabric'. '' для остальных оснований.
  fromSlot?: string;
  choice: string; // piece lineKey, '' = unmapped, NEW = create a piece named after the block
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
const defaultPieceName = (row: { block: string; uniBase: string }): string =>
  row.uniBase || row.block;

// Sentinel for «создать новую деталь», deliberately unable to collide with a piece lineKey: a
// ULID is 26 chars of upper-case Crockford base32, so a '+' and lower case can never be one.
// (It used to be a string containing a raw NUL byte — invisible in every editor, and enough to
// make grep treat this whole file as binary.)
const CREATE = '+create';

// tech_card_piece.name is VARCHAR(255) and the server counts UTF-8 BYTES (Go len()), so a
// 255-character Cyrillic name is twice over the limit and would fail the whole card save.
const MAX_PIECE_NAME = 255;

type PieceValue = NonNullable<TechCardFormData['pieces']>[number];
// Что известно про идентичность из разбора: сколько раз она в чертеже (максимум по файлам и
// размерам) и общий корень uni-копий, если он есть.
type BlockCount = { instances: number; uniBase: string };

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
type PieceUpdate = { index: number; piecesPerGarment?: number; cutSymmetry?: string };

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
    if (!isCutSymmetryMarked(current)) {
      // Не размечено — значит никто не отвечал, а чертёж отвечает: он несёт КАЖДЫЙ контур, и
      // деталь режется как нарисована. Молчание здесь не нейтрально — оно гасит выводы бэка
      // (клетка покрытия настила становится UNKNOWN, проверки зеркального разворота и перекроя
      // перестают судить), поэтому ответ ставится, а не оставляется на потом.
      update.cutSymmetry = IDENTICAL_CUT_SYMMETRY;
    } else if (cutSymmetryCountInvalid(current, total)) {
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
      update.cutSymmetry = IDENTICAL_CUT_SYMMETRY;
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
  onClose: () => void;
}) {
  const { control, setValue, getValues } = useFormContext<TechCardFormData>();
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
  const { parse } = useNesting(files);
  // РАЗБОР ПОЛОН — одно выражение на весь файл. Полнота (файлы скачаны и прочитаны ВСЕ, ни один блок
  // внутри них не пропущен) решает судьбу ДВУХ исходов сразу: предложений об удалении (находка 1
  // первого ревью) и пересчёта «× на изделие» с разметкой кроя (находка 2 второго). Собирать это
  // условие заново в каждом месте нельзя — однажды соберут не полностью, и это будет молчаливая
  // потеря данных оператора, которых он не сможет ни увидеть, ни исправить.
  const parseComplete = parse.phase === 'ready' && parse.complete;
  // One DXF carries the whole grade, so the size lives in the block name and has to be split off
  // before anything else: the piece «BP_1» exists once for the style, not once per size.
  const dictTokens = useDictionarySizeTokens();
  const allPieces = useMemo(
    () => (parse.phase === 'ready' ? parse.pieces : []),
    [parse],
  );
  const split = useMemo(() => splitPiecesBySize(allPieces, dictTokens), [allPieces, dictTokens]);
  // A block carries the piece on more than one layer (sewing line and cutting line). Only ONE of
  // them is the piece; the other must not reach the counting, or every block would be counted
  // twice and pieces_per_garment would double.
  const layerOpts = useMemo(
    () => layerOptions(allPieces, split.codeById),
    [allPieces, split],
  );
  const [activeLayer, setActiveLayer] = useState<string | null>(null);
  const contourLayer = layerOpts.some((o) => o.layer === activeLayer)
    ? (activeLayer as string)
    : defaultContourLayer(layerOpts);
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
  const grainLayer = useMemo(
    () => defaultGrainLayer(grainLayerOptions(allPieces)),
    [allPieces],
  );
  const [showGrain, setShowGrain] = useState(true);
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
  const [hiddenInner, setHiddenInner] = useState<string[]>([]);
  const innerLayers = useMemo(
    () => new Set(innerLayerNames.map(([l]) => l).filter((l) => !hiddenInner.includes(l))),
    [innerLayerNames, hiddenInner],
  );
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
  const missingSizes = useMemo(
    () => missingSizesIn(allPieces, dictTokens, cardSizeIds, sizeById),
    [allPieces, dictTokens, cardSizeIds, sizeById],
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
    if (parse.phase !== 'ready' || addedRef.current || missingSizes.length === 0) return;
    addedRef.current = true;
    setAddedSizes(missingSizes.map((m) => formatSizeName(m.name)));
    setValue('sizeIds', orderSizes([...cardSizeIds, ...missingSizes.map((m) => m.sizeId)]), {
      shouldDirty: true,
    });
  }, [parse.phase, missingSizes, cardSizeIds, orderSizes, setValue]);
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
  const [blockCounts, setBlockCounts] = useState<
    Map<string, { block: string; instances: number; sizes: string[]; uniBase: string }>
  >(
    new Map(),
  );
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

  // Rebuild the proposal whenever a parse lands. Blocks this fabric already maps are left out —
  // the dialog is for what is NOT yet answered.
  useEffect(() => {
    if (parse.phase !== 'ready') return;
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
    const all = new Map<
      string,
      { block: string; instances: number; sizes: string[]; uniBase: string }
    >();
    for (const [ci, instances] of counts) {
      const sizes = [...(sizesByCi.get(ci) ?? [])].sort(
        (a, b) => (split.orderOfSize.get(a) ?? 1e6) - (split.orderOfSize.get(b) ?? 1e6),
      );
      all.set(ci, {
        block: spelling.get(ci)!,
        instances,
        sizes,
        uniBase: uniBaseByCi.get(ci) ?? '',
      });
    }
    setBlockCounts(all);
    const next: BlockRow[] = [];
    for (const [ci, instances] of counts) {
      const block = spelling.get(ci)!;
      // "Already mapped" is tested on the SERVER's key, not on loose(): loose() strips all
      // punctuation, so «полочка 1» stored would have hidden a genuinely distinct «полочка-1»
      // from the dialog with no way to ever map it.
      if (stored.first.has(ci)) continue;
      let suggested = '';
      let basis: BlockRow['basis'] = 'none';
      let fromSlot = '';
      const exact = pieceOptions.find((p) => p.name.toLowerCase() === block.toLowerCase());
      const byLoose = pieceOptions.find((p) => loose(p.name) === loose(block));
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
      // Only the two exact tiers are pre-selected. A similarity guess or another fabric's
      // mapping is offered, never applied by default — being wrong there costs cloth.
      const preselect = basis === 'exact' || basis === 'loose' ? suggested : '';
      const sizes = [...(sizesByCi.get(ci) ?? [])].sort(
        (a, b) => (split.orderOfSize.get(a) ?? 1e6) - (split.orderOfSize.get(b) ?? 1e6),
      );
      next.push({
        block,
        instances,
        sizes,
        uniBase: uniBaseByCi.get(ci) ?? '',
        suggested,
        basis,
        fromSlot,
        choice: preselect,
      });
    }
    next.sort((a, b) => a.block.localeCompare(b.block, 'ru'));
    setRows(next);
  }, [parse, split, contourPieces, pieceOptions, stored, otherFabricByBlock]);

  const decided = rows.filter((r) => r.choice).length;
  const alreadyMapped = mineByBlock.size;
  // What this fabric already maps, shown so a wrong mapping is visible and removable rather
  // than permanent. Rendered from the same source the "skip already mapped" test uses, so the
  // two can never disagree.
  const mappedRows = useMemo(() => {
    const nameByKey = new Map(pieceOptions.map((p) => [p.lineKey.toLowerCase(), p.name]));
    return [...mineByBlock.entries()]
      .map(([ci, pieceKey]) => ({
        ci,
        // The spelling is remembered on the IDENTITY as the aliases are read: a stored alias may
        // still spell the size out, and comparing raw names would miss it and fall back to the key.
        block: mineSpelling.get(ci) ?? ci,
        pieceName: nameByKey.get(pieceKey.toLowerCase()) ?? '—',
      }))
      .sort((a, b) => a.block.localeCompare(b.block, 'ru'));
  }, [mineByBlock, mineSpelling, pieceOptions]);
  const toUnmap = unmapped.length;

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

  // Ответ по каждому кандидату. Дефолт — «удалить», и он НЕ материализуется в карту: пустая
  // карта уже значит «удалить всех», поэтому новый кандидат (оператор переключил список файлов)
  // не требует ни эффекта-засева, ни синхронизации, которая молча теряла бы выбор. Переключатель
  // секции пишет сюда `setDeleteChoice((prev) => new Map(prev).set(lineKey, v))`.
  const [deleteChoice, setDeleteChoice] = useState<Map<string, 'delete' | 'keep'>>(new Map());
  const deleteDecision = (lineKey: string): 'delete' | 'keep' =>
    deleteChoice.get(lineKey) ?? 'delete';
  // То, что реально применит apply(), — и то, по чему считается сводка исходов.
  const toDelete = useMemo(
    () => deleteCandidates.filter((c) => deleteDecision(c.lineKey) === 'delete'),
    [deleteCandidates, deleteChoice],
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
    const live = ((pieces ?? []) as NonNullable<TechCardFormData['pieces']>).filter(
      (p) => !dropped.has((p.lineKey ?? '').trim().toLowerCase()),
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
    };
  }, [pieces, toDelete, mineByBlock, unmapped, rows, draftNames, blockCounts, parseComplete]);

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
      const entry = byFile.get(idx) ?? { name: p.source || `лист ${idx + 1}`, pieces: [] };
      entry.pieces.push(p);
      byFile.set(idx, entry);
    });
    return [...byFile.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, v]) => ({ index, ...v }));
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
    : (sizeOptions.reduce<{ size: string; count: number } | null>(
        (best, o) => (!best || o.count > best.count ? o : best),
        null,
      )?.size ?? '');
  const sheetPieces = useMemo(
    () =>
      sheet
        ? sheet.pieces.filter((p) => (split.codeById.get(p.id)?.size ?? '') === shownSize)
        : [],
    [sheet, split, shownSize],
  );

  const nameByPieceKey = useMemo(
    () => new Map(pieceOptions.map((p) => [p.lineKey.toLowerCase(), p.name])),
    [pieceOptions],
  );
  const rowByCi = useMemo(
    () => new Map(rows.map((r) => [r.block.toLowerCase(), r])),
    [rows],
  );
  // A contour with no block carries no identity the alias table can hold, so it is drawn but
  // not clickable — '' is the sheet's own signal for that. Keyed on the IDENTITY, so the same
  // piece in another size is the same thing to click.
  const ciOf = (p: PieceDTO) =>
    normBlock(split.codeById.get(p.id)?.identity ?? p.blockName ?? '').toLowerCase();

  const markOf = (p: PieceDTO): PieceMark => {
    const ci = ciOf(p);
    if (!ci) return 'unnamed';
    if (unmapped.includes(ci)) return 'dropped';
    if (mineByBlock.has(ci)) return 'mapped';
    return rowByCi.get(ci)?.choice ? 'staged' : 'open';
  };
  // What the piece IS, in one word on the shape. A mapped block shows the cut piece it means
  // (that is the answer); an open one shows the raw block name (that is the question).
  const labelOf = (p: PieceDTO): string => {
    const ci = ciOf(p);
    if (!ci) return '';
    if (!unmapped.includes(ci)) {
      const mapped = mineByBlock.get(ci);
      if (mapped) return nameByPieceKey.get(mapped.toLowerCase()) ?? p.blockName ?? '';
    }
    const row = rowByCi.get(ci);
    // Подпись на листе называет ТО ИМЯ, под которым деталь будет заведена: у uni-копий оно общее
    // (см. defaultPieceName), и «+ PCK_L_UNI_M» на одном контуре рядом с «+ PCK_L_UNI_S» на
    // другом обещал бы две детали там, где создаётся одна.
    if (row?.choice === CREATE)
      return `+ ${(draftNames[ci] ?? '').trim() || defaultPieceName(row)}`;
    if (row?.choice) return nameByPieceKey.get(row.choice.toLowerCase()) ?? row.block;
    // Идентичность, а не сырое имя: иначе на листе — главной поверхности диалога — блок
    // подписан «BP_1_XS», а строка таблицы, заголовок инспектора и «+ создать» рядом говорят
    // «BP_1». Расходиться должен файл с нами, а не мы сами с собой.
    return normBlock(split.codeById.get(p.id)?.identity ?? p.blockName ?? '');
  };

  const setChoice = (ci: string, value: string) =>
    setRows((prev) =>
      prev.map((r) => (r.block.toLowerCase() === ci ? { ...r, choice: value } : r)),
    );

  // Toggling a stored mapping off, and back on. Extracted so the sheet's inspector and the
  // list below it drive exactly the same transition instead of two lookalike copies.
  const toggleUnmap = (ci: string) => {
    const off = unmapped.includes(ci);
    setUnmapped((prev) => (off ? prev.filter((x) => x !== ci) : [...prev, ci]));
    // Unmapping OFFERS the block again in the same pass. Done by appending rather than by
    // re-running the rebuild effect, which would throw away every choice already made above.
    setRows((prev) => {
      if (off) return prev.filter((r) => r.block.toLowerCase() !== ci);
      if (prev.some((r) => r.block.toLowerCase() === ci)) return prev;
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
          choice: '',
        },
      ];
    });
  };

  // The inspector's subject: everything the dialog knows about the clicked block.
  const focus = useMemo(() => {
    if (!selected) return null;
    const counted = blockCounts.get(selected);
    const row = rowByCi.get(selected);
    const mappedTo = mineByBlock.get(selected);
    return {
      ci: selected,
      block: counted?.block ?? row?.block ?? selected,
      instances: counted?.instances ?? row?.instances ?? 0,
      sizes: counted?.sizes ?? row?.sizes ?? [],
      row,
      mappedTo,
      mappedName: mappedTo ? (nameByPieceKey.get(mappedTo.toLowerCase()) ?? '—') : null,
      dropped: unmapped.includes(selected),
    };
  }, [selected, blockCounts, rowByCi, mineByBlock, nameByPieceKey, unmapped]);

  // The choice control, shared by the inspector and the table row — one place decides what
  // «пропустить / создать / существующая деталь» means.
  const choiceSelect = (ci: string, block: string, instances: number, value: string) => (
    <select
      className='h-7 min-w-0 flex-1 border border-borderColor bg-bgColor px-1 text-micro'
      aria-label={`деталь для блока ${block}`}
      value={value}
      onChange={(e) => setChoice(ci, e.target.value)}
    >
      <option value=''>пропустить</option>
      <option value={CREATE}>
        + создать «{block}» (×{instances})
      </option>
      {pieceOptions.map((p) => (
        <option key={p.lineKey} value={p.lineKey}>
          {p.name}
        </option>
      ))}
    </select>
  );

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
      if (dropped.size > 0) {
        const operations = (getValues('operations') ?? []) as TechCardFormData['operations'];
        (operations ?? []).forEach((o, oi) => {
          const keys = (o.inputKeys ?? []).filter(Boolean);
          const kept = keys.filter((k) => !dropped.has(k.trim().toLowerCase()));
          if (kept.length === keys.length) return;
          setValue(`operations.${oi}.inputKeys`, kept, { shouldDirty: true });
        });
      }
      // Two pieces sharing a name make every reference to «полочка» ambiguous on the factory
      // sheet, and the server rejects the save for it — and since this dialog became the only
      // place a cut piece is created, that rule now has exactly one keeper. So a typed name that
      // already exists REUSES that piece instead of minting a second one.
      const keyByName = new Map<string, string>();
      for (const p of live) {
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
              grainline: '',
              fused: false,
              calloutNumber: 0,
              note: '',
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
      setValue('pieceDxfAliases', [...byKey.values()], { shouldDirty: true });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  // Renaming the cut piece from here renames it EVERYWHERE — operations, norms, the cut list —
  // because the alias points at the piece's line_key, never at a name. That is the whole point of
  // the scoping: the name in the DXF is the exporter's, the name of the piece is ours, and there
  // is exactly one of the latter. Written on the nested path, not through useFieldArray.update,
  // which would replace the row from a stale snapshot (patterns-field.tsx makes the same call).
  const renamePiece = (lineKey: string, name: string) => {
    const live = (getValues('pieces') ?? []) as NonNullable<TechCardFormData['pieces']>;
    const i = live.findIndex((p) => p.lineKey === lineKey);
    if (i < 0) return;
    setValue(`pieces.${i}.name`, clampUtf8Bytes(name, MAX_PIECE_NAME), { shouldDirty: true });
  };

  const nameField = (label: string, value: string, onChange: (v: string) => void) => (
    <label className='block'>
      <Text size='nano' variant='label' component='span'>
        {label}
      </Text>
      <input
        className='mt-0.5 block min-h-[22px] w-full border border-borderColor bg-bgColor px-[7px] py-[3px] text-micro focus:border-textColor focus:outline-none'
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder='название детали'
      />
    </label>
  );

  // Кнопка называет ВСЕ исходы, а не только сопоставления. «сопоставить (0)» на кнопке, которая
  // сейчас удалит три детали и перепишет число на изделие у пяти, врало бы ровно в тот момент,
  // когда цена ошибки самая высокая — и никакого другого места, где эти исходы названы вместе, у
  // оператора нет.
  const confirmParts = [
    outcome.reused > 0 ? `${outcome.reused} ↔` : '',
    outcome.created > 0 ? `${outcome.created} +` : '',
    outcome.removed > 0 ? `${outcome.removed} −` : '',
    outcome.updated > 0 ? `${outcome.updated} ×` : '',
    toUnmap > 0 ? `${toUnmap} снять` : '',
  ].filter(Boolean);
  // Четыре нуля подряд не значат ничего: на карточке, где ещё ничего не связано и ничего не
  // выбрано, сводка была бы строкой ради строки.
  const hasOutcome = outcome.created + outcome.removed + outcome.updated + outcome.unchanged > 0;

  const basisLabel = (r: BlockRow) => {
    if (!r.suggested) return null;
    if (r.basis === 'similar') return <Pill tone='warn'>предложено по похожести</Pill>;
    if (r.basis === 'other-fabric') {
      const from = r.fromSlot ? scopeLabelByKey?.get(r.fromSlot) : '';
      return <Pill tone='warn'>{from ? `по «${from}»` : 'по другой ткани'}</Pill>;
    }
    return null;
  };

  return (
    <ConfirmationModal
      open={files != null}
      onOpenChange={(o: boolean) => {
        if (!o && !saving) onClose();
      }}
      onConfirm={apply}
      onCancel={onClose}
      title={`детали кроя из DXF · ${fabricName}${sizeLabel ? ` · ${sizeLabel}` : ''}`}
      confirmLabel={
        confirmParts.length > 0 ? `применить (${confirmParts.join(', ')})` : 'применить'
      }
      // Пока хоть один спор не разрешён, применять НЕЧЕГО: набор, который ушёл бы на сервер, для
      // него невалиден, и он отклонит сохранение ВСЕЙ карты. Кнопка гаснет вместе с объяснением
      // выше — это и есть «предупредить до сохранения, а не после».
      //
      // Удаления и пересчёт × — самостоятельные исходы, а не довесок к сопоставлению: чертёж, из
      // которого блок исчез или в котором сменилось число копий, не приносит НИ ОДНОГО нового
      // сопоставления, и требование «сначала сопоставь хоть что-нибудь» запирало бы карточку с
      // призраком детали и с неверным числом на изделие навсегда.
      confirmDisabled={
        saving ||
        unresolvedCollapses.length > 0 ||
        (decided === 0 &&
          toUnmap === 0 &&
          collapses.size === 0 &&
          outcome.removed === 0 &&
          outcome.updated === 0)
      }
      width='lg'
      closeOnConfirm={false}
    >
      <div className='space-y-2'>
        {parse.phase === 'loading' && (
          <Text size='micro' variant='label' component='p'>
            разбор DXF…
          </Text>
        )}
        {parse.phase === 'error' && <CalloutBox tone='error'>{parse.message}</CalloutBox>}

        {/* СХЛОПЫВАНИЕ АЛИАСОВ (0267). Две строки BOM, разложенные в ОДНО назначение, сливают свои
            наборы связей — и если в обеих лежал блок с одним именем, на один блок оказывается два
            ответа. Сервер такую пару не примет и отклонит сохранение ВСЕЙ карты, поэтому спор
            показывается здесь, до записи, и решает его человек: имя блока ничего не говорит о том,
            какая из двух деталей верна, а угадать за оператора — это ровно та ошибка, из-за которой
            назначения вообще не бэкфилились. */}
        {collapses.size > 0 && (
          <CalloutBox tone='error'>
            <div className='space-y-1'>
              <Text size='micro' component='p'>
                <b>один блок — две детали кроя.</b> В это назначение разложено несколько строк BOM, и
                их связи объединились. Выберите, какая деталь остаётся за блоком: вторая связь будет
                снята. Пока спор не решён, сохранять нечего — сервер отклонит карту целиком.
              </Text>
              {[...collapses.entries()].map(([ci, c]) => (
                <div key={ci} className='flex flex-wrap items-center gap-1.5'>
                  <Text size='micro' component='span' className='min-w-0 flex-1 truncate'>
                    {c.block}
                  </Text>
                  <select
                    className='h-7 min-w-0 flex-1 border border-borderColor bg-bgColor px-1 text-micro'
                    aria-label={`деталь кроя для спорного блока ${c.block}`}
                    value={collapseChoice[ci] ?? ''}
                    onChange={(e) =>
                      setCollapseChoice((prev) => ({ ...prev, [ci]: e.target.value }))
                    }
                  >
                    <option value=''>выберите деталь…</option>
                    {c.pieceKeys.map((k) => (
                      <option key={k} value={k}>
                        {nameByPieceKey.get(k.toLowerCase()) ?? k}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </CalloutBox>
        )}

        {/* Parse warnings were never rendered here (the nesting modal has always shown them).
            That was survivable while the surface was a table of names; it is not now that the
            sheet is presented AS the file. `useNesting` only errors when EVERY file fails, so a
            fabric whose second sheet 404'd on the CDN would draw one drawing, show no tab bar
            (one sheet parsed), and say nothing — and the operator would map what loaded and
            close, believing the fabric is done. */}
        {parse.phase === 'ready' && parse.warnings.length > 0 && (
          <CalloutBox tone='note'>
            <div className='space-y-0.5'>
              {parse.warnings.map((w, i) => (
                <Text key={i} size='micro' component='p'>
                  {w}
                </Text>
              ))}
            </div>
          </CalloutBox>
        )}

        {parse.phase === 'ready' && rows.length === 0 && alreadyMapped === 0 && (
          <CalloutBox tone='note'>
            в файлах нет именованных блоков — привязать нечего; такие DXF раскладываются, но
            детали из них не заводятся
          </CalloutBox>
        )}

        {/* Sheet + inspector. The drawing is the question, the panel beside it is the answer —
            they sit side by side so choosing never means losing sight of the shape. */}
        {parse.phase === 'ready' && sheet && (
          <div className='flex flex-col gap-2 lg:flex-row'>
            <div className='min-w-0 flex-1'>
              {sheets.length > 1 && (
                <div className='mb-1 flex flex-wrap items-center gap-1'>
                  {sheets.map((s, i) => (
                    <Button
                      key={s.index}
                      type='button'
                      variant={i === activeFile ? 'main' : 'secondary'}
                      size='xs'
                      onClick={() => setActiveFile(i)}
                    >
                      {s.name}
                    </Button>
                  ))}
                </div>
              )}
              {/* Which layer holds the piece. Offered only when the file actually draws it on
                  more than one (sewing line + cutting line), and the default is the layer that
                  GRADES: a contour identical in every size is a reference, not the piece. Left
                  switchable because the guess is a guess, and reading the wrong contour means
                  cutting to the wrong size. */}
              {layerOpts.length > 1 && (
                <div className='mb-1 flex flex-wrap items-center gap-1'>
                  <Text size='nano' variant='label' component='span'>
                    контур:
                  </Text>
                  {layerOpts.map((o) => (
                    <Button
                      key={o.layer || '(none)'}
                      type='button'
                      variant={o.layer === contourLayer ? 'main' : 'secondary'}
                      size='xs'
                      title={
                        o.checked === 0
                          ? `слой ${o.layer}: ${o.pieces} контуров, сравнить размеры не с чем`
                          : `слой ${o.layer}: ${o.pieces} контуров, градуируется у ${o.graded} из ${o.checked} деталей`
                      }
                      onClick={() => setActiveLayer(o.layer)}
                    >
                      слой {o.layer || '—'}
                      {o.checked > 0 && o.graded === 0 ? ' (не градуируется)' : ''}
                    </Button>
                  ))}
                </div>
              )}
              {/* Слои чертежа. Линия шва (зазор до линии кроя — это и есть припуск), надсечки,
                  свёрла, вытачки: по ним режут, и деталь без них — голый силуэт. Показываются
                  все, выключить можно любой: на плотном листе лишние слои превращаются в кашу. */}
              {innerLayerNames.length > 0 && (
                <div className='mb-1 flex flex-wrap items-center gap-2'>
                  <Text size='nano' variant='label' component='span'>
                    слои чертежа:
                  </Text>
                  {innerLayerNames.map(([layer, n]) => (
                    <label key={layer} className='flex cursor-pointer items-center gap-1'>
                      <input
                        type='checkbox'
                        checked={!hiddenInner.includes(layer)}
                        onChange={(e) =>
                          setHiddenInner((prev) =>
                            e.target.checked ? prev.filter((l) => l !== layer) : [...prev, layer],
                          )
                        }
                      />
                      <Text size='nano' variant='label' component='span'>
                        {layer} ({n})
                      </Text>
                    </label>
                  ))}
                </div>
              )}
              {/* Долевая на листе. Раскладка разворачивает деталь именно по этой линии, так что
                  увидеть её здесь — единственный способ проверить прочитанное до того, как
                  ткань разрезана. */}
              {grainLayer !== '' && (
                <div className='mb-1'>
                  <label className='flex cursor-pointer items-center gap-1.5'>
                    <input
                      type='checkbox'
                      checked={showGrain}
                      onChange={(e) => setShowGrain(e.target.checked)}
                    />
                    <Text size='nano' variant='label' component='span'>
                      показать долевую (слой {grainLayer}) — по ней раскладка разворачивает деталь
                    </Text>
                  </label>
                </div>
              )}
              {/* В файле есть размеры, которых нет в карточке. Пока их там нет, хвост у таких
                  блоков не отрезается, и одна деталь кроя двоится — по строке на каждый
                  непризнанный размер. Добавляет их ЧЕЛОВЕК: резать имена по всему словарю
                  нельзя («FP_L» — левая полочка, а «L» в словаре есть как размер), поэтому
                  машина только показывает находку. */}
              {addedSizes.length > 0 && (
                <CalloutBox tone='note'>
                  <Text size='micro' component='p'>
                    размерный ряд карточки дополнен из файла: {addedSizes.join(', ')} — уже
                    в форме, сохранится вместе с карточкой
                  </Text>
                </CalloutBox>
              )}
              {/* Осталась группа «без размера», хотя все словарные размеры уже заведены — значит
                  хвост этих блоков размером не является вовсе.
                  UNI-контуры в это число НЕ входят: у них размера нет ПО ЗАЯВЛЕНИЮ автора, и
                  «не опознан» звучало бы про них как поломка разбора. Когда кроме них в группе
                  никого нет, предупреждения не остаётся вовсе. */}
              {missingSizes.length === 0 &&
                sizeOptions.length > 1 &&
                (() => {
                  const rest = sizeOptions.find((o) => o.size === '');
                  const unnamed = rest ? rest.count - rest.uniCount : 0;
                  if (unnamed <= 0) return null;
                  return (
                    <CalloutBox tone='warning'>
                      <Text size='micro' component='p'>
                        у {unnamed} контуров размер в имени не опознан — такие блоки заведут свои
                        детали кроя, не общие с остальными размерами
                      </Text>
                    </CalloutBox>
                  );
                })()}
              {missingOnLayer.length > 0 && (
                <CalloutBox tone='warning'>
                  <Text size='micro' component='p'>
                    на слое {contourLayer || '—'} нет контура у {missingOnLayer.length} блоков —
                    их не видно ни на листе, ни в списке: {missingOnLayer.slice(0, 6).join(', ')}
                    {missingOnLayer.length > 6 ? '…' : ''}
                  </Text>
                </CalloutBox>
              )}
              {/* One graded DXF draws the whole size run on one sheet. Overlaid they are
                  unreadable, so only one size is ever on screen — and since a cut piece is ONE
                  piece across the grade, switching size changes what you look at, never what
                  gets created. */}
              {sizeOptions.length > 1 && (
                <div className='mb-1 flex flex-wrap items-center gap-1'>
                  <Text size='nano' variant='label' component='span'>
                    размер:
                  </Text>
                  {sizeOptions.map((o) => (
                    <Button
                      key={o.size || '(none)'}
                      type='button'
                      variant={o.size === shownSize ? 'main' : 'secondary'}
                      size='xs'
                      title={`${o.count} контуров`}
                      onClick={() => setActiveSize(o.size)}
                    >
                      {/* Группа целиком из помеченных контуров — это «UNI», а не «без размера»:
                          размер у них не потерян, его и не должно быть. Смешанная группа
                          подписывается прежним словом — там размер и правда не опознан. */}
                      {o.size || (o.count > 0 && o.uniCount === o.count ? 'UNI' : 'без размера')}
                    </Button>
                  ))}
                </div>
              )}
              <PieceSheet
                // Keyed by the FILE and the SIZE: zoom/pan live inside the sheet, so without a
                // remount switching either kept the previous drawing's viewBox — and two sizes
                // sit at different places on the sheet, so the view would land on nothing.
                key={`${sheet.index}|${shownSize}`}
                pieces={sheetPieces}
                grainLayer={showGrain ? grainLayer : ''}
                innerLayers={innerLayers}
                keyOf={ciOf}
                markOf={markOf}
                labelOf={labelOf}
                selectedKey={selected}
                onPick={setSelected}
              />
            </div>

            <div className='w-full shrink-0 space-y-1.5 lg:w-72'>
              {!focus && (
                <Text size='micro' variant='label' component='p'>
                  выберите деталь на листе — по форме и соседям видно, что это, чего не скажет
                  имя блока из файла.
                </Text>
              )}
              {focus && (
                <div className='space-y-1.5 border border-borderColor p-2'>
                  <Text size='micro' component='p' className='break-words'>
                    деталь <span className='uppercase'>{focus.block}</span> · ×{focus.instances} в
                    изделии
                  </Text>
                  {focus.sizes.length > 0 && (
                    <Text size='nano' variant='label' component='p'>
                      одна на размеры: {focus.sizes.join(' ')}
                    </Text>
                  )}
                  {focus.mappedTo && !focus.dropped ? (
                    <>
                      {/* Renaming right here is the point of the sheet: the shape tells you what
                          the piece IS, so that is the moment the right name is known. It renames
                          the cut piece everywhere, because the alias points at its line_key. */}
                      {nameField('деталь кроя', focus.mappedName ?? '', (v) =>
                        renamePiece(focus.mappedTo!, v),
                      )}
                      <Button
                        type='button'
                        variant='secondary'
                        size='xs'
                        onClick={() => toggleUnmap(focus.ci)}
                      >
                        снять связь
                      </Button>
                    </>
                  ) : focus.dropped ? (
                    <>
                      <Text size='micro' variant='label' component='p'>
                        связь с «{focus.mappedName}» будет снята
                      </Text>
                      <Button
                        type='button'
                        variant='secondary'
                        size='xs'
                        onClick={() => toggleUnmap(focus.ci)}
                      >
                        вернуть
                      </Button>
                    </>
                  ) : focus.row ? (
                    <>
                      <div className='flex flex-wrap items-center gap-1'>
                        {choiceSelect(
                          focus.ci,
                          focus.row.block,
                          focus.row.instances,
                          focus.row.choice,
                        )}
                        {basisLabel(focus.row)}
                      </div>
                      {/* Creating: the block name is only the default. «PERED_S» is what the
                          exporter called it; the factory sheet needs «полочка правая». */}
                      {focus.row.choice === CREATE &&
                        nameField(
                          'название новой детали',
                          draftNames[focus.ci] ?? defaultPieceName(focus.row),
                          (v) => setDraftNames((prev) => ({ ...prev, [focus.ci]: v })),
                        )}
                      {/* Bound to an existing piece in this same pass — renaming it here is the
                          same one-place edit as above. */}
                      {focus.row.choice && focus.row.choice !== CREATE &&
                        nameField(
                          'деталь кроя',
                          nameByPieceKey.get(focus.row.choice.toLowerCase()) ?? '',
                          (v) => renamePiece(focus.row!.choice, v),
                        )}
                    </>
                  ) : (
                    <Text size='micro' variant='label' component='p'>
                      этот блок не из текущего разбора — откройте диалог заново
                    </Text>
                  )}
                </div>
              )}
              <Text size='nano' variant='label' component='p'>
                связь хранится по {scope.byPurpose ? 'НАЗНАЧЕНИЮ' : 'ТКАНИ'} и ведёт на деталь кроя,
                а не на имя: имена блоков гуляют от файла к файлу. Поэтому следующий размер этой же
                ткани приходит уже сопоставленным, и деталей кроя от него не прибавляется.
                {scope.byPurpose && scope.lines.length > 1
                  ? ' В это назначение разложено несколько артикулов — связь общая для всех: лекало одно, различается только полотно.'
                  : ''}
              </Text>
              <Text size='nano' variant='label' component='p'>
                связи и новые детали уйдут при сохранении карточки.
              </Text>
            </div>
          </div>
        )}

        {/* НЕПОЛНЫЙ РАЗБОР — ОБЪЯСНЕНИЕ НА МЕСТЕ СЕКЦИИ УДАЛЕНИЯ (находка 1). Секция ниже просто
            не появится, а пустое место читается как «всё на месте» — то есть ровно как ответ,
            которого разбор дать не может. Поэтому вместо предложений здесь стоит причина.
            Здесь же названы ОБА выключенных исхода (находка 2 второго ревью): ноль в «обновить ×»
            обязан быть объяснён там же, где ноль в удалениях, иначе он читается как «в чертеже всё
            совпало» — то есть ровно наоборот. */}
        {parse.phase === 'ready' && !parse.complete && (
          <div className='space-y-1'>
            <GroupLabel flush>в чертеже больше нет (—)</GroupLabel>
            <CalloutBox tone='warning'>
              <div className='space-y-0.5'>
                <Text size='micro' component='p'>
                  <b>
                    разобрано файлов: {parse.filesParsed} из {parse.filesTotal}
                    {parse.blocksSkipped > 0
                      ? `, пропущено блоков внутри файлов: ${parse.blocksSkipped}`
                      : ''}
                  </b>{' '}
                  — предложений об удалении деталей не будет. По неполному разбору нельзя
                  утверждать, что деталь исчезла из чертежа: её блок мог лежать в листе, который не
                  докачался или не прочитался
                  {parse.blocksSkipped > 0
                    ? ', либо в самом файле остаться неразвёрнутым (ссылка на отсутствующее определение блока, слишком глубокая вложенность, исчерпанный лимит вставок)'
                    : ''}
                  . Проверьте предупреждения разбора выше и откройте диалог заново.
                </Text>
                <Text size='micro' component='p'>
                  <b>«× на изделие» и «как кроится» тоже не пересчитываются</b> — у уже заведённых
                  деталей они останутся как есть. «Этой детали в изделии столько-то» — утверждение
                  про ПОЛНЫЙ набор блоков: не доехал один лист, и число молча занизится, а вслед за
                  ним сменится разметка кроя. Поэтому «обновить ×» здесь показывает ноль, а все
                  привязанные детали идут в «без изменений».
                </Text>
                <Text size='nano' variant='label' component='p'>
                  сопоставление и заведение новых деталей работают как обычно: они утверждают про
                  то, что В файлах есть, а не про то, чего в них нет и сколько его всего.
                </Text>
              </div>
            </CalloutBox>
          </div>
        )}

        {/* В ЧЕРТЕЖЕ БОЛЬШЕ НЕТ — второй исход этого диалога, рядом с первым. Показывается ТОЛЬКО
            составом потерь: «деталь удалится» само по себе звучит как уборка мусора, а уносит оно
            строки рецепта колорвеев и замеренные площади — работу, которую делали руками и
            восстановить которую будет неоткуда. Решение по каждой детали отдельное: чертёж
            утверждает про крой, а деталь могла жить в карточке и по другой причине. */}
        {parse.phase === 'ready' && deleteCandidates.length > 0 && (
          <div className='space-y-1'>
            {massVanish && (
              <CalloutBox tone='error'>
                <Text size='micro' component='p'>
                  <b>
                    исчезло деталей: {deleteCandidates.length} из {scopeBoundPieces} привязанных к
                    этой ткани.
                  </b>{' '}
                  Похоже, файл заменён не тем или выбран не тот слой — проверьте список файлов и
                  выбранный контур выше. Разбор при этом ПОЛОН — все файлы прочитаны и ни один блок
                  внутри них не пропущен: по неполному разбору предложений об удалении не бывает
                  вовсе. Применить всё равно можно — замена лекал целиком бывает и законной.
                </Text>
              </CalloutBox>
            )}
            <GroupLabel flush>в чертеже больше нет ({deleteCandidates.length})</GroupLabel>
            {/* Формулировка называет ИМЕННО тот критерий, по которому деталь сюда попала: блок не
                встретился разбору ни разу. «Не нашлось контура» — это другое утверждение, и по нему
                деталь не удаляют (находка 1 третьего ревью). */}
            <Text size='nano' variant='label' component='p'>
              блоки этих деталей не встретились в разобранных файлах этой ткани ни разу — ни на
              одном слое, ни в одном размере, — и ни к какой другой ткани они не привязаны. По
              умолчанию такая деталь удаляется — вместе с тем, что на ней держится.
            </Text>
            {deleteCandidates.map((c) => {
              const decision = deleteDecision(c.lineKey);
              const key = c.lineKey.trim().toLowerCase();
              const hold = recipeHold.get(key);
              const areas = areaRowsByPiece.get(key) ?? 0;
              const ops = opsByPiece.get(key) ?? 0;
              return (
                <div key={c.lineKey} className='space-y-0.5 pt-1'>
                  <div className='flex flex-wrap items-center gap-1.5'>
                    <Text size='micro' component='span' className='min-w-0 flex-1 truncate'>
                      {c.name?.trim() || '—'}
                    </Text>
                    {/* Состояние читается СЛОВОМ. Красный здесь по делу — «сейчас будет
                        разрушено», — но он второй, а не единственный носитель смысла. */}
                    <Pill tone={decision === 'delete' ? 'warn' : 'mut'}>
                      {decision === 'delete' ? 'будет удалена' : 'остаётся'}
                    </Pill>
                    <select
                      className='h-7 border border-borderColor bg-bgColor px-1 text-micro'
                      aria-label={`что сделать с деталью ${c.name?.trim() || c.lineKey}`}
                      value={decision}
                      onChange={(e) =>
                        setDeleteChoice((prev) =>
                          new Map(prev).set(
                            c.lineKey,
                            e.target.value === 'keep' ? 'keep' : 'delete',
                          ),
                        )
                      }
                    >
                      <option value='delete'>удалить</option>
                      <option value='keep'>оставить</option>
                    </select>
                  </div>
                  <Text size='nano' variant='label' component='p' className='break-words'>
                    исчезли блоки: {c.blocks.join(', ')}
                  </Text>
                  {decision === 'delete' ? (
                    <>
                      <Row
                        label={
                          <Text size='micro' component='span'>
                            строки рецепта
                            {hold ? ` (${hold.colorways.join(', ')})` : ' в колорвеях карточки'}
                          </Text>
                        }
                        value={
                          <Text size='micro' component='span'>
                            {hold?.rows ?? 0}
                          </Text>
                        }
                      />
                      {/* Вписанная норма — единственное здесь, что считал человек. Назначение ткани
                          без детали ни во что не входит, а число — входит в себестоимость. */}
                      {(hold?.withNorm ?? 0) > 0 && (
                        <Row
                          tone='error'
                          label={
                            <Text size='micro' component='span'>
                              из них с вписанной НОРМОЙ — восстановить будет неоткуда
                            </Text>
                          }
                          value={
                            <Text size='micro' component='span'>
                              {hold?.withNorm ?? 0}
                            </Text>
                          }
                        />
                      )}
                      <Row
                        label={
                          <Text size='micro' component='span'>
                            замеренные площади, строк по размерам
                          </Text>
                        }
                        value={
                          <Text size='micro' component='span'>
                            {areas > 0 ? areas : '—'}
                          </Text>
                        }
                      />
                      <Row
                        label={
                          <Text size='micro' component='span'>
                            операций сборки потеряют эту деталь
                          </Text>
                        }
                        value={
                          <Text size='micro' component='span'>
                            {ops > 0 ? ops : '—'}
                          </Text>
                        }
                      />
                      {/* Выноска эскиза переживает деталь намеренно: номер на чертеже принадлежит
                          рисунку, а не строке таблицы, и стирать его из-за смены лекал значило бы
                          переписывать эскиз чужими руками. */}
                      <Text size='nano' variant='label' component='p'>
                        выноска на эскизе остаётся — её номер принадлежит рисунку, а не детали
                      </Text>
                    </>
                  ) : (
                    <Text size='nano' variant='label' component='p'>
                      деталь остаётся в карточке вместе со связью на блок, которого в чертеже больше
                      нет
                    </Text>
                  )}
                </div>
              );
            })}
            <Text size='nano' variant='label' component='p'>
              строки рецепта посчитаны по колорвеям, которые показывает карточка: архивные она не
              читает, а их строки держат деталь так же и уедут вместе с ней.
            </Text>
            <Text size='nano' variant='label' component='p'>
              удаление применяется при СОХРАНЕНИИ карточки — до него ничего не потеряно, и отменить
              его можно, перечитав карточку.
            </Text>
          </div>
        )}

        {/* Заведение пачкой. Имена уже нормализованы — BP_1_S и BP_1_XL это один BP_1 — так что
            «завести всё» создаёт ровно по одной детали кроя на деталь чертежа, а не по одной на
            размер. Девять выпадающих списков подряд никто не выберет правильно. */}
        {rows.length > 0 && (
          <div className='flex flex-wrap items-center gap-2'>
            <Text size='nano' variant='label' component='span'>
              не сопоставлено: {rows.length}
            </Text>
            <Button
              type='button'
              variant='secondary'
              size='xs'
              disabled={rows.every((r) => r.choice)}
              onClick={() =>
                setRows((prev) => prev.map((r) => (r.choice ? r : { ...r, choice: CREATE })))
              }
            >
              завести все как детали кроя ({rows.filter((r) => !r.choice).length})
            </Button>
            <Button
              type='button'
              variant='secondary'
              size='xs'
              disabled={rows.every((r) => !r.choice)}
              onClick={() => setRows((prev) => prev.map((r) => ({ ...r, choice: '' })))}
            >
              снять выбор
            </Button>
          </div>
        )}

        {/* The same state as a list: a sheet answers «which piece is this», a list answers
            «what is still unanswered» and stays reachable from the keyboard. */}
        {rows.length > 0 && (
          <DataTable variant='grid' className='[&_td]:text-micro'>
            <thead>
              <tr>
                <th>деталь в DXF</th>
                <th>размеры</th>
                <th>в изделии</th>
                <th>деталь кроя</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const ci = r.block.toLowerCase();
                return (
                  <tr
                    key={r.block}
                    className={selected === ci ? 'bg-bgZebra' : undefined}
                    onFocus={() => setSelected(ci)}
                  >
                    <td className='min-w-0 truncate'>
                      <button
                        type='button'
                        className='text-left underline-offset-2 hover:underline'
                        onClick={() => setSelected(ci)}
                        title='показать на листе'
                      >
                        {r.block}
                      </button>
                    </td>
                    {/* Размеры, в которых деталь нашлась. Это и есть видимое доказательство,
                        что строка одна на всю градацию: BP_1_XS…BP_1_XL — одна деталь BP_1. */}
                    <td className='whitespace-nowrap'>
                      {r.sizes.length > 0 ? r.sizes.join(' ') : '—'}
                    </td>
                    <td>×{r.instances}</td>
                    <td>
                      <div className='flex flex-wrap items-center gap-1'>
                        {choiceSelect(ci, r.block, r.instances, r.choice)}
                        {basisLabel(r)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}

        {rows.length > 0 && (
          <Text size='nano' variant='label' component='p'>
            имена нормализованы: BP_1_S и BP_1_XL — это одна деталь BP_1, и заводится она один
            раз на все размеры. «пропустить» оставляет блок несопоставленным — диалог предложит
            его снова.
          </Text>
        )}

        {/* Already mapped, with a way OUT. A wrong mapping puts the wrong cloth on a piece at the
            cutting table; leaving it unreachable would make the dialog's own caution about that
            empty words. */}
        {mappedRows.length > 0 && (
          <div className='space-y-1'>
            <Text size='nano' variant='label' component='p'>
              уже сопоставлено для «{fabricName}» ({mappedRows.length})
            </Text>
            {mappedRows.map((m) => {
              const off = unmapped.includes(m.ci);
              return (
                <div key={m.ci} className='flex flex-wrap items-center gap-1.5'>
                  <button
                    type='button'
                    className={`min-w-0 flex-1 truncate text-left text-micro underline-offset-2 hover:underline ${off ? 'line-through opacity-60' : ''}`}
                    onClick={() => setSelected(m.ci)}
                    title='показать на листе'
                  >
                    {m.block} → {m.pieceName}
                  </button>
                  <Button
                    type='button'
                    variant='secondary'
                    size='xs'
                    onClick={() => toggleUnmap(m.ci)}
                  >
                    {off ? 'вернуть' : 'снять'}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* ЧТО СДЕЛАЕТ ОДНО НАЖАТИЕ — все четыре исхода, названные рядом с кнопкой, которая их
            исполнит. Раньше диалог только сопоставлял, и подпись на кнопке была полным ответом;
            теперь он заводит, удаляет, пересчитывает и размечает, а увидеть это можно было бы
            только по сохранённой карточке — то есть после. «Без изменений» стоит здесь наравне с
            остальными: это и есть видимое доказательство, что повторный проход по тем же файлам
            ничего не переписывает. */}
        {parse.phase === 'ready' && hasOutcome && (
          <div className='space-y-0.5 border border-borderColor p-2'>
            <Text size='micro' component='p'>
              применение: создать {outcome.created} · удалить {outcome.removed} · обновить ×{' '}
              {outcome.updated} · без изменений {outcome.unchanged}
            </Text>
            {/* Ноль в «обновить ×» имеет ДВА разных смысла — «чертёж сошёлся» и «считать не по
                чему», — и по одной цифре они неразличимы. Второй называется прямо здесь, у самой
                цифры: причина подробно разобрана выше, в блоке про неполный разбор. */}
            {!parseComplete && (
              <Text size='nano' variant='label' component='p'>
                разбор неполон, поэтому «обновить ×» здесь всегда ноль: «× на изделие» и «как
                кроится» у уже заведённых деталей не трогаются вовсе — см. блок про неполный разбор
                выше.
              </Text>
            )}
            <Text size='nano' variant='label' component='p'>
              «обновить ×» — число на изделие пересчитывается по чертежу (сумма по разным деталям
              чертежа; копии одной детали, разложенные по размерным выгрузкам, не складываются) и
              заодно проставляется «как кроится: одинаковые копии» там, где ответа не было: чертёж
              несёт каждый контур, значит деталь режется как нарисована.
            </Text>
            <Text size='nano' variant='label' component='p'>
              явные «зеркальные пары» и «со сгибом» модалка не трогает — кроме случая, когда новое
              число делает зеркальную пару невозможной (нечётное или меньше двух): тогда ставится
              «одинаковые копии», иначе карточка не сохранится вовсе. Чертёж здесь прямо
              противоречит пометке и несёт каждый контур отдельно — значит деталь режется как
              нарисована.
            </Text>
          </div>
        )}
      </div>
    </ConfirmationModal>
  );
}
