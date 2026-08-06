// «детали кроя из DXF» — DXF block → cut piece, for ONE fabric (design §2.2).
//
// The problem this exists for, in the owner's words: block names drift between files, and the
// same generic name («полочка») means different pieces in the main-fabric file and the lining
// file. So the mapping is stored SCOPED BY FABRIC (0262, uniq on (card, bom_line_key,
// block_name)) and the name in the file is never the identity — `tech_card_piece.line_key` is.
// Once a block is mapped, renaming the piece is a one-place edit and every marker and DXF that
// mentions the block follows. The same scoping is why a SECOND SIZE of the same fabric needs no
// work at all: its blocks carry the same names, so they arrive already mapped.
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
import { useEffect, useMemo, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import type { PieceDTO } from 'lib/nesting/types';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { DataTable } from 'ui/components/data-table';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { ulid } from 'utils/ulid';
import { clampUtf8Bytes } from 'utils/pattern';
import type { TechCardFormData } from '../schema';
import { splitBlockSize } from './block-code';
import { blocksMissingOnLayer, defaultContourLayer, layerOptions } from './contour-layer';
import { defaultGrainLayer, grainLayerOptions } from './grain';
import { PieceSheet, type PieceMark } from './piece-sheet';
import {
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

// Block names are matched the way the DB collates them: trimmed, inner whitespace collapsed,
// compared case-insensitively. Mirrors the server's own normalization so what the dialog treats
// as one block is what the UNIQUE index treats as one block.
function normBlock(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

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
  // What the dialog proposes and why. 'exact' | 'loose' need no badge — they ARE the name;
  // 'similar' and 'other-fabric' are guesses and say so.
  suggested: string; // piece lineKey, '' = none
  basis: 'exact' | 'loose' | 'similar' | 'other-fabric' | 'none';
  choice: string; // piece lineKey, '' = unmapped, NEW = create a piece named after the block
};

// Sentinel for «создать новую деталь», deliberately unable to collide with a piece lineKey: a
// ULID is 26 chars of upper-case Crockford base32, so a '+' and lower case can never be one.
// (It used to be a string containing a raw NUL byte — invisible in every editor, and enough to
// make grep treat this whole file as binary.)
const CREATE = '+create';

// tech_card_piece.name is VARCHAR(255) and the server counts UTF-8 BYTES (Go len()), so a
// 255-character Cyrillic name is twice over the limit and would fail the whole card save.
const MAX_PIECE_NAME = 255;

export function PieceMatchModal({
  files,
  bomLineKey,
  fabricName,
  sizeLabel,
  onClose,
}: {
  files: NestingFile[] | null; // null = closed
  bomLineKey: string;
  fabricName: string;
  sizeLabel?: string;
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
  // was invisible in the «детали кроя» table (which sits on the COLORWAYS tab) until the card
  // was saved and refetched. The piece DID exist in form values, so the colourway recipe below
  // that table listed it — two views of one array disagreeing is worse than either being empty.
  //
  // The root write regenerates every field id, so the pieces table's rows remount. That costs
  // nothing but DOM focus here: those rows are fully CONTROLLED (value from useWatch + setValue
  // on change, not `register`), so a remount cannot lose a typed value — and this dialog is a
  // modal over the PATTERNS tab, so nothing there is mid-edit behind it anyway. Aliases have no
  // field array at all and always took an ordinary setValue.
  const pieces = (useWatch({ control, name: 'pieces' }) ?? []) as TechCardFormData['pieces'];
  const aliases = (useWatch({ control, name: 'pieceDxfAliases' }) ??
    []) as TechCardFormData['pieceDxfAliases'];
  const { parse } = useNesting(files);
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
  // Размеры, которые есть в файле, но не заведены в карточке. Пока их там нет, хвост у таких
  // блоков не отрезается — и одна деталь двоится на строку в каждом непризнанном размере.
  const sizeById = useSizeNames();
  const cardSizeIds = (useWatch({ control, name: 'sizeIds' }) ?? []) as number[];
  const orderSizes = useSizeOrdering();
  const missingSizes = useMemo(
    () => missingSizesIn(allPieces, dictTokens, cardSizeIds, sizeById),
    [allPieces, dictTokens, cardSizeIds, sizeById],
  );
  const addMissingSizes = () => {
    // Через корень массива: size-ids-field держит на нём свой useFieldArray, а append оттуда
    // его бы не уведомил — измерено на RHF 7.62 (см. комментарий у записи pieces).
    const next = orderSizes([...cardSizeIds, ...missingSizes.map((m) => m.sizeId)]);
    setValue('sizeIds', next, { shouldDirty: true });
  };
  // A stored alias may still carry a size-suffixed name from before the split existed. Folding it
  // through the same rule collapses «BP_1_XS» and «BP_1_M» onto the one identity they always
  // meant, and the full-set write then rewrites them in that form.
  const identityOf = (block: string) => normBlock(splitBlockSize(block, split.sizeTokenSet).identity);

  const [rows, setRows] = useState<BlockRow[]>([]);
  // Every block found in the files with its instance count, mapped or not — «снять» needs the
  // count to offer the block again in the SAME pass. Rebuilding `rows` from the effect instead
  // would wipe whatever the operator has already chosen.
  const [blockCounts, setBlockCounts] = useState<
    Map<string, { block: string; instances: number; sizes: string[] }>
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
  const mineByBlock = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of aliases ?? []) {
      if ((a.bomLineKey ?? '') !== bomLineKey) continue;
      const pk = (a.pieceLineKey ?? '').trim();
      if (!livePieceKeys.has(pk.toLowerCase())) continue;
      m.set(identityOf(a.blockName ?? '').toLowerCase(), pk);
    }
    return m;
  }, [aliases, bomLineKey, livePieceKeys, split]);
  const otherFabricByBlock = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of aliases ?? []) {
      if ((a.bomLineKey ?? '') === bomLineKey) continue;
      const k = loose(identityOf(a.blockName ?? ''));
      if (!m.has(k)) m.set(k, a.pieceLineKey ?? '');
    }
    return m;
  }, [aliases, bomLineKey, split]);

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
    for (const p of contourPieces) {
      // The IDENTITY, not the raw block: one DXF carries the whole grade («BP_1_XS», «BP_1_M»…),
      // and those are one cut piece in five sizes, not five pieces. Stripping the size suffix
      // here is what keeps the piece count a property of the STYLE.
      const b = normBlock(split.codeById.get(p.id)?.identity ?? p.blockName ?? '');
      if (!b) continue; // a file with no per-piece blocks has nothing to map
      const ci = b.toLowerCase();
      if (!spelling.has(ci)) spelling.set(ci, b);
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
    const all = new Map<string, { block: string; instances: number; sizes: string[] }>();
    for (const [ci, instances] of counts) {
      const sizes = [...(sizesByCi.get(ci) ?? [])].sort(
        (a, b) => (split.orderOfSize.get(a) ?? 1e6) - (split.orderOfSize.get(b) ?? 1e6),
      );
      all.set(ci, { block: spelling.get(ci)!, instances, sizes });
    }
    setBlockCounts(all);
    const next: BlockRow[] = [];
    for (const [ci, instances] of counts) {
      const block = spelling.get(ci)!;
      // "Already mapped" is tested on the SERVER's key, not on loose(): loose() strips all
      // punctuation, so «полочка 1» stored would have hidden a genuinely distinct «полочка-1»
      // from the dialog with no way to ever map it.
      if (mineByBlock.has(ci)) continue;
      let suggested = '';
      let basis: BlockRow['basis'] = 'none';
      const exact = pieceOptions.find((p) => p.name.toLowerCase() === block.toLowerCase());
      const byLoose = pieceOptions.find((p) => loose(p.name) === loose(block));
      const hint = otherFabricByBlock.get(loose(block));
      if (exact) {
        suggested = exact.lineKey;
        basis = 'exact';
      } else if (byLoose) {
        suggested = byLoose.lineKey;
        basis = 'loose';
      } else if (hint && pieceOptions.some((p) => p.lineKey === hint)) {
        suggested = hint;
        basis = 'other-fabric';
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
      next.push({ block, instances, sizes, suggested, basis, choice: preselect });
    }
    next.sort((a, b) => a.block.localeCompare(b.block, 'ru'));
    setRows(next);
  }, [parse, split, contourPieces, pieceOptions, mineByBlock, otherFabricByBlock]);

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
        // Matched on the IDENTITY, like `mineByBlock` itself: a stored alias may still spell the
        // size out, and comparing raw names would miss it and fall back to the bare key.
        block: identityOf(
          (aliases ?? []).find(
            (a) =>
              (a.bomLineKey ?? '') === bomLineKey &&
              identityOf(a.blockName ?? '').toLowerCase() === ci,
          )?.blockName ?? ci,
        ),
        pieceName: nameByKey.get(pieceKey.toLowerCase()) ?? '—',
      }))
      .sort((a, b) => a.block.localeCompare(b.block, 'ru'));
  }, [mineByBlock, aliases, bomLineKey, pieceOptions, split]);
  const toUnmap = unmapped.length;

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
  const sizeOptions = useMemo(() => {
    if (!sheet) return [];
    const seen = new Map<string, number>();
    for (const p of sheet.pieces) {
      const s = split.codeById.get(p.id)?.size ?? '';
      seen.set(s, (seen.get(s) ?? 0) + 1);
    }
    const rank = (s: string) => split.orderOfSize.get(s) ?? 1e6;
    return [...seen.entries()]
      .map(([size, count]) => ({ size, count }))
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
    if (row?.choice === CREATE) return `+ ${row.block}`;
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
      // renamed a piece on the PIECES tab while this dialog was open.
      const live = (getValues('pieces') ?? []) as NonNullable<TechCardFormData['pieces']>;
      // Two pieces sharing a name make every reference to «полочка» ambiguous on the factory
      // sheet, and the server rejects the save for it (useCreatePiece keeps the same rule). So a
      // typed name that already exists REUSES that piece instead of minting a second one.
      const keyByName = new Map<string, string>();
      for (const p of live) {
        const n = p.name?.trim().toLowerCase();
        if (n && p.lineKey?.trim()) keyByName.set(n, p.lineKey.trim());
      }

      // Rebuilt rather than appended to, so the set this dialog hands over is deduped under the
      // server's own identity: a second alias for the same (fabric, block) fails the whole card
      // save, and nothing else in the app can see or delete the offender.
      //
      // The slot half is NOT case-folded: it is an opaque ULID, so folding buys nothing and would
      // merge two fabrics' mappings if slot keys ever stopped being single-case.
      const aliasKey = (slot: string, block: string) => `${slot}|${normBlock(block).toLowerCase()}`;
      const byKey = new Map<string, { bomLineKey: string; blockName: string; pieceLineKey: string }>();
      const liveKeys = new Set(
        live.map((p) => p.lineKey?.trim().toLowerCase()).filter(Boolean) as string[],
      );
      for (const a of aliases ?? []) {
        // An alias whose piece was deleted is DROPPED, not carried over. The server resolves
        // piece_line_key against this card's pieces and answers `not_found` for one it cannot
        // resolve — which fails the entire card save over a row the UI deliberately hides (a
        // dangling alias is excluded from `mineByBlock` so its block can be mapped again). The
        // full-set write makes dropping it the repair.
        if (!liveKeys.has((a.pieceLineKey ?? '').trim().toLowerCase())) continue;
        // Свёрнуто к ИДЕНТИЧНОСТИ и на записи тоже. Читающая сторона (mineByBlock, mappedRows,
        // ciOf, unmapped) вся работает по идентичности, и пока эта петля переносила сырое имя,
        // ключи двух сторон не совпадали: «снять связь» удаляла ключ «B1|bp_1», а алиас лежал
        // под «B1|bp_1_xs» и переживал сохранение — кнопка отчитывалась об удалении, которого
        // не было. Хуже того, следующее сопоставление того же блока добавляло ВТОРОЙ алиас на
        // ту же физическую деталь, невидимый и неудаляемый ничем, кроме удаления самой детали.
        const ident = identityOf(a.blockName ?? '');
        byKey.set(aliasKey(a.bomLineKey ?? '', ident), {
          bomLineKey: a.bomLineKey ?? '',
          blockName: ident,
          pieceLineKey: a.pieceLineKey ?? '',
        });
      }
      // Unmapping is a first-class action: a wrong mapping assigns the wrong cloth to a piece on
      // the cutting floor, and before this the only exit was deleting the target piece.
      for (const b of unmapped) byKey.delete(aliasKey(bomLineKey, b));
      for (const r of rows) {
        if (!r.choice) continue;
        let pieceLineKey = r.choice;
        if (r.choice === CREATE) {
          const typed = (draftNames[r.block.toLowerCase()] ?? '').trim();
          const name = typed || r.block;
          const existing = keyByName.get(name.toLowerCase());
          if (existing) {
            // The operator typed the name of a piece that already exists — bind to it.
            pieceLineKey = existing;
          } else {
            pieceLineKey = ulid();
            keyByName.set(name.toLowerCase(), pieceLineKey);
            created.push({
              lineKey: pieceLineKey,
              name,
              // How many times the block appears in the file IS how many of that piece a garment
              // takes — the operator can still correct it on the pieces tab.
              piecesPerGarment: r.instances,
              mirrored: false,
              grainline: '',
              fused: false,
              calloutNumber: 0,
              note: '',
              materials: [],
            });
          }
        }
        byKey.set(aliasKey(bomLineKey, r.block), {
          bomLineKey,
          blockName: r.block,
          pieceLineKey,
        });
      }
      if (created.length > 0) {
        setValue('pieces', [...live, ...created] as TechCardFormData['pieces'], {
          shouldDirty: true,
        });
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

  const basisLabel = (r: BlockRow) => {
    if (!r.suggested) return null;
    if (r.basis === 'similar') return <Pill tone='warn'>предложено по похожести</Pill>;
    if (r.basis === 'other-fabric') return <Pill tone='warn'>по другой ткани</Pill>;
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
        toUnmap > 0 ? `применить (${decided} ↔, ${toUnmap} снять)` : `сопоставить (${decided})`
      }
      confirmDisabled={saving || (decided === 0 && toUnmap === 0)}
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
              {missingSizes.length > 0 && (
                <CalloutBox tone='warning'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <Text size='micro' component='span'>
                      в файле есть размеры, которых нет в карточке:{' '}
                      {missingSizes.map((m) => formatSizeName(m.name)).join(', ')} — пока они не
                      заведены, детали этих размеров считаются отдельными
                    </Text>
                    <Button type='button' variant='secondary' size='xs' onClick={addMissingSizes}>
                      добавить в карточку ({missingSizes.length})
                    </Button>
                  </div>
                </CalloutBox>
              )}
              {/* Осталась группа «без размера», хотя все словарные размеры уже заведены — значит
                  хвост этих блоков размером не является вовсе. */}
              {missingSizes.length === 0 &&
                sizeOptions.length > 1 &&
                sizeOptions.some((o) => o.size === '') && (
                  <CalloutBox tone='warning'>
                    <Text size='micro' component='p'>
                      у {sizeOptions.find((o) => o.size === '')?.count ?? 0} контуров размер в
                      имени не опознан — такие блоки заведут свои детали кроя, не общие с
                      остальными размерами
                    </Text>
                  </CalloutBox>
                )}
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
                      {o.size || 'без размера'}
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
                          draftNames[focus.ci] ?? focus.row.block,
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
                связь хранится по ТКАНИ и ведёт на деталь кроя, а не на имя: имена блоков гуляют
                от файла к файлу. Поэтому следующий размер этой же ткани приходит уже
                сопоставленным, и деталей кроя от него не прибавляется.
              </Text>
              <Text size='nano' variant='label' component='p'>
                связи и новые детали уйдут при сохранении карточки.
              </Text>
            </div>
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
      </div>
    </ConfirmationModal>
  );
}
