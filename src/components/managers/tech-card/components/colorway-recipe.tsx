import { common_Material, common_TechCard } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import {
  FIBRE_NAME_BY_CODE,
  parseCompositionCode,
} from 'components/managers/materials/components/material-code';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { SECTION } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { carriesGarmentComposition } from 'utils/care-label';
import { type UsageDraft } from './colorway-usage-wire';
import { ColourwaysMatrix } from './colourways-matrix';
import { pictureUrl } from './design/bench-slot';
import { benchSides } from './design/render/model';
import { useDesignBand } from './design/use-design-band';
import { markerColorways } from './nesting/colorway-widths';
import { useFormPieces } from './piece-picker';
import { TechCardFormData, wireInt } from './schema';
import {
  articleForUsage,
  effectiveMaterial,
  effectiveMaterialId,
  type BomLine,
  type RecipePiece,
} from './use-colourway-auto';

// ⚠ СБРОС ПРИ СМЕНЕ КАРТОЧКИ ИДЁТ ЭТОЙ КОНСТАНТОЙ, а не свежим литералом: сброс живёт в теле
// рендера, а `setState` с НОВЫМ пустым объектом каждый раз считается изменением и запускает рендер
// заново — на карточке без колорвеев это бесконечный цикл, а не «лишний кадр».
const EMPTY_DELETED: ReadonlySet<number> = new Set();

// #29 — best-effort DERIVED fibre composition for a colourway, computed from its recipe's BOM lines.
// A line's `composition` is the structured { part: [{ code, percent }] } JSON on every catalog-linked
// or picker-authored line, and free text only on genuinely legacy rows — parseCompositionCode reads
// both. Each line's fibres are weighted by that usage's per-garment consumption (fallback: equal
// weight), then normalised to 100%. Approximate by construction.
// Thread usages are left out entirely (D-44 / D-50, `carriesGarmentComposition`): thread carries no
// composition of the garment, so it neither weighs into the bar nor counts as «excluded».
export function deriveComposition(
  usages: UsageDraft[],
  bomItems: BomLine[],
  materials: common_Material[],
): { fibers: { name: string; percent: number }[]; skipped: number } {
  const totals = new Map<string, number>();
  let skipped = 0;
  for (const u of usages) {
    if (!u.bomLineKey) continue;
    const slot = bomItems.find((b) => b.lineKey === u.bomLineKey);
    if (slot && !carriesGarmentComposition(slot)) continue;
    const line = articleForUsage(
      slot,
      effectiveMaterial(u, slot, materials),
      effectiveMaterialId(u, slot),
    );
    const weight = Number(u.consumption) > 0 ? Number(u.consumption) : 1;
    const shares = parseCompositionCode(line?.composition);
    if (shares.length === 0) {
      skipped += 1;
      continue;
    }
    for (const s of shares) {
      const name = (FIBRE_NAME_BY_CODE[s.code] ?? s.code).trim().toLowerCase();
      if (!name || !Number.isFinite(s.percent) || s.percent <= 0) continue;
      totals.set(name, (totals.get(name) ?? 0) + (s.percent / 100) * weight);
    }
  }
  const sum = [...totals.values()].reduce((a, b) => a + b, 0);
  if (sum <= 0) return { fibers: [], skipped };
  const fibers = [...totals.entries()]
    .map(([name, v]) => ({ name, percent: Math.round((v / sum) * 1000) / 10 }))
    .sort((a, b) => b.percent - a.percent);
  return { fibers, skipped };
}

// Colourway recipes (H1/§2.3): which material each BOM slot takes in each colourway, and how much.
// Edited per colourway and written by UpdateColorwayRecipe (full-replace), staged into the card's
// one save rather than fired from here (19). The screen itself is ColourwaysMatrix (COLOURWAYS-LITE);
// this shell gathers what every column shares: the catalog, the live BOM and pieces, markers, pins.
export function ColorwayRecipes({
  techCard,
  techCardId,
  canEdit,
}: {
  techCard?: common_TechCard;
  techCardId: number;
  canEdit: boolean;
}) {
  const { dictionary } = useDictionary();
  const { canWrite } = usePermissions();
  // УДАЛЕНИЕ КОЛОРВЕЯ ГЕЙТИТСЯ ПРАВОМ НА ПРОДУКТЫ, А НЕ `canEdit`. Это то же право, которым
  // LifecycleControls открывает архивирование: удаление и архивирование — два исхода одного решения
  // о судьбе ПРОДУКТА. `canEdit` тут не годится ещё и потому, что в нём сидит `!frozen`.
  const canDeleteProduct = canWrite(SECTION.products);
  // ВЫПУЩЕНА ЛИ КАРТОЧКА — читается ЗДЕСЬ, а не выводится из `canEdit`: отказ сервера в карточной
  // раскладке относится РОВНО к релизу. Тот же предикат, что в шапке вкладки (index.tsx).
  const frozen = techCard?.techCard?.approvalState === 'TECH_CARD_APPROVAL_STATE_RELEASED';
  // УДАЛЁННЫЕ ПРЯЧЕМ СРАЗУ, не дожидаясь рефетча карточки. Фильтр монотонный (id, однажды удалённый,
  // не вернётся), поэтому после рефетча он превращается в no-op. Архивные — отработанные продукты,
  // колонок у них нет (тот же предикат, что у живых колорвеев в index.tsx).
  const [deletedIds, setDeletedIds] = useState<ReadonlySet<number>>(() => new Set());
  const colorways = useMemo(
    () =>
      (techCard?.colorways ?? []).filter(
        (c) =>
          !deletedIds.has(c.colorwayId ?? 0) && c.status !== 'COLORWAY_LIFECYCLE_STATUS_ARCHIVED',
      ),
    [techCard?.colorways, deletedIds],
  );
  // The card's cut pieces, LIVE from form state — the same source every other piece picker reads.
  // The server id — needed only to resolve legacy usages that carry piece_id instead of
  // piece_line_key — still comes off the read, merged by lineKey; a piece not yet saved has none.
  const formPieces = useFormPieces();
  const serverPieceIdByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of techCard?.techCard?.pieces ?? []) {
      const key = p.lineKey?.trim();
      if (key) m.set(key, wireInt((p as unknown as { id?: unknown }).id));
    }
    return m;
  }, [techCard?.techCard?.pieces]);
  const pieces = useMemo<RecipePiece[]>(
    () => formPieces.map((p) => ({ ...p, id: serverPieceIdByKey.get(p.lineKey) ?? 0 })),
    [formPieces, serverPieceIdByKey],
  );
  // The whole catalog, loaded once for the tab: tiles (photo, colour), the AUTO planner (siblings of
  // the BOM article) and pins. includeArchived so a line linked to an archived material resolves;
  // the planner itself skips archived articles.
  const { data: materialsData } = useMaterials('', true);
  const materials = useMemo(() => materialsData?.materials ?? [], [materialsData?.materials]);
  const materialById = useMemo(() => {
    const m = new Map<number, common_Material>();
    for (const mat of materials) if (wireInt(mat.id)) m.set(wireInt(mat.id), mat);
    return m;
  }, [materials]);
  // ПИНЫ КОЛОРВЕЕВ С ИХ ШИРИНАМИ — ТЕМ ЖЕ ВЫРАЖЕНИЕМ, ЧТО У ОЧЕРЕДИ РАСКРОЯ (`markerColorways`):
  // СОХРАНЁННЫЙ рецепт, а не черновик — сравнение «ширина, которой будем мерить» против «ширина,
  // которую показывает строка» единственное, чем раскладка комплекта ловит несохранённую смену
  // артикула.
  const colorwayPins = useMemo(
    () => markerColorways(techCard, materialById),
    [techCard, materialById],
  );
  // The card's BOM slots, LIVE from form state: a slot added on the BOM tab a moment ago is a row
  // here immediately. COMMIT_ORDER puts the card body (which creates the line, keyed by that same
  // lineKey) ahead of every recipe write. The server `id` still comes off the read, merged by
  // lineKey: it resolves a LEGACY usage that carries bom_item_id instead of bom_line_key.
  const formBom = (useWatch<TechCardFormData>({ name: 'bomItems' }) ??
    []) as TechCardFormData['bomItems'];
  const serverBomIdByKey = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of techCard?.techCard?.bomItems ?? []) {
      const key = b.lineKey?.trim();
      if (key) m.set(key, wireInt(b.id));
    }
    return m;
  }, [techCard?.techCard?.bomItems]);
  const bomItems = useMemo<BomLine[]>(
    () =>
      (formBom ?? [])
        .filter((b) => !!b.lineKey?.trim())
        .map((b) => {
          const materialId = wireInt(b.materialId);
          const lineKey = b.lineKey as string;
          return {
            id: serverBomIdByKey.get(lineKey) ?? 0,
            lineKey,
            name: b.name,
            section: b.section,
            purpose: b.purpose,
            unit: b.unit,
            unitPrice: b.unitPrice,
            currency: b.currency,
            wastagePercent: b.wastagePercent,
            fabricWidth: b.fabricWidth,
            effectiveFabricWidthCm: b.effectiveFabricWidthCm,
            selvedgeCm: b.selvedgeCm,
            composition: b.composition,
            materialId,
            material: materialId > 0 ? materialById.get(materialId) : undefined,
          };
        }),
    [formBom, serverBomIdByKey, materialById],
  );
  const sizeIds = useMemo(
    () => (techCard?.techCard?.sizeIds ?? []) as number[],
    [techCard?.techCard?.sizeIds],
  );
  const sizeNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of dictionary?.sizes ?? []) if (s.id != null) m.set(s.id, s.name ?? `#${s.id}`);
    return m;
  }, [dictionary?.sizes]);
  // Each colourway's dictionary colour — the column swatch when there is no pantone hex.
  const hexByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of dictionary?.colors ?? []) if (c.code && c.hex) m.set(c.code, c.hex);
    return m;
  }, [dictionary?.colors]);
  const lockVersion = techCard?.lockVersion ?? 0;

  // ПОЛОСА ДИЗАЙНА ЧИТАЕТСЯ ЗДЕСЬ, ОДИН РАЗ НА ВСЮ ВКЛАДКУ: шапке колонки нужен передний рендер
  // колорвея (`kind: render` на его оси). Ключ запроса общий со студией, так что это второй
  // наблюдатель того же кэша, а не второй кэш.
  const { band } = useDesignBand(techCardId);
  const frontUrlById = useMemo(() => {
    const m = new Map<number, string>();
    for (const cw of colorways) {
      const id = cw.colorwayId ?? 0;
      // Ось 0 — это СЕМПЛ; колорвей карточки всегда имеет id > 0, так что это сторож.
      if (id <= 0) continue;
      const front = benchSides(band, 'render', id).find((s) => s.view === 'front')?.picture;
      const url = front ? pictureUrl(front) : '';
      if (url) m.set(id, url);
    }
    return m;
  }, [band, colorways]);

  // ?colorway=<id> НАЗЫВАЕТ КОЛОРВЕЙ, А ЧИТАЕТ ЕГО ТА ВКЛАДКА, КОТОРУЮ НАЗЫВАЕТ `?tab=`. Пишет его
  // вкладка BOM (её ячейки колорвеев открывают эту вкладку); колонка подсвечивается и прокручивается
  // в вид. Вкладки тех-карты смонтированы все сразу, поэтому без гейта по `?tab=` этот эффект съедал
  // бы параметр, адресованный студии.
  const [params, setParams] = useSearchParams();
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const clearHighlight = useCallback(() => setHighlightId(null), []);
  const deepLinked = params.get('colorway');
  const addressedTab = params.get('tab');
  useEffect(() => {
    if (!deepLinked || addressedTab !== 'colorways') return;
    const id = Number(deepLinked);
    if (Number.isFinite(id) && id > 0) setHighlightId(id);
    const next = new URLSearchParams(params);
    next.delete('colorway');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinked, addressedTab]);

  /* СМЕНА КАРТОЧКИ СБРАСЫВАЕТ ПОДСВЕТКУ И УДАЛЁННЫЕ — В ТЕЛЕ РЕНДЕРА, НЕ В ЭФФЕКТЕ (G2-10).
     Вкладка НЕ размонтируется между карточками: страница тех-карты одна, меняется параметр
     маршрута. Эффект отработал бы ПОСЛЕ первого кадра новой карточки, то есть ровно этот кадр
     рисовался бы чужим состоянием. */
  const openedCard = useRef(techCardId);
  if (openedCard.current !== techCardId) {
    openedCard.current = techCardId;
    setHighlightId(null);
    setDeletedIds(EMPTY_DELETED);
  }

  return (
    <ColourwaysMatrix
      techCardId={techCardId}
      techCard={techCard}
      colorways={colorways}
      bomItems={bomItems}
      materials={materials}
      markers={techCard?.markers}
      pieces={pieces}
      colorwayPins={colorwayPins}
      sizeIds={sizeIds}
      sizeNameById={sizeNameById}
      hexByCode={hexByCode}
      colours={dictionary?.colors}
      frontUrlById={frontUrlById}
      lockVersion={lockVersion}
      canEdit={canEdit}
      frozen={frozen}
      canDeleteProduct={canDeleteProduct}
      highlightId={highlightId}
      onHighlightDone={clearHighlight}
      onDeleted={(id) => setDeletedIds((prev) => new Set(prev).add(id))}
    />
  );
}
