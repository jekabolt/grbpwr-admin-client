import { common_MediaFull, common_TechCard } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useFieldArray, useFormContext, useFormState, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Canvas, Pin } from 'ui/components/canvas';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { Tiles } from 'ui/components/tiles';
import { isDxfUrl } from 'utils/pattern';
import { ulid } from 'utils/ulid';
import {
  bomPurposeLabel,
  fabricScopes,
  isRollGoodsSection,
  scopeKeyOfBinding,
  type FabricScope,
  type RollGoodsLine,
} from './bom-purpose';
import {
  findPiece,
  fmtCm,
  PieceShape,
  useDxfGeometry,
  useDxfIndex,
  type FoundPiece,
  type PieceBlockRef,
  type ScopedDxfFile,
} from './nesting/dxf-geometry';
import {
  CUT_SYMMETRY_EVEN_COUNT_MESSAGE,
  UNSET_CUT_SYMMETRY,
  cutSymmetryBadge,
  cutSymmetryCountInvalid,
  cutSymmetryOptions,
  cutSymmetryOptionsFor,
  cutSymmetryUnanswered,
  grainlineArrow,
  grainlineOptionsFor,
  isCutSymmetryMarked,
  pieceCodeOptions,
} from './piece-codes';
import { normalizePieceName } from './piece-picker';
import { TechCardFormData } from './schema';
import { useCrossHighlight } from './useCrossHighlight';

type FormPiece = NonNullable<TechCardFormData['pieces']>[number];
type FormCallout = {
  number?: number;
  mediaId?: number;
  part?: string;
  posX?: string;
  posY?: string;
};

// Panel controls sit at the same metrics as `Input` (1px edge box, 3px/7px, 22px min height) —
// DESIGN.md §5. A native select, not the Radix one: this panel is dense, and Radix's Select cannot
// carry an empty-string option, which is exactly the value a piece that has never been given a
// grainline holds.
const selectCls =
  'block min-h-[22px] w-full appearance-none rounded-none border border-borderColor bg-bgColor px-[7px] py-[3px] text-textBaseSize transition-colors focus:border-textColor focus:outline-none';

// Русская форма счётчика деталей для сводки группы: «1 деталь · 2 детали · 5 деталей».
const ruPieces = (n: number): string => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'деталь';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'детали';
  return 'деталей';
};

// The marker diagram inside the selected-piece panel (13.1). Grainline is GEOMETRY — a picture
// verifies it faster than a column of words — so the callout number each piece already carries is
// drawn where the sketch says it lives. Pins are positioned against the image's own box (not a
// fixed-aspect frame) because callout posX/posY are fractions OF THE IMAGE: letterboxing a 4:3
// sketch inside a 3:4 frame would slide every pin off the part it names.
function PieceDiagram({
  techCard,
  pinnedNumbers,
  labelForPin,
  activePin,
  onActivePinChange,
}: {
  techCard?: common_TechCard;
  pinnedNumbers: Set<number>;
  labelForPin: (n: number) => string;
  activePin: number | null;
  onActivePinChange: (n: number | null) => void;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const callouts = (useWatch({ control, name: 'callouts' }) ?? []) as FormCallout[];

  const mediaById = useMemo(() => {
    const m = new Map<number, common_MediaFull>();
    for (const rm of techCard?.resolvedTechnicalMedia ?? []) {
      if (rm.media?.id != null) m.set(rm.media.id, rm.media);
    }
    return m;
  }, [techCard?.resolvedTechnicalMedia]);

  const urlFor = (mediaId: number) => {
    const f = mediaById.get(mediaId);
    return f?.media?.fullSize?.mediaUrl || f?.media?.thumbnail?.mediaUrl || '';
  };

  // Only callouts a piece actually points at are drawn — an unreferenced pin belongs to the sketch
  // tab, not to the cut list. The view shown is whichever technical sketch hosts the most of them.
  const drawable = callouts.filter((c) => {
    const n = c.number ?? 0;
    if (n <= 0 || !pinnedNumbers.has(n)) return false;
    if (!urlFor(c.mediaId ?? 0)) return false;
    return !Number.isNaN(parseFloat(c.posX ?? '')) && !Number.isNaN(parseFloat(c.posY ?? ''));
  });

  const bestMediaId = useMemo(() => {
    const counts = new Map<number, number>();
    for (const c of drawable) {
      const id = c.mediaId ?? 0;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    let best = 0;
    let bestN = 0;
    for (const [id, n] of counts) if (n > bestN) [best, bestN] = [id, n];
    return best;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawable.map((c) => `${c.mediaId}:${c.number}`).join(',')]);

  const shown = drawable.filter((c) => (c.mediaId ?? 0) === bestMediaId);
  const url = bestMediaId ? urlFor(bestMediaId) : '';

  if (!url || shown.length === 0) {
    return (
      <div className='flex flex-col gap-1'>
        <Canvas aspect='3/4' className='flex items-center justify-center'>
          <Text
            size='micro'
            variant='label'
            component='span'
            className='px-2 text-center uppercase'
          >
            нет выносок
          </Text>
        </Canvas>
        {/* Инструкция обязана называть ТО МЕСТО, где действие есть. Прежняя звала «проставить
            callout # у детали» — контрол, которого в этом блоке нет с 30.07; связь ставится
            выбором детали в самой выноске на вкладке sketch. */}
        <Text size='micro' variant='label'>
          поставьте выноску на эскизе (вкладка sketch) и выберите в ней эту деталь в поле «part» —
          пин появится здесь
        </Text>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-1'>
      <div className='relative w-full border border-borderColor'>
        <img src={url} alt='piece diagram' draggable={false} className='block w-full select-none' />
        {shown.map((c) => {
          const n = c.number as number;
          return (
            <Pin
              key={`${c.mediaId}-${n}`}
              x={parseFloat(c.posX ?? '0') * 100}
              y={parseFloat(c.posY ?? '0') * 100}
              label={n}
              title={labelForPin(n)}
              highlighted={activePin === n}
              onMouseEnter={() => onActivePinChange(n)}
              onMouseLeave={() => onActivePinChange(null)}
            />
          );
        })}
      </div>
      <Text size='micro' variant='label'>
        наведите на плитку — её пин подсветится
      </Text>
    </div>
  );
}

// Cut-piece details (детали кроя) — a tile per pattern part, grouped by fabric scope.
//
// This block lives on the PATTERNS tab, directly under «выкройки (DXF)», because a cut piece is a
// property of the PATTERN, not of a colour: every colourway cuts the same pieces. The pieces
// themselves arrive from the DXF through «↔ детали кроя» on the panel above, so the dialog and the
// list it writes into are now on one screen. What stays on COLORWAYS is the per-colourway fabric
// map — which BOM line each piece is cut from in that colourway, and its fusing — because that IS
// per-colourway data.
//
// The 7-column table this used to be forced a horizontal scroll on every monitor (min 860px inside
// a 1fr track beside a 200px rail) and let one row grow five lines tall, because three independent
// warning channels lived in three different columns. A real card is 20–40 rows. The tiles carry
// what an operator scans FOR (shape, name, count, size); everything editable lives in ONE
// selected-piece panel below, a peer block — a block never contains a block (DESIGN.md).
//
// The `pieces` field array is owned HERE and nowhere else. `PieceMatchModal` writes through a ROOT
// `setValue('pieces', …)` on purpose: measured against react-hook-form 7.62, `append`/`remove` emit
// only on `_subjects.state`, never `_subjects.array`, so a second `useFieldArray('pieces')` anywhere
// would not resync and a piece created from the DXF dialog would be invisible until a save+refetch.
export function PiecesTab({ techCard }: { techCard?: common_TechCard }) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: 'pieces' });
  const pieces = (useWatch({ control, name: 'pieces' }) ?? []) as FormPiece[];
  const { errors } = useFormState({ control });
  // DXF block → piece aliases (0262). They are what lets this block say where a piece came from:
  // a piece with an alias is drawn in a real CAD file, and that file — not the word in the `grain`
  // field — is what the раскладка orients the piece by.
  const aliases = (useWatch({ control, name: 'pieceDxfAliases' }) ?? []) as Array<{
    bomLineKey?: string;
    fabricPurpose?: string;
    blockName?: string;
    pieceLineKey?: string;
  }>;
  // Скоупы ткани карточки — то, ПО ЧЕМУ хранится и связь блока с деталью, и привязка листа
  // выкройки (0267: назначение, а где карточка ещё не разложена — строка BOM). Нужны здесь и для
  // предпросмотра (одно и то же имя блока в файле верха и в файле подклада — РАЗНЫЕ детали), и для
  // группировки плиток: деталь лежит в группе той ткани, из чьего файла она нарисована.
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as Array<{
    lineKey?: string;
    section?: string;
    purpose?: string;
    name?: string;
  }>;
  const patterns = (useWatch({ control, name: 'patterns' }) ?? []) as Array<{
    url?: string;
    name?: string;
    filename?: string;
    bomLineKey?: string;
    fabricPurpose?: string;
  }>;

  // Tile ↔ pin cross-highlight, the same hook the construction tab drives its sketch with.
  const pin = useCrossHighlight<number>();
  // Разбор DXF стоит скачивания файлов, поэтому он включается человеком: «⌕ показать формы» в
  // шапке. Одно нажатие — контуры на всех плитках; геометрия идёт из общего кэша карточки
  // (dxf-geometry.tsx), так что если её уже разобрала панель выкроек — ничего не качается.
  const [shapesOn, setShapesOn] = useState(false);
  // Выбранная плитка — её поля редактирует панель ниже. Ключ — стабильный id строки RHF; пустой
  // или потерянный (деталь удалена, массив переписан диалогом сопоставления) откатывается к
  // первой детали, чтобы панель с полями не исчезала, пока детали есть.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Фильтры плиток: чип скоупа ткани («все» по умолчанию) и счётчик «парность не указана» в
  // шапке, который по клику оставляет только неразмеченные.
  const [filter, setFilter] = useState<string>('all');
  const [pairingOnly, setPairingOnly] = useState(false);

  const scopes = useMemo(
    () =>
      fabricScopes(
        bomItems
          .filter((b) => isRollGoodsSection(b.section) && !!b.lineKey)
          .map((b) => ({
            lineKey: b.lineKey!,
            purpose: b.purpose,
            name: b.name,
            section: b.section,
          })),
      ),
    [bomItems],
  );

  // Подпись скоупа для чипа фильтра и заголовка группы: у назначения — само назначение, у
  // неразобранной строки — её название (то же правило, что у панели выкроек, без списка артикулов
  // — чип должен оставаться коротким).
  const scopeLabel = (s: FabricScope<RollGoodsLine>): string => {
    if (!s.byPurpose) return s.lines[0]?.name?.trim() || 'без названия';
    return bomPurposeLabel(s.key);
  };

  // Which DXF blocks each piece is drawn as, by lineKey. Case-folded on the key the same way the
  // matching dialog and the server do, so a piece is found whichever spelling the alias carries.
  // Скоуп едет вместе с именем: без него связь — это просто строка, а строка «полочка» есть и на
  // верхе, и на подкладе.
  const blocksByPiece = useMemo(() => {
    const m = new Map<string, PieceBlockRef[]>();
    for (const a of aliases) {
      const key = (a.pieceLineKey ?? '').trim().toLowerCase();
      const block = (a.blockName ?? '').trim();
      if (!key || !block) continue;
      // Разрешённый скоуп, а не сырой ключ: связь, записанная на строку до того, как её разложили
      // в назначение, принадлежит теперь этому назначению — ровно как у листов выкроек.
      const scopeKey = scopeKeyOfBinding(a.fabricPurpose, a.bomLineKey, scopes);
      const list = m.get(key) ?? [];
      if (!list.some((r) => r.scopeKey === scopeKey && r.block === block)) {
        list.push({ scopeKey, block });
      }
      m.set(key, list);
    }
    return m;
  }, [aliases, scopes]);

  // Листы, которые вообще стоит качать: только DXF и только тех тканей, где связи есть. Скачивать
  // подкладку ради предпросмотра деталей верха — это десятки мегабайт, не дающие ни одной формы.
  const previewFiles = useMemo<ScopedDxfFile[]>(() => {
    const needed = new Set<string>();
    for (const refs of blocksByPiece.values()) for (const r of refs) needed.add(r.scopeKey);
    return (
      patterns
        .filter((p) => !!p.url && isDxfUrl(p.url))
        .map((p) => ({
          scopeKey: scopeKeyOfBinding(p.fabricPurpose, p.bomLineKey, scopes),
          name: p.name || p.filename || 'выкройка.dxf',
          url: p.url!,
        }))
        // Пустой скоуп — это лист, потерявший ткань, и он НЕ участвует: панель выкроек для таких
        // прямо говорит, что детали кроя недоступны, и подставлять их сюда значило бы угадывать
        // ткань — ровно то, от чего весь этот скоуп и защищает.
        .filter((f) => !!f.scopeKey && needed.has(f.scopeKey))
    );
  }, [patterns, scopes, blocksByPiece]);

  // Общий разбор карточки (React Query, ключ по содержимому пачки): второй читатель той же пачки —
  // панель выкроек или раскладка — получает геометрию мгновенно, и наоборот.
  const geometry = useDxfGeometry(previewFiles, shapesOn);
  const index = useDxfIndex(geometry.data);

  // Контур каждой привязанной детали — один раз на рендер геометрии, а не на плитку.
  const foundByKey = useMemo(() => {
    if (!index) return null;
    const m = new Map<string, FoundPiece | null>();
    for (const [key, refs] of blocksByPiece) m.set(key, findPiece(index, refs));
    return m;
  }, [index, blocksByPiece]);

  // Usage.pieceIndex renumbering on piece removal now belongs to the colourway recipe (server-owned,
  // edited via UpdateColorwayRecipe) — the RHF `colorways` array is always empty, so the old
  // form-state renumbering loop was dead. Just drop the piece row here.
  // Release the piece's referrers before dropping it, the same contract the BOM's removeArticle
  // keeps. An operation still naming a deleted piece fails the save server-side
  // (operations[N].piece_line_key: no cut-piece "…" in this style) and rolls the whole transaction
  // back — on a key the operator cannot see, from a row they did not touch.
  const removePiece = (pi: number) => {
    const removedKey = (getValues(`pieces.${pi}.lineKey`) as string) || '';
    if (removedKey) {
      const operations = (getValues('operations') ?? []) as TechCardFormData['operations'];
      (operations ?? []).forEach((o, oi) => {
        const keys = (o.pieceLineKeys ?? []).filter(Boolean);
        if (keys.includes(removedKey)) {
          setValue(
            `operations.${oi}.pieceLineKeys`,
            keys.filter((k) => k !== removedKey),
            { shouldDirty: true },
          );
        }
      });
    }
    remove(pi);
  };

  // Duplicate CODE / NAME rows, case-insensitively. A piece name is how a human addresses the part
  // in the operation picker, the recipe norm and the factory sheet, so two pieces called «полочка»
  // make every one of those references ambiguous. Flagged here on the field (the server rejects the
  // save with the same rule, so catching it at the source beats a blocked save later).
  const duplicateRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of pieces) {
      const key = normalizePieceName(p.name ?? '');
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return new Set(
      pieces
        .map((p, i) => ((counts.get(normalizePieceName(p.name ?? '')) ?? 0) > 1 ? i : -1))
        .filter((i) => i >= 0),
    );
  }, [pieces]);

  // `detached` is OUTPUT-ONLY (S8 orphan control): the store raises it when a piece's
  // callout_number stops resolving to a callout on the card — the sketch callout it was pinned to
  // was deleted. The piece survives on purpose rather than being dropped, which is exactly why it
  // has to be VISIBLE here: until now it only appeared on the printed tech pack, so the one screen
  // that can re-pin it was the one screen that never mentioned it. Keyed by lineKey, off the SAVED
  // card — a row added since the last save has no server verdict yet and simply carries none.
  const detachedKeys = useMemo(() => {
    const set = new Set<string>();
    for (const p of techCard?.techCard?.pieces ?? []) {
      const key = p.lineKey?.trim();
      if (key && p.detached) set.add(key);
    }
    return set;
  }, [techCard?.techCard?.pieces]);

  // Which callout numbers the pieces reference, and what to call each pin in its tooltip.
  const pinnedNumbers = useMemo(
    () => new Set(pieces.map((p) => p.calloutNumber || 0).filter((n) => n > 0)),
    [pieces],
  );
  const labelForPin = (n: number) =>
    pieces
      .filter((p) => (p.calloutNumber || 0) === n)
      .map((p) => p.name?.trim() || 'без названия')
      .join(' · ') || `#${n}`;

  // Разметка кроя по всему блоку: сколько деталей уйдёт на фабрику с оговоркой «парность не
  // указана» (то же условие, что печатает тех-пак — Р5), и сколько вообще без ответа. Первое число
  // — счётчик риска и метр кампании Д2; второе живёт в подсказке, потому что деталь по одной на
  // изделие тоже стоит разметить (сгиб печатается и у неё), но кричать про неё не о чем.
  const unmarked = useMemo(() => {
    let pairing = 0;
    let any = 0;
    for (const p of pieces) {
      if (isCutSymmetryMarked(p.cutSymmetry)) continue;
      any += 1;
      if (cutSymmetryUnanswered(p.cutSymmetry, p.piecesPerGarment)) pairing += 1;
    }
    return { pairing, any, total: pieces.length };
  }, [pieces]);

  // Переименование детали, ПРИКРЕПЛЁННОЙ к выноске, обязано дописаться в саму выноску.
  //
  // Имя такой детали хранится один раз — в `callout.part`, — и сервер при каждом сохранении
  // переписывает имя детали оттуда (calloutSync.apply, S8). Написать новое имя только в поле
  // панели значит показать оператору переименование, которое сохранение молча откатит: поле
  // выглядит принятым, карточка после перезагрузки снова со старым именем, и объяснения нет
  // нигде. Номер выноски отсюда НЕ правится — его ставит выбор детали на вкладке sketch.
  const renamePiece = (pi: number, value: string) => {
    setValue(`pieces.${pi}.name`, value, { shouldDirty: true });
    const n = (getValues(`pieces.${pi}.calloutNumber`) as number) || 0;
    if (!n) return;
    const cs = (getValues('callouts') ?? []) as Array<{ number?: number }>;
    cs.forEach((c, ci) => {
      if ((c.number ?? 0) === n)
        setValue(`callouts.${ci}.part`, value.trim(), { shouldDirty: true });
    });
  };

  // A new row is minted with its stable lineKey up front, NOT left for the save mapper: the
  // operation and recipe pickers can only offer a piece that already has one, so without it a part
  // added here stayed unlinkable until the card had been saved and reloaded.
  const [pendingSelectLast, setPendingSelectLast] = useState(false);
  const addPiece = () => {
    append({
      name: '',
      lineKey: ulid(),
      piecesPerGarment: 1,
      // Явно, а не через дефолт схемы: новая строка стартует «не размечено», и это состояние —
      // ответ «никто не спрашивал», а не отсутствие поля.
      cutSymmetry: UNSET_CUT_SYMMETRY,
      grainline: '',
      fused: false,
      calloutNumber: 0,
      note: '',
      materials: [],
    });
    // Новая деталь редактируется в панели, и панель обязана открыться на ней: id строки появится
    // только на следующем рендере, поэтому выбор откладывается флагом.
    setPendingSelectLast(true);
  };
  useEffect(() => {
    if (!pendingSelectLast || fields.length === 0) return;
    setSelectedId(fields[fields.length - 1].id);
    setPendingSelectLast(false);
  }, [pendingSelectLast, fields]);

  // Плитки, разложенные по скоупам ткани. Скоуп детали — скоуп её первой привязки с ЖИВЫМ скоупом:
  // findPiece при поиске контура молча пропускает привязку, чья ткань никуда не резолвится (её
  // файлы даже не качаются), поэтому брать безусловно refs[0] значило бы положить деталь с
  // привязками [потерянная, живая] в группу «связь без ткани», пока картинка рисуется из живой.
  // Деталь без привязки — в хвостовой группе «без блока DXF»; деталь, у которой НИ ОДНА связь не
  // ведёт к живой ткани (строку BOM удалили или переклассифицировали), — в группе «связь без
  // ткани», а не в «без блока»: сказать «блока нет» тут значило бы обвинить чертёж в том, чего он
  // не делал.
  const groups = useMemo(() => {
    const byScope = new Map<string, number[]>();
    const unbound: number[] = [];
    fields.forEach((_, pi) => {
      const p = pieces[pi] ?? {};
      const refs = blocksByPiece.get((p.lineKey ?? '').trim().toLowerCase()) ?? [];
      if (refs.length === 0) {
        unbound.push(pi);
        return;
      }
      const sk = refs.find((r) => !!r.scopeKey)?.scopeKey ?? '';
      byScope.set(sk, [...(byScope.get(sk) ?? []), pi]);
    });
    const out: Array<{ key: string; label: string; indices: number[] }> = [];
    for (const s of scopes) {
      const idx = byScope.get(s.key);
      if (idx?.length) out.push({ key: `s:${s.key}`, label: scopeLabel(s), indices: idx });
      byScope.delete(s.key);
    }
    // scopeKeyOfBinding резолвит либо в живой скоуп, либо в '' — единственный возможный остаток.
    for (const [, idx] of byScope) {
      out.push({ key: 's:', label: 'связь без ткани', indices: idx });
    }
    if (unbound.length) out.push({ key: 'unbound', label: 'без блока DXF', indices: unbound });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields, pieces, blocksByPiece, scopes]);

  // Фильтр, чей чип исчез (скоуп опустел, последняя неразмеченная деталь размечена), обязан
  // сброситься сам — иначе плитки остаются отфильтрованными контролом, которого больше нет.
  useEffect(() => {
    if (filter !== 'all' && !groups.some((g) => g.key === filter)) setFilter('all');
  }, [filter, groups]);
  useEffect(() => {
    if (pairingOnly && unmarked.pairing === 0) setPairingOnly(false);
  }, [pairingOnly, unmarked.pairing]);

  const visibleGroups = useMemo(
    () =>
      groups
        .filter((g) => filter === 'all' || filter === g.key)
        .map((g) => ({
          ...g,
          indices: pairingOnly
            ? g.indices.filter((pi) =>
                cutSymmetryUnanswered(pieces[pi]?.cutSymmetry, pieces[pi]?.piecesPerGarment),
              )
            : g.indices,
        }))
        .filter((g) => g.indices.length > 0),
    [groups, filter, pairingOnly, pieces],
  );

  // Выбранная деталь. Потерянный выбор (удаление, перезапись массива диалогом сопоставления)
  // откатывается к первой детали — панель с полями не должна пропадать, пока детали есть.
  const selIndex = useMemo(() => {
    const i = selectedId ? fields.findIndex((f) => f.id === selectedId) : -1;
    if (i >= 0) return i;
    return fields.length > 0 ? 0 : -1;
  }, [selectedId, fields]);

  // Ошибка валидации (своя или серверная) на детали, которой нет в панели, обязана эту панель
  // переключить: якоря `data-field` полей живут только у ВЫБРАННОЙ детали, а revealField умеет
  // подождать несколько кадров (index.tsx) — ровно столько, сколько стоит это переключение. Тот же
  // приём, каким sketch-tab силой раскрывает свёрнутый блок выносок под ошибкой (19.8). Фильтры
  // сбрасываются вместе с выбором: деталь с ошибкой, скрытая чипом скоупа или счётчиком парности,
  // оставила бы плитки БЕЗ выбранной детали — панель называет себя «выбранная на плитках выше» и
  // обязана этому соответствовать.
  const pieceErrors = errors.pieces;
  useEffect(() => {
    if (!pieceErrors || typeof pieceErrors !== 'object') return;
    const first = Object.keys(pieceErrors)
      .filter((k) => /^\d+$/.test(k))
      .map(Number)
      .sort((a, b) => a - b)[0];
    if (first == null) return;
    const id = fields[first]?.id;
    if (id) {
      setSelectedId(id);
      setFilter('all');
      setPairingOnly(false);
    }
    // fields намеренно вне зависимостей: прыгать надо на НОВУЮ ошибку, а не на каждый рендер массива.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieceErrors]);

  const sel = selIndex >= 0 ? pieces[selIndex] ?? ({} as FormPiece) : null;
  const selKey = (sel?.lineKey ?? '').trim();
  const selRefs = sel ? blocksByPiece.get(selKey.toLowerCase()) ?? [] : [];
  const selFound = sel && foundByKey ? foundByKey.get(selKey.toLowerCase()) ?? null : null;
  const selCallout = sel?.calloutNumber || 0;
  const selDup = selIndex >= 0 && duplicateRows.has(selIndex);
  const selOddPair = sel ? cutSymmetryCountInvalid(sel.cutSymmetry, sel.piecesPerGarment) : false;
  const selUnanswered = sel ? cutSymmetryUnanswered(sel.cutSymmetry, sel.piecesPerGarment) : false;
  const selArrow = grainlineArrow(sel?.grainline);

  // Удаление выбранной детали передаёт выбор СОСЕДУ (предыдущему по индексу, иначе следующему), а
  // не первой детали списка: при чистке хвоста в 40 строк панель, прыгающая каждый раз в начало,
  // заставляла бы заново прокручивать плитки после каждого удаления. Сосед берётся из снимка
  // `fields` ДО remove — id выживших строк useFieldArray сохраняет.
  const removeSelected = () => {
    if (selIndex < 0) return;
    const neighbour = fields[selIndex - 1]?.id ?? fields[selIndex + 1]?.id ?? null;
    removePiece(selIndex);
    setSelectedId(neighbour);
  };

  return (
    <>
      <Section
        title='детали кроя'
        question='— что кроится по этим выкройкам. Одни и те же детали для всех колорвеев. Из какой ткани кроится каждая деталь в конкретном колорвее — редактора пока НЕТ ни на одной вкладке, столбец в cut list из-за этого пустой'
        action={
          <div className='flex flex-wrap items-center gap-2'>
            {unmarked.pairing > 0 && (
              // Кликается — значит Chip, не Pill (контракт дизайн-системы), но в цветах прежней
              // синей пилюли: клик оставляет на плитках только неразмеченные детали. Выбранный —
              // обычная залитая чернилами форма чипа, чтобы нажатость читалась.
              <Chip
                className={pairingOnly ? undefined : 'border-warning text-warning'}
                selected={pairingOnly}
                pressed={pairingOnly}
                onClick={() => setPairingOnly((v) => !v)}
                title={`Деталей, которые идут по две и больше на изделие, а как кроятся — не сказано: ${unmarked.pairing}. В тех-паке у каждой такой строки печатается «парность не указана»: молчать нельзя, потому что после миграции 0266 зеркальная пара выглядит как голая «2», и цех выкроит две одинаковые панели вместо левой и правой. Всего без разметки: ${unmarked.any} из ${unmarked.total}. Клик — показать только такие детали.`}
              >
                парность не указана: {unmarked.pairing}
              </Chip>
            )}
            {duplicateRows.size > 0 && (
              <Pill
                tone='warn'
                title='двум и более деталям дано одно имя. Имя — то, как деталь называют в операциях, рецептуре и на фабричном листе; сервер отвергает сохранение с дублем — имя должно быть уникальным.'
              >
                дубль имени: {duplicateRows.size}
              </Pill>
            )}
            {previewFiles.length > 0 && (
              <Button
                type='button'
                variant='secondary'
                size='sm'
                aria-pressed={shapesOn}
                title={
                  shapesOn
                    ? 'убрать контуры с плиток; разобранная геометрия остаётся в кэше'
                    : 'имя блока формы не несёт — скачать привязанные DXF и показать контур каждой детали с реальным габаритом; файлы скачаются и разберутся один раз, кэш общий с панелью выкроек'
                }
                onClick={() => setShapesOn((v) => !v)}
              >
                {shapesOn ? '⌕ скрыть формы' : '⌕ показать формы'}
              </Button>
            )}
            <Button
              type='button'
              variant='main'
              size='sm'
              data-field='pieces.add'
              onClick={addPiece}
            >
              + piece
            </Button>
          </div>
        }
      >
        <datalist id='piece-code-suggestions'>
          {pieceCodeOptions.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        {fields.length === 0 ? (
          <Text size='micro' variant='label'>
            деталей ещё нет — заведите их из DXF кнопкой «↔ детали кроя» над этим блоком, либо
            добавьте вручную (полочка, спинка, воротник…)
          </Text>
        ) : (
          <>
            <ChipRow>
              <Chip selected={filter === 'all'} onClick={() => setFilter('all')}>
                все {fields.length}
              </Chip>
              {groups.map((g) => (
                <Chip key={g.key} selected={filter === g.key} onClick={() => setFilter(g.key)}>
                  {g.key === 'unbound' ? 'без блока' : g.label} {g.indices.length}
                </Chip>
              ))}
            </ChipRow>

            {shapesOn && geometry.isError && (
              <div className='flex flex-wrap items-center gap-2'>
                <Text size='nano' component='span' className='break-words text-error'>
                  {geometry.error?.message || 'не удалось разобрать файлы'}
                </Text>
                <Button
                  type='button'
                  variant='secondary'
                  size='xs'
                  onClick={() => geometry.refetch()}
                >
                  ещё раз
                </Button>
              </div>
            )}
            {/* Недокачанный лист — это молча пропавшие детали: их блоки просто «не найдены», что
                читается как отсутствие привязки. Поэтому о нём говорится вслух. */}
            {shapesOn &&
              (geometry.data?.warnings ?? []).map((w, i) => (
                <Text key={i} size='nano' component='span' className='break-words text-error'>
                  {w}
                </Text>
              ))}

            <div className='flex flex-col gap-5'>
              {visibleGroups.map((g) => (
                <div key={g.key} className='flex flex-col gap-2'>
                  <GroupLabel
                    flush
                    action={
                      <Text size='micro' variant='label'>
                        {g.indices.length} {ruPieces(g.indices.length)} ·{' '}
                        {g.indices.reduce((n, pi) => n + (pieces[pi]?.piecesPerGarment ?? 1), 0)} шт
                        на изделие
                      </Text>
                    }
                  >
                    {g.label}
                  </GroupLabel>
                  <Tiles min={118}>
                    {g.indices.map((pi) => {
                      const p = pieces[pi] ?? ({} as FormPiece);
                      const key = (p.lineKey ?? '').trim();
                      const refs = blocksByPiece.get(key.toLowerCase()) ?? [];
                      const found =
                        foundByKey && refs.length > 0
                          ? foundByKey.get(key.toLowerCase()) ?? null
                          : null;
                      const lostScope = refs.length > 0 && refs.every((r) => !r.scopeKey);
                      // «Нет в разобранных файлах» существует только ПОСЛЕ разбора: пока
                      // геометрия не включена или грузится, отсутствие контура — не диагноз.
                      const missing = shapesOn && !!index && refs.length > 0 && !found;
                      const dup = duplicateRows.has(pi);
                      // Нечётная зеркальная пара — то, что реально роняет сохранение (CHECK в
                      // БД), поэтому она видна с плитки, а не только из панели: без этого
                      // размеченная «зеркальными» деталь с ×3 выглядела бы здоровой.
                      const oddPair = cutSymmetryCountInvalid(p.cutSymmetry, p.piecesPerGarment);
                      const unanswered = cutSymmetryUnanswered(p.cutSymmetry, p.piecesPerGarment);
                      const detached = detachedKeys.has(key);
                      const badge = cutSymmetryBadge(p.cutSymmetry, p.piecesPerGarment);
                      const short = badge && badge.tone !== 'attention' ? badge.label : '';
                      const callout = p.calloutNumber || 0;
                      const isSelected = pi === selIndex;
                      // Цвет канта ВСЕГДА в паре со словом на самой плитке (DESIGN.md: состояние
                      // не сообщается одним цветом): красные слова — «дубль имени» / «× нечётное»
                      // в подписи, «нет в файлах» / «ткань потеряна» в окне контура; синие —
                      // «парность не указана» и «откреплена» (той же тревоги, что их пилюли в
                      // панели, — кант при них остаётся по правилу парности, откреплённость канта
                      // не красит).
                      const flags: Array<{ k: string; cls: string; word: string }> = [];
                      if (dup) flags.push({ k: 'dup', cls: 'text-error', word: 'дубль имени' });
                      if (oddPair) flags.push({ k: 'odd', cls: 'text-error', word: '× нечётное' });
                      if (unanswered)
                        flags.push({ k: 'sym', cls: 'text-warning', word: 'парность не указана' });
                      if (detached)
                        flags.push({ k: 'det', cls: 'text-warning', word: 'откреплена' });
                      return (
                        <div key={fields[pi]?.id ?? pi} {...pin.bind(callout > 0 ? callout : null)}>
                          <button
                            type='button'
                            aria-pressed={isSelected}
                            onClick={() => setSelectedId(fields[pi]?.id ?? null)}
                            className={cn(
                              'flex h-full w-full flex-col bg-bgColor text-left transition-colors hover:border-textColor',
                              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
                              // Вес несёт выбор, цвет — здоровье (контракт Tile): выбранная
                              // плитка утолщает кант до 2px с компенсацией паддинга, чтобы
                              // контент не дёргался. Тень элементу в потоке DESIGN.md запрещает.
                              isSelected ? 'border-2 p-[5px]' : 'border p-1.5',
                              dup || missing || oddPair
                                ? 'border-error'
                                : unanswered
                                  ? 'border-warning'
                                  : isSelected
                                    ? 'border-textColor'
                                    : 'border-borderColor',
                              pin.isActive(callout) && 'bg-bgZebra',
                            )}
                          >
                            <div className='flex h-[84px] w-full items-center justify-center bg-bgZebra p-1'>
                              {found ? (
                                <PieceShape
                                  piece={found.piece}
                                  grainLayer={index?.grainLayer ?? ''}
                                  outlineOnly
                                />
                              ) : (
                                <Text
                                  size='nano'
                                  component='span'
                                  variant={missing ? undefined : 'label'}
                                  className={cn(
                                    'px-1 text-center uppercase',
                                    missing && 'text-error',
                                  )}
                                >
                                  {/* Отсутствие привязки и потерянная ткань известны СТАТИЧЕСКИ —
                                      до всякого скачивания, поэтому они раньше `shapesOn`: иначе
                                      подпись обещала бы, что кнопка загрузит форму, которой нет. */}
                                  {refs.length === 0
                                    ? 'нет блока DXF'
                                    : lostScope
                                      ? 'ткань потеряна'
                                      : !shapesOn
                                        ? '⌕ формы не загружены'
                                        : geometry.isPending
                                          ? 'разбор DXF…'
                                          : geometry.isError
                                            ? 'ошибка разбора'
                                            : 'нет в файлах'}
                                </Text>
                              )}
                            </div>
                            <Text size='micro' className='mt-1 w-full truncate font-bold uppercase'>
                              {p.name?.trim() || 'без названия'}
                            </Text>
                            <Text size='micro' variant='label' className='w-full truncate'>
                              ×{p.piecesPerGarment ?? 1}
                              {short ? ` ${short}` : ''}
                            </Text>
                            {found && (
                              <Text size='micro' variant='label' className='w-full truncate'>
                                {fmtCm(found.piece.bboxW)} × {fmtCm(found.piece.bboxH)} см
                              </Text>
                            )}
                            {flags.length > 0 && (
                              <Text size='nano' component='p' className='w-full truncate uppercase'>
                                {flags.map((f, i) => (
                                  <Fragment key={f.k}>
                                    {i > 0 && ' · '}
                                    <span className={f.cls}>{f.word}</span>
                                  </Fragment>
                                ))}
                              </Text>
                            )}
                          </button>
                        </div>
                      );
                    })}
                  </Tiles>
                </div>
              ))}
            </div>
          </>
        )}
      </Section>

      {/* Панель выбранной детали — БЛОК-РОВНЯ под плитками, не вложенный: блок никогда не содержит
          блок (DESIGN.md). Здесь живёт всё редактирование и все объяснения; плитки только
          показывают и выбирают. */}
      {sel && selIndex >= 0 && (
        <Section
          title='деталь'
          question='— выбранная на плитках выше: форма из чертежа, поля строки и происхождение имени'
          action={
            <Button
              type='button'
              variant='secondary'
              size='xs'
              aria-label='remove piece'
              onClick={removeSelected}
            >
              ✕ удалить деталь
            </Button>
          }
        >
          <div className='grid gap-2.5 lg:grid-cols-[240px_minmax(0,1fr)]'>
            {/* Две проекции одной и той же детали, одна под другой: КАКОЙ она формы (контур из
                DXF — единственное место в карточке, где виден её реальный габарит, посчитанный по
                файлу, а не введённый руками) и ГДЕ она на изделии (выноска на скетче). */}
            <div className='flex flex-col gap-1'>
              <div className='flex h-40 w-full items-center justify-center border border-borderColor bg-bgColor p-1'>
                {selFound ? (
                  <PieceShape piece={selFound.piece} grainLayer={index?.grainLayer ?? ''} />
                ) : (
                  <Text size='nano' variant='label' component='span' className='px-1 text-center'>
                    {/* Отсутствие привязки и потерянная ткань известны СТАТИЧЕСКИ — до всякого
                        скачивания, поэтому они раньше `shapesOn`: обещать, что кнопка загрузит
                        форму, которой нет, значило бы врать. Сказать «блока нет в файлах» про
                        связь, чья ткань ни к чему живому не ведёт (строку BOM удалили или
                        переклассифицировали), значило бы обвинить чертёж в том, чего он не делал. */}
                    {selRefs.length === 0
                      ? 'у этой детали нет привязанного блока DXF'
                      : selRefs.every((r) => !r.scopeKey)
                        ? `у связи с «${selRefs[0].block}» потеряна ткань — перепривяжите лист на панели выкроек`
                        : !shapesOn
                          ? 'формы не загружены — нажмите «⌕ показать формы» в шапке блока'
                          : geometry.isPending
                            ? 'разбор DXF…'
                            : geometry.isError
                              ? geometry.error?.message || 'не удалось разобрать файлы'
                              : `блока «${selRefs[0].block}» в разобранных файлах нет — файл перезалили без него?`}
                  </Text>
                )}
              </div>
              {selFound && (
                <>
                  <Text size='nano' variant='label' component='span' className='break-words'>
                    {selFound.block}
                    {selFound.size
                      ? ` · размер ${selFound.size}${selFound.sizes.length > 1 ? ` из ${selFound.sizes.length}` : ''}`
                      : ''}
                  </Text>
                  <Text size='nano' variant='label' component='span'>
                    {fmtCm(selFound.piece.bboxW)}×{fmtCm(selFound.piece.bboxH)} см
                    {selFound.instances > 1 ? ` · ×${selFound.instances} в чертеже` : ''}
                  </Text>
                </>
              )}
              {shapesOn && index && (
                <Text size='nano' variant='label' component='span'>
                  слой {(selFound ? selFound.layer : index.contourLayer) || '—'}
                  {index.grainLayer ? `, долевая красным (слой ${index.grainLayer})` : ''}
                </Text>
              )}
              <PieceDiagram
                techCard={techCard}
                pinnedNumbers={pinnedNumbers}
                labelForPin={labelForPin}
                activePin={pin.active}
                onActivePinChange={pin.setActive}
              />
            </div>

            {/* Наведение или фокус в полях зажигает пин детали на эскизе слева — то же поведение,
                что несла строка старой таблицы: клавиатурный обход полей не должен терять связь
                «поле → место на изделии». */}
            <div
              className='flex flex-col gap-2.5'
              {...pin.bind(selCallout > 0 ? selCallout : null)}
            >
              <div>
                <Text size='micro' variant='label' component='label' className='uppercase'>
                  code / name
                </Text>
                <Input
                  className='w-full'
                  data-field={`pieces.${selIndex}.name`}
                  aria-invalid={selDup}
                  list='piece-code-suggestions'
                  value={sel.name ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    renamePiece(selIndex, e.target.value)
                  }
                  placeholder='FP front piece'
                />
                {selDup && (
                  <Text size='micro' variant='error'>
                    такая деталь уже есть — имя должно быть уникальным
                  </Text>
                )}
              </div>

              {/* Происхождение: из какого чертежа деталь и откуда приходит её имя. Связь с
                  выноской — только показ: ставится она на вкладке SKETCH, выбором детали в самой
                  выноске. Два места записи одного значения разошлись бы на первом же
                  переименовании. */}
              {(selRefs.length > 0 || selCallout > 0 || detachedKeys.has(selKey)) && (
                <div className='flex flex-wrap items-center gap-2'>
                  {selRefs.length > 0 && (
                    <Pill
                      tone='mut'
                      title={`деталь привязана к блокам DXF: ${selRefs.map((b) => b.block).join(', ')}. ЕСЛИ в файле у блока есть линия долевой, раскладка развернёт деталь по ней и слово отсюда на укладку не влияет; если линии нет — деталь ляжет как нарисована. Слово печатается в тех-пак в любом случае. Форму этого блока видно на плитке и в этой панели — включите «⌕ показать формы» в шапке блока.`}
                    >
                      блок DXF привязан
                    </Pill>
                  )}
                  {selCallout > 0 && !detachedKeys.has(selKey) && (
                    <Text size='micro' variant='label' component='span'>
                      выноска #{selCallout} — имя приходит с неё
                    </Text>
                  )}
                  {detachedKeys.has(selKey) && (
                    <Pill
                      tone='attention'
                      title='выноска, на которую ссылалась деталь, удалена со скетча (или перестала быть техническим эскизом) — выберите эту деталь в нужной выноске на вкладке sketch'
                    >
                      откреплена от выноски
                    </Pill>
                  )}
                </div>
              )}

              <div className='grid grid-cols-2 gap-2.5 lg:grid-cols-3'>
                <div>
                  <Text size='micro' variant='label' component='label' className='uppercase'>
                    × на изделие
                  </Text>
                  <Input
                    className='w-full'
                    type='number'
                    min='1'
                    // Помечено невалидным вместе с селектом: CHECK в БД двухколоночный, и
                    // нарушить его можно с ЛЮБОЙ из двух сторон — как выбрав «зеркальные пары»
                    // при нечётном количестве, так и исправив количество на нечётное у уже
                    // размеченной детали. Подсветить только селект значило бы указать не на то
                    // поле в половине случаев.
                    aria-invalid={selOddPair}
                    value={sel.piecesPerGarment ?? 1}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setValue(`pieces.${selIndex}.piecesPerGarment`, Number(e.target.value) || 1, {
                        shouldDirty: true,
                      })
                    }
                  />
                </div>
                <div>
                  <Text size='micro' variant='label' component='label' className='uppercase'>
                    как кроится
                  </Text>
                  <select
                    className={selectCls}
                    aria-label='как кроится'
                    // Якорь для revealField: и схема, и сервер адресуют нарушение чётности
                    // путём `pieces.N.cutSymmetry`, а прокрутить и подсветить он умеет только
                    // элемент с этим самым атрибутом. Без него ошибка находит вкладку, но не
                    // деталь.
                    data-field={`pieces.${selIndex}.cutSymmetry`}
                    aria-invalid={selOddPair}
                    value={sel.cutSymmetry ?? UNSET_CUT_SYMMETRY}
                    onChange={(e) =>
                      setValue(`pieces.${selIndex}.cutSymmetry`, e.target.value, {
                        shouldDirty: true,
                      })
                    }
                  >
                    {cutSymmetryOptionsFor(sel.cutSymmetry).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Text size='micro' variant='label' component='label' className='uppercase'>
                    fused
                  </Text>
                  <div className='flex min-h-[22px] items-center'>
                    <input
                      type='checkbox'
                      aria-label='fused'
                      checked={!!sel.fused}
                      onChange={(e) =>
                        setValue(`pieces.${selIndex}.fused`, e.target.checked, {
                          shouldDirty: true,
                        })
                      }
                    />
                  </div>
                </div>
              </div>
              {selOddPair && (
                <Text size='micro' variant='error'>
                  {CUT_SYMMETRY_EVEN_COUNT_MESSAGE}
                </Text>
              )}

              {/* Оговорка «парность не указана» объясняется ЗДЕСЬ и один раз — в шапке остался
                  только счётчик-фильтр. Чипы ставят ответ в один клик. */}
              {selUnanswered && (
                <CalloutBox tone='warning'>
                  <Text size='micro'>
                    эта деталь идёт по две и больше на изделие, а как они кроятся — не сказано. Если
                    это зеркальная пара, а лекало пришло полукомплектом, раскладка положит только
                    одну хиральность и на крой уйдут одни левые. В тех-паке у строки печатается
                    «парность не указана».
                  </Text>
                  <ChipRow className='mt-1'>
                    {cutSymmetryOptions
                      .filter((o) => o.value !== UNSET_CUT_SYMMETRY)
                      .map((o) => (
                        <Chip
                          key={o.value}
                          onClick={() =>
                            setValue(`pieces.${selIndex}.cutSymmetry`, o.value, {
                              shouldDirty: true,
                            })
                          }
                        >
                          {o.label}
                        </Chip>
                      ))}
                  </ChipRow>
                </CalloutBox>
              )}

              <div className='grid grid-cols-2 gap-2.5'>
                <div>
                  <Text size='micro' variant='label' component='label' className='uppercase'>
                    grain
                  </Text>
                  <div className='flex items-center gap-1'>
                    <select
                      className={selectCls}
                      aria-label='grainline'
                      value={sel.grainline ?? ''}
                      onChange={(e) =>
                        setValue(`pieces.${selIndex}.grainline`, e.target.value, {
                          shouldDirty: true,
                        })
                      }
                    >
                      {grainlineOptionsFor(sel.grainline).map((o) => (
                        <option key={o.value || '(unset)'} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <span aria-hidden className='shrink-0'>
                      {selArrow}
                    </span>
                  </div>
                  {/* Where the direction ACTUALLY comes from. A piece drawn in a DXF carries its
                      долевая as a line on its own layer, and that line — not this word — is what
                      the раскладка rotates the piece by. Saying so is the point: a word that
                      contradicts the file is worse than no word at all. */}
                  <Text size='micro' variant='label'>
                    слово в тех-пак; кроит линия из файла
                  </Text>
                </div>
                <div>
                  <Text size='micro' variant='label' component='label' className='uppercase'>
                    note
                  </Text>
                  <Input
                    className='w-full'
                    value={sel.note ?? ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setValue(`pieces.${selIndex}.note`, e.target.value, { shouldDirty: true })
                    }
                  />
                </div>
              </div>

              <div className='flex flex-col gap-1'>
                {/* Почему у поля вообще есть состояние «не размечено» и почему оно не
                    «одинаковые». Сказано один раз под полями, а не в подсказке каждой строки. */}
                <Text size='micro' variant='label'>
                  как кроится — количество этим НЕ меняется: «×2» и так означает две панели на
                  изделие, поле лишь говорит, копии это или левая с правой. «Не размечено» — не то
                  же самое, что «одинаковые»: это значит, что вопрос никто не задавал, и такой ответ
                  сохраняется как есть, не подменяясь умолчанием. Зеркальная пара делится пополам,
                  поэтому её количество обязано быть чётным; крой по сгибу парным не бывает по
                  построению (контур симметричен сам себе), а «со сгибом и нужна дважды» — это
                  манжеты: со сгибом × 2.
                </Text>
                {/* Said once, under the fields. The four values are the ones the server's CHECK
                    accepts — anything else fails the whole card save, which is why this stopped
                    being a free-text field with suggestions. */}
                <Text size='micro' variant='label'>
                  долевая — закрытый список (lengthwise / crosswise / bias / any): сервер отвергает
                  любое другое значение и роняет сохранение всей карточки. У детали, заведённой из
                  DXF, реальное направление задаёт линия долевой в самом файле — по ней раскладка
                  разворачивает деталь, а слово здесь только печатается в тех-пак и не должно ему
                  противоречить.
                </Text>
              </div>
            </div>
          </div>
        </Section>
      )}
    </>
  );
}
