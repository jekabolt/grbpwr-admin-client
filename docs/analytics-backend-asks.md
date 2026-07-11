---
title: Analytics — Backend Follow-ups (grbpwr-proto)
date: 2026-07-11
tags: [analytics, backend, grbpwr-proto, roadmap]
---

# Analytics backend follow-ups

Hand-off list from the decision-first dashboard rework (branch `analytics-decision-first`).
Each item is a concrete `grbpwr-proto` / gateway change. Ordered by value × effort.

## Delivered & consumed by the frontend

Earlier proto bump:

- `RefundReason` enum + `RefundOrderRequest.reasonCode` — wired in the refund modal.
- `InventoryHealthRow.{reorderPoint,targetDaysCover,leadTimeDays,needsReorder,hasTarget}`
  + `UpsertInventoryTargets` RPC — powers the **Reorder-now** list + target entry form.
- `CampaignAttributionRow.{spend,roas}` + `UpsertChannelSpend` RPC — powers ROAS + spend entry.

`@26a19e8` proto bump (this follow-up round — asks #1/#2/#3/#4/#6/#7/#8/#10 below):

- #1 **Margin on `SlowMoverRow` + `RevenueParetoRow`** (`unitCost/revenueCost/grossMargin/grossMarginPct/hasCost`)
  — Margin column on the Slow movers table (markdown headroom).
- #2 **`MarginMetrics.paymentFees`** + redefined `contributionMargin` — Payment-fees line in the Revenue P&L.
- #3 **`MarginMetrics.uncostedProductIds`** — "N products missing cost" hint on the margin block.
- #4 **`GetMetricsResponse.sellThroughByDrop`** (`SellThroughByDropRow`: collection, units bought/sold/remaining,
  sellThroughPct, revenue, grossMargin(Pct), hasCost, daysTo50pct) — new **Drop verdict** section in Products.
- #6 **`SizeRunEfficiencyRow.{unitsBought,unitsSold,sellThroughPct}`** — true unit sell-through in the size-run table.
- #7 **`CrossSellPair.{support,confidence,lift}`** — cross-sell table now ranks by lift, shows attach rate.
- #8 **`MetricWithComparison.{sampleSize,marginOfError}`** — alert gating prefers `sampleSize`; `formatPercentWithBand`
  renders "12.0% ± 2.4" (applied to refund rate; lights up as backend extends MoE coverage).
- #10 **`BusinessMetrics` god-object split** into `CommerceCoreMetrics / MarginMetrics / TrafficMetrics / EmailMetrics`
  — all frontend reads migrated to the sub-messages.

## Available in the contract but not yet consumed (deliberate)

| # | Ask | Status | Note |
|---|-----|--------|------|
| 5 | **`GetDashboard` decision RPC** (+ `DashboardAlert`) | Shipped in proto, not wired | Building a single decision-first page would duplicate the current tabbed dashboard. Deferred as an architecture decision, not an oversight — revisit if we want to retire the tabs. |
| 11 | **`GetAlertSettings` / `UpsertAlertSettings` + `AlertSettings`** | Shipped in proto, not wired | Alert thresholds still live as constants in `executiveAlerts.ts`. A small settings form would move them server-side; low priority until ops actually want to tune them. |

## Still needed

| # | Ask | Value | Effort | Why |
|---|-----|-------|--------|-----|
| 9 | **Fix `ordersByStatus`** — count each order's current/terminal status once, not transitions (its sum currently exceeds the order count). | Med | S | Removes the cancellation-denominator workaround (`orderCancellationSharePercent` still divides by `ordersCount`, not the status-row sum); makes any status breakdown honest. |

## Explicitly NOT worth building

- Ad-spend/ROAS pipeline beyond the manual `UpsertChannelSpend` entry — **unless** paid ads become a real line item. For a mostly-organic hype brand, a full GA4-reconciled spend integration is effort disproportionate to a number nobody acts on.
- GA4 micro-funnel steps beyond the 3 that matter (device funnel, checkout timings, hero funnel, abandoned-cart minutes, payment recovery).
- BQ micro-interaction event streams (zoom, swipes, time-on-page, details-expansion, size-guide-clicks, session duration) — confirm these have **stopped being ingested/computed** backend-side, not just hidden; the enum sections still exist and can bill BigQuery.
- SRE telemetry on the operator RPC (Web Vitals, 404s, exceptions, form errors, browser breakdown, user journeys) — wrong persona; a separate eng surface if ever needed.
