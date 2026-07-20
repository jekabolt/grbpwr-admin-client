# Часть 7: справочник контракта (снапшот генерата) + среда агента

## 7.1 Статус: Шаг 1 (контракт) УЖЕ ВЫПОЛНЕН

В рабочем дереве репо: сабмодуль `proto` забампан (34548d4f → f64a6b72, accounting-RPC
внутри), `src/api/proto-http/admin/index.ts` перегенерён (+711 строк, 44 accounting-типа).
Изменения НЕ закоммичены — коммитятся вместе с фичей. Агентам НИЧЕГО генерить не нужно —
типы уже в репо. **Истина — сам `index.ts`**; ниже — проверенный снапшот для быстрого чтения.

## 7.2 Ключевые типы (дословно из генерата; все поля `| undefined`)

```ts
AcctAccount        = { id, code, name, section, statement, isSystem, archived }
AcctJournalEntry   = { id, occurredAt, description, sourceType, sourceKey,
                       reversalOf, reversedBy, createdBy, hasCaveat, caveat,
                       lines: AcctJournalLine[], total: googletype_Decimal }
AcctJournalLineInput = { accountCode, isDebit: boolean, amount: googletype_Decimal,
                       amountSrc: googletype_Decimal, currencySrc, note }
CreateJournalEntryRequest = { occurredAt, description, lines: AcctJournalLineInput[] }
ListJournalEntriesRequest = { from, to, accountCode, sourceType, limit, offset }
TrialBalanceRow    = { code, name, section, debit, credit, balance }        // все Decimal
AcctPLSection      = { section, rows: AcctPLRow[] }
AcctPLRow          = { code, name, values: googletype_Decimal[], total }    // values ∥ months
AcctPLTotals       = { totalRevenue[], netCogs[], grossProfit[], grossMarginPct[],
                       totalOpex[], operatingProfit[], netMarginPct[] }     // массивы ∥ months
GetProfitLossStatementResponse = { months: string[], sections, totals, caveats: string[] }
GetBalanceSheetResponse = { asOf, assets, liabilities, equity: AcctBalanceSheetSection,
                       netProfitRow: AcctBalanceSheetRow, totalAssets, totalLiabilities,
                       totalEquity, balanceCheck, balanced: boolean }
AcctBalanceSheetSection = { section, rows: AcctBalanceSheetRow[], total }
GetAccountLedgerResponse = { code, name, section, openingBalance, closingBalance,
                       rows: AcctLedgerRow[], total: number }
AcctLedgerRow      = { entryId, occurredAt, description, sourceType, sourceKey,
                       side: string, amount, note, runningBalance }
AcctPeriod         = { period, status, closedAt, closedBy }
CloseAcctPeriodResponse = { closed: boolean, notReady: string[] }
GetAcctReconciliationResponse = { revenue, fees, cogs, materials, finishedGoods,
                       pending, unpostedMovements }                          // 7× AcctReconBlock
AcctReconBlock     = { name, ledger, operational, delta, items: AcctReconItem[], totalCount }
AcctReconItem      = { ref, label, amount }
```

Замечания-выводы для экранов:

- P&L: `rows[i].values` и все массивы `totals.*` параллельны `months` — рендер по индексу;
  YTD-колонка = `rows[i].total` (в totals массивов YTD нет — не выдумывать).
- Ledger: `closingBalance` приходит с бекенда — футер не считать на клиенте.
- Recon: у блока `totalCount` (не totalItems); item = `{ref, label, amount}` — `ref` для
  order-ссылок (uuid), movement id и т.п.
- BS: `netProfitRow` — отдельное поле (бекенд матчит имя строки) + строка также внутри
  `equity.rows`; не рендерить дважды — брать секции как есть, `netProfitRow` игнорировать
  либо использовать только для сверки-бейджа.
- Journal detail: `total` = Σ дебетов (== Σ кредитов) — готовый футер.

## 7.3 RPC → HTTP (для понимания сетевой вкладки; хукам не нужно)

Все — `adminService.<Name>(request)`; GET-параметры генерат собирает сам из полей запроса
(camelCase: `accountCode=`, `sourceType=`; undefined-поля опускаются), POST — JSON-тело.

| Метод | HTTP |
|---|---|
| ListAcctAccounts | GET `api/admin/accounting/accounts` |
| CreateAcctAccount / UpdateAcctAccount / ArchiveAcctAccount | POST `.../accounts[/update\|/archive]` |
| CreateJournalEntry | POST `.../journal` |
| ReverseJournalEntry | POST `.../journal/reverse` |
| GetJournalEntry | GET `.../journal/{id}` (guard: missing id → throw) |
| ListJournalEntries | GET `.../journal` |
| ListAcctPeriods | GET `.../periods` |
| CloseAcctPeriod / ReopenAcctPeriod | POST `.../periods/close\|reopen` |
| GetTrialBalance | GET `.../reports/trial-balance` |
| GetProfitLossStatement | GET `.../reports/profit-loss` |
| GetBalanceSheet | GET `.../reports/balance-sheet` |
| GetAccountLedger | GET `.../reports/ledger/{code}` |
| GetAcctReconciliation | GET `.../reports/reconciliation` |

## 7.4 Среда агента в песочнице (проверено)

- Node v22 + `node_modules` установлены; **yarn НЕТ** — бины напрямую:
  - тайпчек (главный DoD): `./node_modules/.bin/tsc --noEmit` (tsc 5.4.2 работает);
  - `build:check`-эквивалент: `./node_modules/.bin/tsc && ./node_modules/.bin/vite build`
    (vite build опционален, tsc достаточно на шагах);
  - линт/формат: `./node_modules/.bin/eslint --fix` с паттерном из package.json `lint`
    (`'./src/**/*.{js,ts,tsx,json}'`); `./node_modules/.bin/prettier --write <файлы>`.
- **git агентам НЕ трогать**: рабочее дерево содержит некоммиченный контракт-синк, ветка —
  `feat/plm-cutover`; FUSE-мост ломает unlink в `.git/` (и в `.git/modules/proto`).
  Коммиты делает пользователь.
- Бекенд для ручного смоука агентам недоступен (нет сети) — их DoD ограничен tsc+eslint;
  runtime-смоук по чек-листам 06 делает пользователь в `yarn dev`.

## 7.5 Литеральные константы для `accounting/utils/constants.ts`

```ts
export const ACCT_SOURCE_TYPES = [
  { value: 'order_sale', label: 'order sale' },
  { value: 'order_refund', label: 'order refund' },
  { value: 'material_receipt', label: 'material receipt' },
  { value: 'material_issue', label: 'material issue' },
  { value: 'material_return', label: 'material return' },
  { value: 'material_writeoff', label: 'material write-off' },
  { value: 'material_adjustment', label: 'material adjustment' },
  { value: 'production_receive', label: 'production receive' },
  { value: 'opex_month', label: 'opex month' },
  { value: 'manual', label: 'manual' },
  { value: 'reversal', label: 'reversal' },
] as const;                       // = CHECK chk_acct_entry_source_type (11 значений)

export const ACCT_SECTIONS = ['asset','liability','equity','revenue','cogs','opex'] as const;
export const ACCT_STATEMENTS = ['BS','PL'] as const;
export const ACCT_PAGE_SIZE = 50;
```

Пресеты ручной проводки (03) — коды счетов строками ('1010' и т.д.), список — бекенд-план
04 §MN; названия счетов подтянутся из `useAcctAccounts` для отображения.
