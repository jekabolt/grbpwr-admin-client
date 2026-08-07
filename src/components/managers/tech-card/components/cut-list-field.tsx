import { common_TechCardColorwayUsage } from 'api/proto-http/admin';
import { useMaterials } from 'components/managers/materials/components/useMaterials';
import { wireInt } from 'components/managers/tech-card/components/schema';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { CalloutBox } from 'ui/components/callout-box';
import { DataTable, EmptyCell, TotalRow } from 'ui/components/data-table';
import { Pill } from 'ui/components/pill';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import { cutSymmetryBadge, cutSymmetryUnanswered } from './piece-codes';
import { TechCardFormData } from './schema';
import { useStyleCutList } from './useStyleReadViews';

// Q6: read-only production cut-list — one row per cut-piece (деталь кроя) with its
// total_per_garment and, per colourway, which fabric (and optional fusing) BOM line it's cut from.
// NOT costing-gated — this is pattern/production data, not money.
//
// The mirror flag is GONE (it expanded a piece ×2 as a left+right pair and was never used):
// total_per_garment is now simply pieces_per_garment. GetStyleCutList stopped doubling in the same
// change, so this table and the editor cannot disagree.
//
// 0275 вернула КЛАССИФИКАЦИЮ, но не множитель: колонка «как кроится» объясняет уже посчитанные
// числа и ни одного из них не меняет — total_per_garment по-прежнему равен pieces_per_garment.
// Именно поэтому её можно было добавить, не трогая ни одну сумму на этом экране.
//
// #42: this table is a CALCULATED projection, not an editable list — there is nothing to "add"
// here. It is derived (GetStyleCutList) from the cut-pieces × each colourway's fabric mapping.
// This view just reflects the result.
//
// It renders on the PATTERNS tab now, directly under the «детали кроя» block it projects, so the
// copy below points at that block rather than at a tab the reader is already on.
const INTRO =
  'Calculated, not editable: pieces × each colourway’s fabric mapping. Add / edit the pieces in the «детали кроя» block above — this table just shows the result. Столбец «ткань по колорвеям» пока НЕ заполняется: редактора карты тканей в админке нет, и рецепт колорвея пишет другую таблицу — так что пустая ячейка тут означает «негде задать», а не «забыли».';

const SHELL_SECTIONS = new Set([
  'TECH_CARD_BOM_SECTION_FABRIC',
  'TECH_CARD_BOM_SECTION_LINING',
  'TECH_CARD_BOM_SECTION_INSULATION',
]);
const INTERLINING_SECTION = 'TECH_CARD_BOM_SECTION_INTERLINING';

type BomLine = { lineKey?: string; section?: string; unit?: string; wastagePercent?: string };

const group = (n: number) => Math.round(n).toLocaleString('en-US').replace(/,/g, ' ');
const round1 = (n: number) => String(Number(n.toFixed(1)));

// Σ over the size run of consumption × order qty. A usage with per-size norms folds against the run
// size by size (different sizes eat different amounts of fabric); one with a single per-garment
// figure multiplies by the whole run. Returns 0 when the run is unknown — the caller renders «—»
// rather than a zero that reads as "no fabric needed".
function usageUnits(
  usage: common_TechCardColorwayUsage,
  orderQtyBySize: Map<number, number>,
  garments: number,
): number {
  const perSize = usage.sizeConsumptions ?? [];
  if (perSize.length > 0) {
    let units = 0;
    for (const s of perSize) {
      const c = Number(s.consumption?.value ?? '');
      if (!Number.isFinite(c)) continue;
      units += c * (orderQtyBySize.get(s.sizeId ?? 0) ?? 0);
    }
    return units;
  }
  const c = Number(usage.consumption?.value ?? '');
  return Number.isFinite(c) ? c * garments : 0;
}

export function CutListField({ techCardId }: { techCardId?: number }) {
  const { data, isLoading, isError } = useStyleCutList(techCardId, true);
  // Same cached read the whole tech-card page already holds — the colourway recipes (usages) carry
  // the per-garment consumption the fabric projection needs, and they are colourway-owned, so they
  // are not in the RHF form.
  const { data: techCard } = useTechCard(techCardId);
  // Slots: the fabric column names the ARTICLE a colourway actually cuts — its pin
  // (usage.material_id) first, else the slot's default article — not the slot's role name,
  // which is identical across colourways and would erase exactly the difference the cutter
  // needs. Archived included: a pinned article that was later archived must still name itself.
  const { data: materialsData } = useMaterials('', true);
  const materialNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const mat of materialsData?.materials ?? []) {
      const id = wireInt(mat.id);
      if (id) m.set(id, mat.name ?? '');
    }
    return m;
  }, [materialsData]);
  const { control } = useFormContext<TechCardFormData>();
  const sizeQuantities = (useWatch({ control, name: 'sizeQuantities' }) ?? []) as Array<{
    sizeId?: number;
    orderQty?: number;
  }>;
  const bomItems = (useWatch({ control, name: 'bomItems' }) ?? []) as BomLine[];

  const pieces = useMemo(() => data?.pieces ?? [], [data?.pieces]);

  const totals = useMemo(() => {
    const orderQtyBySize = new Map<number, number>();
    let garments = 0;
    for (const q of sizeQuantities) {
      const n = q.orderQty ?? 0;
      if (q.sizeId) orderQtyBySize.set(q.sizeId, n);
      garments += n;
    }

    const perGarment = pieces.reduce((s, p) => s + (p.totalPerGarment ?? 0), 0);
    const fusedPerGarment = pieces.reduce((s, p) => s + (p.fused ? p.totalPerGarment ?? 0 : 0), 0);
    // Сколько строк уйдёт в цех с оговоркой «парность не указана» — то же условие, по которому
    // печатает тех-пак. Число, а не молчание: это таблица, по которой кроят.
    const unmarkedPairing = pieces.filter((p) =>
      cutSymmetryUnanswered(p.cutSymmetry, p.piecesPerGarment),
    ).length;

    // Fabric is projected off the PRIMARY colourway's recipe: the size run is style-level, so
    // multiplying every colourway's recipe by it would count the same garments once per colour.
    const bomByKey = new Map<string, BomLine>();
    for (const b of bomItems) if (b.lineKey) bomByKey.set(b.lineKey, b);
    const usages = techCard?.colorways?.[0]?.usages ?? [];

    let shell = 0;
    let shellWithWastage = 0;
    let interlining = 0;
    const shellUnits = new Set<string>();
    const interliningUnits = new Set<string>();
    for (const u of usages) {
      const bom = u.bomLineKey ? bomByKey.get(u.bomLineKey) : undefined;
      if (!bom?.section) continue;
      const isShell = SHELL_SECTIONS.has(bom.section);
      const isInterlining = bom.section === INTERLINING_SECTION;
      if (!isShell && !isInterlining) continue;
      const units = usageUnits(u, orderQtyBySize, garments);
      if (!Number.isFinite(units) || units <= 0) continue;
      const wastage = Number(bom.wastagePercent ?? '') || 0;
      if (isShell) {
        shell += units;
        shellWithWastage += units * (1 + wastage / 100);
        if (bom.unit?.trim()) shellUnits.add(bom.unit.trim());
      } else {
        interlining += units * (1 + wastage / 100);
        if (bom.unit?.trim()) interliningUnits.add(bom.unit.trim());
      }
    }

    return {
      garments,
      perGarment,
      fusedPerGarment,
      unmarkedPairing,
      piecesToCut: garments > 0 ? perGarment * garments : null,
      fusedTotal: garments > 0 ? fusedPerGarment * garments : null,
      shell: shell > 0 ? shell : null,
      shellWithWastage,
      shellUnit: shellUnits.size === 1 ? [...shellUnits][0] : '',
      interlining: interlining > 0 ? interlining : null,
      interliningUnit: interliningUnits.size === 1 ? [...interliningUnits][0] : '',
    };
  }, [pieces, sizeQuantities, bomItems, techCard?.colorways]);

  if (isLoading) {
    return (
      <Text size='micro' variant='label'>
        loading…
      </Text>
    );
  }
  if (isError) {
    return (
      <Text size='micro' variant='label'>
        cut list unavailable
      </Text>
    );
  }
  if (pieces.length === 0) {
    return (
      <CalloutBox tone='note'>
        <Text size='micro'>
          {INTRO} No cut pieces yet — add one in the «детали кроя» block above and it will appear
          here.
        </Text>
      </CalloutBox>
    );
  }

  const shellWastagePct =
    totals.shell && totals.shellWithWastage > totals.shell
      ? Math.round(((totals.shellWithWastage - totals.shell) / totals.shell) * 100)
      : 0;

  return (
    <div className='flex flex-col gap-2.5'>
      <StatGrid min={130}>
        <Stat
          label='garments'
          value={totals.garments > 0 ? group(totals.garments) : <EmptyCell />}
          sub={totals.garments > 0 ? `${sizeQuantities.length} sizes` : 'size run not set'}
        />
        <Stat
          label='pieces to cut'
          value={totals.piecesToCut != null ? group(totals.piecesToCut) : <EmptyCell />}
          sub={`${pieces.length} patterns · ${group(totals.perGarment)} / garment`}
        />
        <Stat
          label='shell needed'
          value={
            totals.shell != null ? (
              `${round1(totals.shell)}${totals.shellUnit ? ` ${totals.shellUnit}` : ''}`
            ) : (
              <EmptyCell />
            )
          }
          sub={
            totals.shell != null && shellWastagePct > 0
              ? `+${shellWastagePct}% wastage = ${round1(totals.shellWithWastage)}`
              : 'from the primary colourway recipe'
          }
        />
        <Stat
          label='fused pieces'
          value={totals.fusedTotal != null ? group(totals.fusedTotal) : <EmptyCell />}
          sub={
            totals.interlining != null
              ? `interlining ${round1(totals.interlining)}${
                  totals.interliningUnit ? ` ${totals.interliningUnit}` : ''
                }`
              : `${group(totals.fusedPerGarment)} / garment`
          }
        />
      </StatGrid>

      {totals.garments === 0 && (
        <CalloutBox tone='warning'>
          <Text size='micro'>
            заполните тираж по размерам (блок «size range» вверху этой вкладки) — без него проекция
            кроя не считается, поэтому счётчики показывают «—», а не ноль.
          </Text>
        </CalloutBox>
      )}

      <CalloutBox tone='note'>
        <Text size='micro'>{INTRO}</Text>
      </CalloutBox>

      <DataTable className='[&_td]:text-micro'>
        <thead>
          <tr>
            <th>piece</th>
            <th>grainline</th>
            <th>fused</th>
            <th>pieces / garment</th>
            {/* Между количеством и total, потому что это пояснение к ним обоим: числа одинаковые
                (0275 ничего не умножает), и колонка говорит, ЧТО это за штуки. */}
            <th>как кроится</th>
            <th>total / garment</th>
            <th>fabric (by colourway)</th>
          </tr>
        </thead>
        <tbody>
          {pieces.map((p, i) => {
            const fabrics = p.fabrics ?? [];
            // Read-only на этом RPC (поле 9 в StyleCutListPiece): раскроечный цех работает по этой
            // таблице, а редактируется разметка в блоке «детали кроя» выше.
            const symmetry = cutSymmetryBadge(p.cutSymmetry, p.piecesPerGarment);
            return (
              <tr key={p.pieceId || i}>
                <td>{p.name || `#${p.pieceId}`}</td>
                <td>{p.grainline || <EmptyCell />}</td>
                <td>{p.fused ? <Pill tone='mut'>fused</Pill> : <EmptyCell />}</td>
                <td>{p.piecesPerGarment ?? 0}</td>
                <td>
                  {symmetry ? (
                    <Pill
                      tone={symmetry.tone}
                      title={
                        symmetry.tone === 'attention'
                          ? 'деталь идёт по две и больше на изделие, а как они кроятся — не сказано. Ответьте в блоке «детали кроя» выше: пока ответа нет, тех-пак печатает эту же оговорку фабрике.'
                          : undefined
                      }
                    >
                      {symmetry.label}
                    </Pill>
                  ) : (
                    <EmptyCell />
                  )}
                </td>
                <td>{p.totalPerGarment ?? 0}</td>
                <td>
                  {fabrics.length === 0 ? (
                    <EmptyCell />
                  ) : (
                    <div className='flex flex-col gap-0.5'>
                      {fabrics.map((f, fi) => {
                        const cw = techCard?.colorways?.find(
                          (c) => wireInt(c.colorwayId) === wireInt(f.colorwayId),
                        );
                        const usages = cw?.usages ?? [];
                        const usage =
                          usages.find(
                            (u) =>
                              wireInt(u.bomItemId) === wireInt(f.bomItemId) &&
                              wireInt(u.pieceId) === wireInt(p.pieceId),
                          ) ??
                          usages.find(
                            (u) =>
                              wireInt(u.bomItemId) === wireInt(f.bomItemId) && !wireInt(u.pieceId),
                          );
                        const pin = wireInt(usage?.materialId);
                        const bom = techCard?.techCard?.bomItems?.find(
                          (b) => wireInt(b.id) === wireInt(f.bomItemId),
                        );
                        const article =
                          (pin ? materialNameById.get(pin) : undefined) ??
                          (wireInt(bom?.materialId)
                            ? materialNameById.get(wireInt(bom?.materialId))
                            : undefined);
                        return (
                          <Text key={fi} size='micro' variant='label' component='span'>
                            colourway #{f.colorwayId}:{' '}
                            {article || f.fabricName || `#${f.bomItemId}`}
                            {f.fusingName ? ` · fusing: ${f.fusingName}` : ''}
                          </Text>
                        );
                      })}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
          <TotalRow>
            <td colSpan={5}>
              {pieces.length} pieces
              {totals.garments > 0 ? ` · ${group(totals.garments)} garments` : ''}
              {totals.unmarkedPairing > 0 ? ` · ${totals.unmarkedPairing} без разметки кроя` : ''}
            </td>
            <td>{group(totals.perGarment)}</td>
            <td>
              {totals.piecesToCut != null ? `${group(totals.piecesToCut)} to cut` : <EmptyCell />}
            </td>
          </TotalRow>
        </tbody>
      </DataTable>
    </div>
  );
}
