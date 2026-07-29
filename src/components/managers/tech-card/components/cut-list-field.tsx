import { common_TechCardColorwayUsage } from 'api/proto-http/admin';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { CalloutBox } from 'ui/components/callout-box';
import { DataTable, EmptyCell, TotalRow } from 'ui/components/data-table';
import { Pill } from 'ui/components/pill';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import { TechCardFormData } from './schema';
import { useStyleCutList } from './useStyleReadViews';

// Q6: read-only production cut-list — one row per cut-piece (деталь кроя), expanded with
// total_per_garment already folding the mirrored pair (pieces_per_garment × 2) and, per
// colourway, which fabric (and optional fusing) BOM line it's cut from. NOT costing-gated —
// this is pattern/production data, not money.
// #42: this table is a CALCULATED projection, not an editable list — there is nothing to "add"
// here. It is derived (GetStyleCutList) from the cut-pieces on the pieces tab × their mirror flag ×
// each colourway's fabric mapping. To change a row: edit the piece (pieces tab above) or its
// per-colourway fabric/fusing mapping (colorways tab) — this view just reflects the result.
const INTRO =
  'Calculated, not editable: pieces × mirror × each colourway’s fabric mapping. Add / edit pieces on the pieces tab above and their fabric per colourway on the colorways tab — this table just shows the result.';

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
          {INTRO} No cut pieces yet — add one on the pieces tab above and it will appear here.
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
            заполните тираж по размерам (patterns → size run) — без него проекция кроя не считается,
            поэтому счётчики показывают «—», а не ноль.
          </Text>
        </CalloutBox>
      )}

      <CalloutBox tone='note'>
        <Text size='micro'>{INTRO}</Text>
      </CalloutBox>

      <DataTable>
        <thead>
          <tr>
            <th>piece</th>
            <th>grainline</th>
            <th>fused</th>
            <th>pieces / garment</th>
            <th>mirrored</th>
            <th>total / garment</th>
            <th>fabric (by colourway)</th>
          </tr>
        </thead>
        <tbody>
          {pieces.map((p, i) => {
            const fabrics = p.fabrics ?? [];
            return (
              <tr key={p.pieceId || i}>
                <td>{p.name || `#${p.pieceId}`}</td>
                <td>{p.grainline || <EmptyCell />}</td>
                <td>{p.fused ? <Pill tone='mut'>fused</Pill> : <EmptyCell />}</td>
                <td>{p.piecesPerGarment ?? 0}</td>
                <td>{p.mirrored ? '×2 pair' : <EmptyCell />}</td>
                <td>{p.totalPerGarment ?? 0}</td>
                <td>
                  {fabrics.length === 0 ? (
                    <EmptyCell />
                  ) : (
                    <div className='flex flex-col gap-0.5'>
                      {fabrics.map((f, fi) => (
                        <Text key={fi} size='micro' variant='label' component='span'>
                          colourway #{f.colorwayId}: {f.fabricName || `#${f.bomItemId}`}
                          {f.fusingName ? ` · fusing: ${f.fusingName}` : ''}
                        </Text>
                      ))}
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
