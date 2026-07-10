---
title: Analytics — Backend Follow-ups (grbpwr-proto)
date: 2026-07-10
tags: [analytics, backend, grbpwr-proto, roadmap]
---

# Analytics backend follow-ups

Hand-off list from the decision-first dashboard rework (branch `analytics-decision-first`).
Each item is a concrete `grbpwr-proto` / gateway change. Ordered by value × effort.

## Already delivered in this proto bump (consumed by the frontend)

- `RefundReason` enum + `RefundOrderRequest.reasonCode` — wired in the refund modal.
- `InventoryHealthRow.{reorderPoint,targetDaysCover,leadTimeDays,needsReorder,hasTarget}`
  + `UpsertInventoryTargets` RPC — powers the **Reorder-now** list + target entry form.
- `CampaignAttributionRow.{spend,roas}` + `UpsertChannelSpend` RPC — powers ROAS + spend entry.
- `BusinessMetrics.contributionMargin` — shown in the Revenue P&L block.

## Still needed (prioritized)

| # | Ask | Value | Effort | Why |
|---|-----|-------|--------|-----|
| 1 | **Margin on `SlowMoverRow` + `RevenueParetoRow`** — add `unitCost/revenueCost/grossMargin/grossMarginPct/hasCost` (mirror `ProductMetric`). | High | S | The markdown/liquidate decision on Slow movers & Dead stock is margin-blind. Rows already carry `productId`; margin is already computed for `ProductMetric`. **This was thought delivered but is not** — only `ProductMetric` carries margin today. |
| 2 | **`paymentFees` on `BusinessMetrics`** (capture Stripe `balance_transaction.fee`), and redefine `contributionMargin = grossMargin − totalShippingCost − paymentFees`; make COGS net of promo/sale discount. | High | M | Processor fees + discount erosion are a silent 2–3pp leak. Contribution margin € should become the dashboard's headline number. |
| 3 | **Cost coverage activation** — `uncostedProductIds` (or a small "products missing cost" endpoint) on the margin block. | High | S | The whole margin suite is dark until costs are entered; show operators exactly which products to cost. |
| 4 | **Drop/release cohort** — tag orders+products with a release id; add `SellThroughByDropRow {dropId, dropName, releasedAt, unitsBought, unitsSold, sellThroughPct, daysTo50pct, revenue, grossMargin}` behind a new `METRICS_SECTION_DROP_SELL_THROUGH`. | High | M | The core KPI of a drop brand, currently absent. Turns tiny daily samples into decision-grade per-drop totals and makes compare honest (this drop vs last drop, not WoW across a drop boundary). Unlocks a real "Drop verdict" zone. |
| 5 | **`GetDashboard` decision RPC** — one opinionated DB-trusted payload (money + server-computed alerts + top movers by margin + reorder/clear lists + current-drop sell-through). Keep sectioned `GetMetrics` for drill-down. | Med | L | Enables collapsing the 4 tabs into one decision-first page without fetching the ~90-field `BusinessMetrics` god-object per tab. |
| 6 | **True size-run sell-through** — `SizeRunEfficiencyRow` currently uses "sold at least once". Add `unitsBought`/`unitsSold` so efficiency = sold ÷ bought. | Med | M | Frontend only has a coarse proxy; real overbuy detection needs buy quantities. |
| 7 | **Cross-sell lift** — add marginal frequencies (or a precomputed `lift`) to `crossSellPairs`. | Med | S | Raw co-occurrence is chance-dominated at low N; frontend floors at count≥3 but can't compute observed/expected. |
| 8 | **`sampleSize` on `MetricWithComparison`** — the n a rate/comparison is computed over. | Med | M | Lets the UI suppress or show ± bands instead of hardcoded floors. (`sampleSize` exists on `ClvDistribution` only today; `currentMetricValue()` already reads it defensively.) |
| 9 | **Fix `ordersByStatus`** — count each order's current/terminal status once, not transitions (its sum currently exceeds the order count). | Med | S | Removes the cancellation-denominator workaround; makes any status breakdown honest. |
| 10 | **Split `BusinessMetrics` god-object** into CommerceCore / Margin / Traffic(GA4) / Email sub-messages. | Med | L | Type-separates DB-trusted from GA4-estimated so a consumer can't accidentally headline a sampled number; stops every tab paying the full computation. |
| 11 | **Move alert thresholds server-side / into settings** (`executiveAlerts.ts`: `REVENUE_DROP_ALERT_PCT`, `CANCELLATION_SHARE_ALERT`, `MIN_ORDERS_FOR_ALERT`, `MIN_SESSIONS_FOR_ALERT`, …). | Low | M | Lets ops tune floors to their volume without a frontend deploy. |

## Explicitly NOT worth building

- Ad-spend/ROAS pipeline beyond the manual `UpsertChannelSpend` entry — **unless** paid ads become a real line item. For a mostly-organic hype brand, a full GA4-reconciled spend integration is effort disproportionate to a number nobody acts on.
- GA4 micro-funnel steps beyond the 3 that matter (device funnel, checkout timings, hero funnel, abandoned-cart minutes, payment recovery).
- BQ micro-interaction event streams (zoom, swipes, time-on-page, details-expansion, size-guide-clicks, session duration) — confirm these have **stopped being ingested/computed** backend-side, not just hidden; the enum sections still exist and can bill BigQuery.
- SRE telemetry on the operator RPC (Web Vitals, 404s, exceptions, form errors, browser breakdown, user journeys) — wrong persona; a separate eng surface if ever needed.
