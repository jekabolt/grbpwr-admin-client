import type {
  GetMetricsResponse,
  InventoryHealthRow,
  InventoryValuation,
  MarginByStyleRow,
  SizeRunEfficiencyRow,
} from 'api/proto-http/admin';
import { parseDecimal } from './utils';

/**
 * Decision-oriented derivations for the Products tab. Pure functions over the raw
 * GetMetricsResponse — they turn the eleven inventory/margin tables into the three
 * questions an operator actually acts on: reorder what, clear what, where is the money.
 * Days-of-cover is deliberately never surfaced here as a raw number (it explodes at
 * boutique sales volume); we bucket it instead.
 */

export type ActionItem = {
  key: string;
  productId?: number | string;
  name: string;
  signal: string;
};

// Sell-through bands (whole-drop / whole-run, so decision-grade even at low daily volume).
const STRONG_DROP = 75; // reprint
const WEAK_DROP = 40; // cut / discount
const UNDER_BOUGHT = 80; // size run: sold out early => lost sales
const OVER_BOUGHT = 40; // size run: dead weight

export type InventoryBucket = 'reorder' | 'healthy' | 'overstocked' | 'dead' | 'nosales';

export const BUCKET_LABEL: Record<InventoryBucket, string> = {
  reorder: 'Reorder',
  healthy: 'Healthy',
  overstocked: 'Overstocked',
  dead: 'Dead',
  nosales: 'No sales',
};

/** Coarse health bucket — never the raw exploding day count. */
export function inventoryBucket(r: InventoryHealthRow): InventoryBucket {
  if (r.hasTarget && r.needsReorder) return 'reorder';
  if (!r.isSelling) return (r.quantity ?? 0) > 0 ? 'nosales' : 'healthy';
  const d = r.daysOnHand ?? 0;
  if (d > 180) return 'overstocked';
  return 'healthy';
}

function pushCapped(items: ActionItem[], item: ActionItem) {
  items.push(item);
}

/**
 * REORDER — what to restock. Different sources carry incomparable units (€ lost vs
 * head-count vs sell-through %), so we don't cross-rank them; we concatenate by
 * business priority (lost money first) and cap. `total` is the pre-cap count.
 */
export function buildReorderSignals(
  resp: GetMetricsResponse,
  cap = 8,
): { items: ActionItem[]; total: number } {
  const items: ActionItem[] = [];

  // 1. Out-of-stock lost revenue (aggregate by product).
  const oos = new Map<string, { name: string; lost: number }>();
  for (const o of resp.oosImpact ?? []) {
    const id = o.productId ?? '';
    const cur = oos.get(id) ?? { name: o.productName ?? `#${id}`, lost: 0 };
    cur.lost += parseDecimal(o.estimatedLostRevenue);
    oos.set(id, cur);
  }
  [...oos.entries()]
    .filter(([, v]) => v.lost > 0)
    .sort((a, b) => b[1].lost - a[1].lost)
    .forEach(([id, v]) =>
      pushCapped(items, {
        key: `oos-${id}`,
        productId: id,
        name: v.name,
        signal: `€${Math.round(v.lost)} lost to out-of-stock`,
      }),
    );

  // 2. Below the operator-set reorder point.
  (resp.inventoryHealth ?? [])
    .filter((r) => r.hasTarget && r.needsReorder)
    .sort((a, b) => (a.daysOnHand ?? 0) - (b.daysOnHand ?? 0))
    .forEach((r) => {
      const size = r.sizeName ? ` (${r.sizeName})` : '';
      const need = Math.max(0, (r.reorderPoint ?? 0) - (r.quantity ?? 0));
      pushCapped(items, {
        key: `ro-${r.productId}-${r.sizeId}`,
        productId: r.productId,
        name: `${r.productName ?? `#${r.productId}`}${size}`,
        signal: need > 0 ? `below reorder point · buy ~${need}` : 'below reorder point',
      });
    });

  // 3. Restock demand (notify-me signups, aggregate by product).
  const notify = new Map<string, { name: string; count: number }>();
  for (const n of resp.notifyMeIntent ?? []) {
    const id = n.productId ?? '';
    const cur = notify.get(id) ?? { name: n.productName ?? `#${id}`, count: 0 };
    cur.count += n.count ?? 0;
    notify.set(id, cur);
  }
  [...notify.entries()]
    .filter(([, v]) => v.count > 0)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([id, v]) =>
      pushCapped(items, {
        key: `nm-${id}`,
        productId: id,
        name: v.name,
        signal: `${v.count} waiting for restock`,
      }),
    );

  // 4. Sizes that sold out early (under-bought => lost sales).
  (resp.sizeRunEfficiency ?? [])
    .filter((r) => (r.sellThroughPct ?? 0) >= UNDER_BOUGHT && (r.unitsBought ?? 0) > 0)
    .sort((a, b) => (b.sellThroughPct ?? 0) - (a.sellThroughPct ?? 0))
    .forEach((r) =>
      pushCapped(items, {
        key: `srb-${r.productId}`,
        productId: r.productId,
        name: r.productName ?? `#${r.productId}`,
        signal: `sold ${r.unitsSold}/${r.unitsBought} — under-bought`,
      }),
    );

  // 5. Reprintable drops.
  (resp.sellThroughByDrop ?? [])
    .filter((r) => (r.sellThroughPct ?? 0) >= STRONG_DROP)
    .sort((a, b) => (b.sellThroughPct ?? 0) - (a.sellThroughPct ?? 0))
    .forEach((r) =>
      pushCapped(items, {
        key: `drop-${r.collection}`,
        name: r.collection || 'Untagged drop',
        signal: `drop cleared ${(r.sellThroughPct ?? 0).toFixed(0)}% — reprint`,
      }),
    );

  return { items: items.slice(0, cap), total: items.length };
}

/**
 * CLEAR / CUT — where cash is dying. Priority: €frozen (dead stock) first, then slow
 * movers, over-bought sizes, weak drops.
 */
export function buildClearSignals(
  resp: GetMetricsResponse,
  cap = 8,
): { items: ActionItem[]; total: number } {
  const items: ActionItem[] = [];

  // 1. Dead stock — carries €frozen.
  (resp.deadStock ?? [])
    .map((r) => ({ r, frozen: parseDecimal(r.stockValue) }))
    .sort((a, b) => b.frozen - a.frozen)
    .forEach(({ r, frozen }) => {
      const size = r.sizeName ? ` (${r.sizeName})` : '';
      pushCapped(items, {
        key: `dead-${r.productId}-${r.sizeId}`,
        productId: r.productId,
        name: `${r.productName ?? `#${r.productId}`}${size}`,
        signal: `€${Math.round(frozen)} frozen · ${r.daysWithoutSale ?? 0}d no sale — pull / mark down`,
      });
    });

  // 2. Slow movers.
  (resp.slowMovers ?? [])
    .filter((r) => r.productHidden !== true)
    .sort((a, b) => (b.daysInStock ?? 0) - (a.daysInStock ?? 0))
    .forEach((r) =>
      pushCapped(items, {
        key: `slow-${r.productId}`,
        productId: r.productId,
        name: r.productName ?? `#${r.productId}`,
        signal: `${r.unitsSold ?? 0} sold in ${r.daysInStock ?? 0}d — mark down`,
      }),
    );

  // 3. Over-bought sizes.
  (resp.sizeRunEfficiency ?? [])
    .filter((r) => (r.sellThroughPct ?? 0) <= OVER_BOUGHT && (r.unitsBought ?? 0) > 0)
    .sort((a, b) => (a.sellThroughPct ?? 0) - (b.sellThroughPct ?? 0))
    .forEach((r) =>
      pushCapped(items, {
        key: `sob-${r.productId}`,
        productId: r.productId,
        name: r.productName ?? `#${r.productId}`,
        signal: `sold ${r.unitsSold}/${r.unitsBought} — over-bought`,
      }),
    );

  // 4. Weak drops.
  (resp.sellThroughByDrop ?? [])
    .filter((r) => (r.sellThroughPct ?? 0) < WEAK_DROP && (r.unitsBought ?? 0) > 0)
    .sort((a, b) => (a.sellThroughPct ?? 0) - (b.sellThroughPct ?? 0))
    .forEach((r) =>
      pushCapped(items, {
        key: `wdrop-${r.collection}`,
        name: r.collection || 'Untagged drop',
        signal: `drop cleared only ${(r.sellThroughPct ?? 0).toFixed(0)}% — discount / cut`,
      }),
    );

  return { items: items.slice(0, cap), total: items.length };
}

/** Size-run verdict: which styles were under- vs over-bought. */
export function sizeVerdict(rows: SizeRunEfficiencyRow[] | undefined) {
  const list = (rows ?? []).filter((r) => (r.unitsBought ?? 0) > 0);
  const under = list
    .filter((r) => (r.sellThroughPct ?? 0) >= UNDER_BOUGHT)
    .sort((a, b) => (b.sellThroughPct ?? 0) - (a.sellThroughPct ?? 0))
    .slice(0, 6);
  const over = list
    .filter((r) => (r.sellThroughPct ?? 0) <= OVER_BOUGHT)
    .sort((a, b) => (a.sellThroughPct ?? 0) - (b.sellThroughPct ?? 0))
    .slice(0, 6);
  return { under, over };
}

/** Inventory valuation as a money summary (coverage + concentration), not a table. */
export function valuationSummary(v: InventoryValuation | undefined) {
  if (!v) return null;
  const total = parseDecimal(v.totalStockValue);
  if (total <= 0 && (v.totalOnHandUnits ?? 0) <= 0) return null;
  const top = v.topByValue ?? [];
  const top3 = top.slice(0, 3).reduce((s, r) => s + parseDecimal(r.value), 0);
  const dead = (v.deadStock ?? []).reduce((s, r) => s + parseDecimal(r.value), 0);
  return {
    total,
    coveragePct: v.coveragePct ?? 0,
    uncostedProducts: v.uncostedStockProducts ?? 0,
    costedUnits: v.costedOnHandUnits ?? 0,
    totalUnits: v.totalOnHandUnits ?? 0,
    top3Share: total > 0 ? (top3 / total) * 100 : 0,
    top3Names: top.slice(0, 3).map((r) => r.productName ?? `#${r.productId}`),
    deadValue: dead,
  };
}

/** Highest- and lowest-margin styles (costed only), for the "where's the money" read. */
export function marginExtremes(rows: MarginByStyleRow[] | undefined) {
  const costed = (rows ?? []).filter((r) => r.hasCost);
  const byMargin = [...costed].sort(
    (a, b) => parseDecimal(b.grossMargin) - parseDecimal(a.grossMargin),
  );
  const top = byMargin.slice(0, 5);
  const bottom = byMargin
    .slice(-5)
    .reverse()
    .filter((r) => !top.includes(r));
  return { top, bottom, anyCosted: costed.length > 0 };
}
