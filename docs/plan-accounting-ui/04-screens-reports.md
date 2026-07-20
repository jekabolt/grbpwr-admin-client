# Часть 4: экран Reports (`/accounting/reports`)

Один page.tsx, таб в query-параметре `?tab=tb|pl|bs|ledger|recon` (паттерн opex: простые
кнопки + useSearchParams; НЕ Radix Tabs). Общий `range-controls.tsx` сверху: два
`Input type='date'` (from/to) c пресетами `this month · last month · YTD`; для BS — один
as-of; для ledger — счёт + диапазон. Значения диапазона тоже в searchParams — шеримые ссылки.

Контракт searchParams (фиксируем — на него ссылаются TB/BS-клики, recon и dashboard-алерты):
`?tab=tb|pl|bs|ledger|recon & from=YYYY-MM-DD & to=YYYY-MM-DD & asOf=... & code=1030`.
Пресеты дат считаются от локальной даты пользователя (границы месяца UTC-краем не мучаем —
однострочный компромисс, как в остальной админке).

## 4.1 Trial Balance

`useTrialBalance(from,to)`. Таблица: `code · name · section · debit · credit · balance`
(amount-cell, tabular-nums, правое выравнивание). Футер: totals + `balanced-badge`
(зелёный `balanced` / красный `OUT OF BALANCE` — второе теоретически невозможно, потому
особенно заметно). Клик по строке → таб ledger с этим счётом (setSearchParams).

## 4.2 P&L

`useProfitLoss(from,to)`. Структура ответа: months[] + sections[] (revenue→cogs→opex, в
каждой rows: счёт → значения по месяцам + total) + totals-строки
(TotalRevenue/NetCogs/GrossProfit/GrossMarginPct/TotalOpex/OperatingProfit/NetMarginPct).

- Рендер: горизонтально скроллируемая таблица (`overflow-x-auto`, sticky первая колонка —
  паттерн members-table): колонка счёта + колонка на месяц + total.
- Секции — подзаголовками-строками (uppercase muted); производные строки — жирнее, с
  верхней границей; `%`-строки — с `%`.
- Контра-счета (4040, 5050) приходят отрицательными — amount-cell сам покрасит минус.
- `caveats[]` из ответа — жёлтый блок над таблицей (в нём же постоянные: pre-tax, shipping
  cost — бекенд их всегда шлёт).

## 4.3 Balance Sheet

`useBalanceSheet(asOf)`. Три секции (ASSETS / LIABILITIES / EQUITY) вертикальным списком:
строки code·name·amount, подытоги секций, строка `Current Period Net Profit` внутри equity
(она приходит в rows), футер `TOTAL LIABILITIES + EQUITY` и CHK-строка `balance check` +
balanced-badge. Клик по счёту → ledger.

## 4.4 Ledger (drill-down)

`useAccountLedger(code, {from,to,limit,offset})`. Селектор счёта (тот же SelectField
`${code} — ${name}`) + диапазон. Шапка: `opening balance`. Таблица:
`date · entry · description · source · debit · credit · running balance`; `entry` — ссылка,
открывающая entry-detail-modal (переиспользовать компонент из journal); source-ссылки на
заказ как в journal. Пагинация prev/next + `closing balance` в футере видимой страницы
(running_balance последней строки).

## 4.5 Reconciliation

`useReconciliation(from,to)` (дефолт — текущий месяц). Ответ — 7 именованных блоков
(revenue / fees / cogs / materials / finished_goods / pending / unposted_movements).

- Каждый money-блок — карточкой: название, `ledger` vs `operational`, `delta`
  (зелёная ≈0 в пределах цента, жёлтая/красная больше), раскрывающийся список items
  (top-N + `and N more`). Для finished_goods — поясняющая строка «drift is expected
  (live cost_price vs sale-time snapshots)» (бекенд-план 06).
- `pending`-блок: группы по причинам (`settled pending` / `awaiting sale posting` /
  `manual entry required` / `pre-start event`) со счётчиками и возрастом; item'ы-заказы —
  ссылками на `/orders/{uuid}`; рядом с `manual entry required` — кнопка `create manual
  entry` (открывает модалку из 03 с пустым префиллом).
- `unposted_movements`: таблица id·material·qty — read-only.
- Этот экран — операционный ритуал перед закрытием месяца (бекенд-план 08): вверху
  ссылка-кнопка `go to periods →`.

## Общее

- Все таблицы отчётов read-only — никакого canWrite-гейта (кроме кнопки create-entry в recon).
- Загрузка — `Loader` из ui + `min-h` контейнера; ошибка запроса — тост + retry-кнопка.
- Числа: `formatBase` (типографика — UX 8.3: tabular-nums, right-align, всегда 2 знака,
  минус красным, `—` vs `0.00`); проценты — 1 знак после запятой.
- **UX-обязательно (8.5)**: кнопка `copy table` (TSV → clipboard, снэкбар
  `Table copied — paste into a spreadsheet`) на TB/P&L/BS/ledger; sticky `thead`
  (`sticky top-0 bg-bgColor z-10`) + sticky первая колонка; бейдж статуса периода
  `OPEN/CLOSED` рядом с датами (из useAcctPeriods; диапазон — CLOSED только если все
  месяцы закрыты).
