# Часть 1: контракт (proto-зеркало) и api-слой

## 1.1 Синк контракта — обязательный первый шаг

Схема потока (проверено по `grbpwr-products-manager/scripts/check-proto-contracts.sh`):

```
grbpwr-products-manager/proto/**        (источник истины, новые RPC уже там)
        │  байт-в-байт копия (allowlist дрейфа пуст!)
        ▼
github.com/jekabolt/grbpwr-proto        (mirror-репо; клон обычно лежит рядом: ../grbpwr-proto)
        │  git submodule proto/ в админке (без ветки → дефолтная)
        ▼
grbpwr-admin-client: make proto → src/api/proto-http/admin/index.ts (коммитится в git)
```

Шаги (на маке, руками или скриптом):

1. В `grbpwr-manager` убедиться, что `make check-proto-contracts` НЕ проходит только из-за
   mirror-дрейфа (наши изменения аддитивны, breaking-baseline не тронут).
2. Скопировать изменённые файлы в зеркало байт-в-байт (единственный изменённый —
   `proto/admin/admin/admin.proto`):
   `cp proto/admin/admin/admin.proto ../grbpwr-proto/admin/admin/admin.proto`
   (проверить относительный layout зеркала: file-set сверяется как `find proto -name '*.proto'`
   против `find $MIRROR_DIR -name '*.proto'` — пути должны совпасть).
3. Commit+push в grbpwr-proto (дефолтная ветка).
4. В `grbpwr-manager` обновить `proto/contracts/mirror-git-ref.txt` на новый SHA зеркала —
   `make check-proto-contracts` снова зелёный. Это часть бекенд-PR.
5. В `grbpwr-admin-client`: `cd proto && git fetch && git checkout <тот же SHA> && cd ..`,
   затем `make proto` (buf generate → `src/api/proto-http/*`), закоммитить сабмодуль-бамп +
   перегенерённые `index.ts` (генерат коммитится — факт, .gitignore-строка закомментирована).

## 1.2 Ожидаемые generated-типы (по правилам существующего генерата)

- Сообщения без префикса пакета: `CreateJournalEntryRequest`, `AcctJournalEntry`,
  `AcctJournalLineInput`, `TrialBalanceRow`, `ListAcctPeriodsResponse`…
- Деньги: `googletype_Decimal = { value: string | undefined }`.
- Все поля `T | undefined`; enum'ы — string-literal union.
- В интерфейс `AdminService` добавятся 16 методов; GET-методы кладут параметры в query
  (`from`, `to`, `account_code` → `request.from` и т.д.), path-параметры подставляются
  (`GetJournalEntry {id}` → `api/admin/accounting/journal/${id}`, guard на missing).
- Проверить после генерации: имена полей camelCase (`occurredAt`, `accountCode`,
  `sourceType`, `notReady`, `balanceCheck`, `runningBalance`, `openingBalance`).

## 1.3 Слой данных: `src/components/managers/accounting/utils/hooks.ts`

Фабрика ключей + хуки по образцу `opexKeys`/`membershipKeys` (один файл на домен):

```ts
export const acctKeys = {
  all: ['accounting'] as const,
  accounts: (includeArchived: boolean) => [...acctKeys.all, 'accounts', includeArchived] as const,
  entries: (f: EntriesFilter) => [...acctKeys.all, 'entries', f] as const,
  entry: (id: number) => [...acctKeys.all, 'entry', id] as const,
  periods: () => [...acctKeys.all, 'periods'] as const,
  trialBalance: (from: string, to: string) => [...acctKeys.all, 'tb', from, to] as const,
  profitLoss: (from: string, to: string) => [...acctKeys.all, 'pl', from, to] as const,
  balanceSheet: (asOf: string) => [...acctKeys.all, 'bs', asOf] as const,
  ledger: (code: string, f: LedgerFilter) => [...acctKeys.all, 'ledger', code, f] as const,
  reconciliation: (from: string, to: string) => [...acctKeys.all, 'recon', from, to] as const,
};
```

Query-хуки — тонкие обёртки `useQuery({ queryKey, queryFn: () => adminService.X({...}) })`.
Мутации — `useMutation` + `onSuccess: qc.invalidateQueries({ queryKey: acctKeys.all })`
(домен маленький, точечная инвалидация не нужна) + снэкбар в вызывающем компоненте (паттерн
`useUpsertOpexLines`). Полный список хуков:

`useAcctAccounts(includeArchived)`, `useCreateAccount()`, `useUpdateAccountName()`,
`useArchiveAccount()`, `useJournalEntries(filter)`, `useJournalEntry(id)`,
`useCreateJournalEntry()`, `useReverseJournalEntry()`, `useAcctPeriods()`,
`useClosePeriod()`, `useReopenPeriod()`, `useTrialBalance(from,to)`,
`useProfitLoss(from,to)`, `useBalanceSheet(asOf)`, `useAccountLedger(code,filter)`,
`useReconciliation(from,to)`.

Отчётные хуки — `enabled: Boolean(from && to)` чтобы не дёргать API до выбора дат.

## 1.4 Деньги, даты, ошибки — существующие утилиты (не изобретать)

- Decimal ↔ форма: `decimalToInput` / `inputToDecimal` / `sanitizeDecimal` из
  `src/utils/decimal.ts`; RHF-поле — `ui/form/fields/decimal-field.tsx`.
- Отображение сумм: нового хелпера `formatBase(d?: googletype_Decimal): string` положить в
  `accounting/utils/format.ts` — `€` + value с 2 знаками + '—' на undefined (готового
  форматтера Decimal в репо нет; `formatEur` из tier-utils принимает number — не подходит).
  Отрицательные (балансы, дельты сверки) — со знаком минус, красным (`text-error`).
- Даты в запросах — строки `YYYY-MM-DD` (контракт бекенда). Ввод: до `06`-файла хватит
  нативного `<Input type='date'>` (паттерн уже есть) и `type='month'` как `MonthInput` в opex
  (месяц → `${m}-01`, хелпер уже есть — `monthToApi`). `DatePicker` из ui — опционально.
- Отображение дат: `formatDateShort` (orders-catalog/components/utility.ts) → `20 JUL 2026`.
- Ошибки: снэкбар `e instanceof Error ? e.message : 'Failed to …'`;
  для формы ручной проводки — `applyServerFieldErrors(error, form.setError, {...})`
  (`src/utils/field-errors.ts`) — бекенд шлёт InvalidArgument с внятным message
  (Dr≠Cr, unknown account, closed period → показываются и как общий тост).

## 1.5 Санитарная проверка контракта после генерации

`yarn build:check` — единственный «компилятор правды» (тест-раннера в репо нет — факт).
Плюс ручной smoke в `yarn dev`: `adminService.ListAcctAccounts({includeArchived:false})`
из консоли/временной кнопки → 34 счёта.
