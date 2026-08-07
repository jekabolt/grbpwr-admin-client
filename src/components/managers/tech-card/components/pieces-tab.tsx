import { common_MediaFull, common_TechCard } from 'api/proto-http/admin';
import { useMemo, useState } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { Canvas, Pin } from 'ui/components/canvas';
import { DataTable } from 'ui/components/data-table';
import Input from 'ui/components/input';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { isDxfUrl } from 'utils/pattern';
import { ulid } from 'utils/ulid';
import { fabricScopes, isRollGoodsSection, scopeKeyOfBinding } from './bom-purpose';
import {
  PieceDxfPreview,
  type PieceBlockRef,
  type ScopedDxfFile,
} from './nesting/piece-dxf-preview';
import {
  CUT_SYMMETRY_EVEN_COUNT_MESSAGE,
  UNSET_CUT_SYMMETRY,
  cutSymmetryBadge,
  cutSymmetryCountInvalid,
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

// Table controls sit at the same metrics as `Input` (1px edge box, 3px/7px, 22px min height) —
// DESIGN.md §5. A native select, not the Radix one: this cell is dense, and Radix's Select cannot
// carry an empty-string option, which is exactly the value a piece that has never been given a
// grainline holds.
const selectCls =
  'block min-h-[22px] w-full appearance-none rounded-none border border-borderColor bg-bgColor px-[7px] py-[3px] text-textBaseSize transition-colors focus:border-textColor focus:outline-none';

// The marker diagram beside the table (13.1). Grainline is GEOMETRY — a picture verifies it faster
// than a column of words — so the callout number each piece already carries is drawn where the
// sketch says it lives. Pins are positioned against the image's own box (not a fixed-aspect frame)
// because callout posX/posY are fractions OF THE IMAGE: letterboxing a 4:3 sketch inside a 3:4 frame
// would slide every pin off the part it names.
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
        <Text size='micro' variant='label'>
          проставьте callout # у детали и расставьте выноски на вкладке sketch
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
        наведите на строку — её пин подсветится
      </Text>
    </div>
  );
}

// Cut-piece details (детали кроя) — one row per pattern part.
//
// This block lives on the PATTERNS tab, directly under «выкройки (DXF)», because a cut piece is a
// property of the PATTERN, not of a colour: every colourway cuts the same pieces. The pieces
// themselves arrive from the DXF through «↔ детали кроя» on the panel above, so the dialog and the
// list it writes into are now on one screen. What stays on COLORWAYS is the per-colourway fabric
// map — which BOM line each piece is cut from in that colourway, and its fusing — because that IS
// per-colourway data.
//
// The `pieces` field array is owned HERE and nowhere else. `PieceMatchModal` writes through a ROOT
// `setValue('pieces', …)` on purpose: measured against react-hook-form 7.62, `append`/`remove` emit
// only on `_subjects.state`, never `_subjects.array`, so a second `useFieldArray('pieces')` anywhere
// would not resync and a piece created from the DXF dialog would be invisible until a save+refetch.
export function PiecesTab({ techCard }: { techCard?: common_TechCard }) {
  const { control, getValues, setValue } = useFormContext<TechCardFormData>();
  const { fields, append, remove } = useFieldArray({ control, name: 'pieces' });
  const pieces = (useWatch({ control, name: 'pieces' }) ?? []) as FormPiece[];
  // DXF block → piece aliases (0262). They are what lets this table say where a piece came from:
  // a piece with an alias is drawn in a real CAD file, and that file — not the word in the `grain`
  // column — is what the раскладка orients the piece by.
  const aliases = (useWatch({ control, name: 'pieceDxfAliases' }) ?? []) as Array<{
    bomLineKey?: string;
    fabricPurpose?: string;
    blockName?: string;
    pieceLineKey?: string;
  }>;
  // Скоупы ткани карточки — то, ПО ЧЕМУ хранится и связь блока с деталью, и привязка листа
  // выкройки (0267: назначение, а где карточка ещё не разложена — строка BOM). Нужны здесь ровно
  // для предпросмотра: одно и то же имя блока в файле верха и в файле подклада — РАЗНЫЕ детали, и
  // искать контур по одному имени значило бы рано или поздно показать чужой.
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

  // Row ↔ pin cross-highlight, the same hook the construction tab drives its sketch with.
  const pin = useCrossHighlight<number>();
  // Разбор DXF стоит скачивания файлов, поэтому он включается человеком и панель монтируется
  // только тогда (см. piece-dxf-preview.tsx).
  const [previewOn, setPreviewOn] = useState(false);
  // Деталь, чей контур сейчас нарисован. Ставится наведением и НЕ снимается уходом курсора — см.
  // bindRow ниже. Ключ детали (lineKey), а не номер выноски: у выноски номер общий на несколько
  // деталей, а форму показывать надо ровно одну.
  const [shownPiece, setShownPiece] = useState<string | null>(null);

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
    return patterns
      .filter((p) => !!p.url && isDxfUrl(p.url))
      .map((p) => ({
        scopeKey: scopeKeyOfBinding(p.fabricPurpose, p.bomLineKey, scopes),
        name: p.name || p.filename || 'выкройка.dxf',
        url: p.url!,
      }))
      .filter((f) => needed.has(f.scopeKey));
  }, [patterns, scopes, blocksByPiece]);

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
  // in the operation picker, the recipe norm and the factory sheet, so two rows called «полочка»
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

  // Разметка кроя по всей вкладке: сколько деталей уйдёт на фабрику с оговоркой «парность не
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

  // Наведение на строку зажигает СРАЗУ ДВЕ проекции детали — её выноску на скетче (где она на
  // изделии) и её контур из DXF (какой она формы). Хендлеры объединены здесь, а не двумя
  // раскрытиями `bind` на одном <tr>: второе просто затёрло бы обработчики первого.
  //
  // Контур ЗАЛИПАЕТ на последней наведённой детали и по уходу курсора не гаснет — в отличие от
  // подсветки строки и пина, которые говорят «вот эта строка сейчас под курсором» и обязаны
  // сняться. Иначе форму нельзя было бы рассмотреть: движение курсора со строки к самой картинке
  // стирало бы то, ради чего его туда ведут.
  const bindRow = (callout: number, lineKey: string) => {
    const a = pin.bind(callout > 0 ? callout : null);
    const enter = () => {
      a.onMouseEnter();
      if (lineKey) setShownPiece(lineKey);
    };
    return {
      onMouseEnter: enter,
      onFocus: enter,
      onMouseLeave: a.onMouseLeave,
      onBlur: a.onBlur,
    };
  };

  // A new row is minted with its stable lineKey up front, NOT left for the save mapper: the
  // operation and recipe pickers can only offer a piece that already has one, so without it a part
  // added here stayed unlinkable until the card had been saved and reloaded.
  const addPiece = () =>
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

  return (
    <Section
      title='детали кроя'
      question='— что кроится по этим выкройкам. Одни и те же детали для всех колорвеев. Из какой ткани кроится каждая деталь в конкретном колорвее — редактора пока НЕТ ни на одной вкладке, столбец в cut list из-за этого пустой'
      action={
        <div className='flex items-center gap-2'>
          {unmarked.pairing > 0 && (
            <Pill
              tone='attention'
              title={`Деталей, которые идут по две и больше на изделие, а как кроятся — не сказано: ${unmarked.pairing}. В тех-паке у каждой такой строки печатается «парность не указана»: молчать нельзя, потому что после миграции 0266 зеркальная пара выглядит как голая «2», и цех выкроит две одинаковые панели вместо левой и правой. Всего без разметки: ${unmarked.any} из ${unmarked.total}.`}
            >
              парность не указана: {unmarked.pairing}
            </Pill>
          )}
          <Button type='button' variant='main' size='sm' data-field='pieces.add' onClick={addPiece}>
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
        // minmax(0,1fr) — not 1fr — so the wide table can shrink and scroll inside its own
        // overflow-x-auto instead of forcing the track wide and shoving the diagram column.
        <div className='grid gap-2.5 lg:grid-cols-[minmax(0,1fr)_200px]'>
          <DataTable className='min-w-[860px] [&_td]:!align-middle [&_td]:!text-left [&_th]:!text-left'>
            {/* Fixed column widths so every row lines up; the code/name column flexes, the rest are
                sized to their control. Alignment is forced left/middle (the DataTable default right-
                aligns, which fought the left-aligned inputs and read crooked). */}
            <colgroup>
              <col />
              <col className='w-[52px]' />
              <col className='w-[184px]' />
              <col className='w-[210px]' />
              <col className='w-[56px]' />
              <col className='w-[180px]' />
              <col className='w-[40px]' />
            </colgroup>
            <thead>
              <tr>
                <th>code / name</th>
                <th>×</th>
                {/* Сразу за количеством, потому что это его пояснение: «×2» ничего не говорит о
                    том, две это копии или левая с правой. */}
                <th>как кроится</th>
                <th>grain</th>
                <th>fused</th>
                <th>note</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {fields.map((f, pi) => {
                const p = pieces[pi] ?? {};
                const callout = p.calloutNumber || 0;
                const arrow = grainlineArrow(p.grainline);
                const blocks = blocksByPiece.get((p.lineKey ?? '').trim().toLowerCase()) ?? [];
                const symmetryBadge = cutSymmetryBadge(p.cutSymmetry, p.piecesPerGarment);
                const oddPair = cutSymmetryCountInvalid(p.cutSymmetry, p.piecesPerGarment);
                return (
                  <tr
                    key={f.id}
                    {...bindRow(callout, (p.lineKey ?? '').trim())}
                    // Зебра тут говорит «вот эта строка сейчас показана справа»: у выноски — пока
                    // курсор на ней, у чертежа — пока его контур нарисован, потому что иначе
                    // непонятно, к какой строке относится картинка, на которую смотришь.
                    className={
                      pin.isActive(callout) ||
                      (previewOn && !!p.lineKey && shownPiece === (p.lineKey ?? '').trim())
                        ? 'bg-bgZebra'
                        : undefined
                    }
                  >
                    <td>
                      <Input
                        className='w-full'
                        data-field={`pieces.${pi}.name`}
                        aria-invalid={duplicateRows.has(pi)}
                        list='piece-code-suggestions'
                        value={p.name ?? ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setValue(`pieces.${pi}.name`, e.target.value, { shouldDirty: true })
                        }
                        placeholder='FP front piece'
                      />
                      {duplicateRows.has(pi) && (
                        <Text size='micro' variant='error'>
                          такая деталь уже есть — имя должно быть уникальным
                        </Text>
                      )}
                      {detachedKeys.has((p.lineKey ?? '').trim()) && (
                        <div className='mt-0.5'>
                          <Pill
                            tone='attention'
                            title='выноска, на которую ссылалась деталь, удалена со скетча — проставьте callout # заново на вкладке sketch'
                          >
                            откреплена от выноски
                          </Pill>
                        </div>
                      )}
                    </td>
                    <td>
                      <Input
                        className='w-full'
                        type='number'
                        min='1'
                        // Помечено невалидным вместе с селектом: CHECK в БД двухколоночный, и
                        // нарушить его можно с ЛЮБОЙ из двух сторон — как выбрав «зеркальные пары»
                        // при нечётном количестве, так и исправив количество на нечётное у уже
                        // размеченной детали. Подсветить только селект значило бы указать не на то
                        // поле в половине случаев.
                        aria-invalid={oddPair}
                        value={p.piecesPerGarment ?? 1}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setValue(`pieces.${pi}.piecesPerGarment`, Number(e.target.value) || 1, {
                            shouldDirty: true,
                          })
                        }
                      />
                    </td>
                    <td>
                      <select
                        className={selectCls}
                        aria-label='как кроится'
                        // Якорь для revealField: и схема, и сервер адресуют нарушение чётности
                        // путём `pieces.N.cutSymmetry`, а прокрутить и подсветить он умеет только
                        // элемент с этим самым атрибутом. Без него ошибка находит вкладку, но не
                        // строку.
                        data-field={`pieces.${pi}.cutSymmetry`}
                        aria-invalid={oddPair}
                        value={p.cutSymmetry ?? UNSET_CUT_SYMMETRY}
                        onChange={(e) =>
                          setValue(`pieces.${pi}.cutSymmetry`, e.target.value, {
                            shouldDirty: true,
                          })
                        }
                      >
                        {cutSymmetryOptionsFor(p.cutSymmetry).map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      {/* Бейдж висит ТОЛЬКО там, где вопрос существует — у детали с ≥2 на изделие
                          без ответа. Он повторяет ровно ту строку, которую в этом случае напечатает
                          тех-пак, чтобы экран и бумага не расходились. У детали по одной на изделие
                          парности нет, и молчаливого селекта «— не размечено» там достаточно:
                          серый бейдж на каждой второй строке сегодня (размечено пока ничего) только
                          обесценил бы синий. */}
                      {symmetryBadge?.tone === 'attention' && (
                        <div className='mt-0.5'>
                          <Pill
                            tone='attention'
                            title='эта деталь идёт по две и больше на изделие, а как они кроятся — не сказано. Если это зеркальная пара, а лекало пришло полукомплектом, раскладка положит только одну хиральность и на крой уйдут одни левые. В тех-паке у строки печатается «парность не указана».'
                          >
                            {symmetryBadge.label}
                          </Pill>
                        </div>
                      )}
                      {oddPair && (
                        <Text size='micro' variant='error'>
                          {CUT_SYMMETRY_EVEN_COUNT_MESSAGE}
                        </Text>
                      )}
                    </td>
                    <td>
                      <div className='flex items-center gap-1'>
                        <select
                          className={selectCls}
                          aria-label='grainline'
                          value={p.grainline ?? ''}
                          onChange={(e) =>
                            setValue(`pieces.${pi}.grainline`, e.target.value, {
                              shouldDirty: true,
                            })
                          }
                        >
                          {grainlineOptionsFor(p.grainline).map((o) => (
                            <option key={o.value || '(unset)'} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        <span aria-hidden className='shrink-0'>
                          {arrow}
                        </span>
                      </div>
                      {/* Where the direction ACTUALLY comes from. A piece drawn in a DXF carries its
                          долевая as a line on its own layer, and that line — not this word — is what
                          the раскладка rotates the piece by. Saying so is the point: a word that
                          contradicts the file is worse than no word at all. */}
                      {blocks.length > 0 && (
                        <div className='mt-0.5'>
                          <Pill
                            tone='mut'
                            title={`деталь привязана к блокам DXF: ${blocks.map((b) => b.block).join(', ')}. ЕСЛИ в файле у блока есть линия долевой, раскладка развернёт деталь по ней и слово отсюда на укладку не влияет; если линии нет — деталь ляжет как нарисована. Слово печатается в тех-пак в любом случае. Форму этого блока можно увидеть справа — включите «⌕ деталь в чертеже» и наведите на строку.`}
                          >
                            блок DXF привязан
                          </Pill>
                        </div>
                      )}
                    </td>
                    <td>
                      <input
                        type='checkbox'
                        aria-label='fused'
                        checked={!!p.fused}
                        onChange={(e) =>
                          setValue(`pieces.${pi}.fused`, e.target.checked, {
                            shouldDirty: true,
                          })
                        }
                      />
                    </td>
                    <td>
                      <Input
                        className='w-full'
                        value={p.note ?? ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          setValue(`pieces.${pi}.note`, e.target.value, { shouldDirty: true })
                        }
                      />
                    </td>
                    <td>
                      <Button
                        type='button'
                        variant='secondary'
                        size='xs'
                        aria-label='remove piece'
                        onClick={() => removePiece(pi)}
                      >
                        ✕
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>

          {/* Две проекции одной и той же детали, одна под другой: ГДЕ она на изделии (выноска на
              скетче) и КАКОЙ она формы (контур из DXF). Обе ведёт одно наведение на строку. */}
          <div className='flex flex-col gap-2'>
            {previewFiles.length > 0 &&
              (previewOn ? (
                <PieceDxfPreview
                  files={previewFiles}
                  blocksByPiece={blocksByPiece}
                  activePieceKey={shownPiece}
                  activePieceName={
                    pieces.find((x) => (x.lineKey ?? '').trim() === shownPiece)?.name?.trim() ?? ''
                  }
                  onClose={() => setPreviewOn(false)}
                />
              ) : (
                <div className='flex flex-col gap-1'>
                  <Button
                    type='button'
                    variant='secondary'
                    size='xs'
                    title='скачать привязанные DXF и показывать форму детали при наведении на строку'
                    onClick={() => setPreviewOn(true)}
                  >
                    ⌕ деталь в чертеже
                  </Button>
                  <Text size='micro' variant='label'>
                    имя блока формы не несёт. Включите — и наведение на строку покажет её контур из
                    DXF с реальным габаритом; файлы скачаются и разберутся один раз.
                  </Text>
                </div>
              ))}

            <PieceDiagram
              techCard={techCard}
              pinnedNumbers={pinnedNumbers}
              labelForPin={labelForPin}
              activePin={pin.active}
              onActivePinChange={pin.setActive}
            />
          </div>

          {/* Said once, under the table, rather than per row. The four values are the ones the
              server's CHECK accepts — anything else fails the whole card save, which is why this
              stopped being a free-text field with suggestions. */}
          <div className='flex flex-col gap-1 lg:col-span-2'>
            <Text size='micro' variant='label'>
              долевая — закрытый список (lengthwise / crosswise / bias / any): сервер отвергает
              любое другое значение и роняет сохранение всей карточки. У детали, заведённой из DXF,
              реальное направление задаёт линия долевой в самом файле — по ней раскладка
              разворачивает деталь, а слово здесь только печатается в тех-пак и не должно ему
              противоречить.
            </Text>
            {/* Почему у колонки вообще есть состояние «не размечено» и почему оно не «одинаковые».
                Сказано один раз под таблицей, а не в подсказке каждой строки. */}
            <Text size='micro' variant='label'>
              как кроится — количество этим НЕ меняется: «×2» и так означает две панели на изделие,
              колонка лишь говорит, копии это или левая с правой. «Не размечено» — не то же самое,
              что «одинаковые»: это значит, что вопрос никто не задавал, и такой ответ сохраняется
              как есть, не подменяясь умолчанием. Зеркальная пара делится пополам, поэтому её
              количество обязано быть чётным; крой по сгибу парным не бывает по построению (контур
              симметричен сам себе), а «со сгибом и нужна дважды» — это манжеты: со сгибом × 2.
            </Text>
          </div>
        </div>
      )}
    </Section>
  );
}
