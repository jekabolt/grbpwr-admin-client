# Часть 5: экран Periods (`/accounting/periods`)

Маленький, но с самым «опасным» действием раздела — закрытием периода.

## Список

`useAcctPeriods()`. Таблица: `period (JUL 2026) · status (open/closed бейдж) · closed at ·
closed by · [action]`. Периоды создаются бекендом лениво — если список пуст, плейсхолдер
`no periods yet — they appear with the first posting`.

Сверху — подсказка ритуала (статичный muted-текст, 3 строки из бекенд-плана 08):
`1. review reconciliation → 2. add missing manual entries → 3. close` + ссылка
`open reconciliation →` (`/accounting/reports?tab=recon`).

## Close

Кнопка `close` у open-периодов прошлых месяцев (canWriteAcct; текущий месяц бекенд не даст
закрыть — кнопку для него скрыть, `month is not over yet` tooltip).

`close-period-confirm.tsx` — ConfirmationModal (`closeOnConfirm={false}`):
- **Pre-close светофор (UX 8.6)**: при открытии модалки сразу запрашивается
  `useReconciliation(месяц)` и рендерятся строки-статусы ДО попытки:
  `pending events: N ✓/✗ · unposted movements: N ✓/✗ · revenue delta: X ✓/✗`
  (✓ зелёный при нуле/≈0). Кнопка активна всегда — бекенд истина, светофор — предупреждение.
- текст: `Close JUL 2026? Closed periods reject any new postings; late events will require
  reopening.`
- `useClosePeriod` → ответ содержит `{closed, notReady[]}` (НЕ gRPC-ошибка — контракт 05
  бекенда): `closed=true` → `'Period closed'`, закрыть; `closed=false` → остаёмся в модалке
  и показываем красный блок `not ready:` со списком причин (pending events / unposted
  movements / opex …) + ссылка `open reconciliation →`.

## Reopen

У closed-периодов — `reopen` (canWriteAcct) через ConfirmationModal с предупреждением
`Reopening allows postings into a finalized month. Close it again after the fix.` →
`useReopenPeriod` → `'Period reopened'`.

## Побочный эффект закрытия/открытия

После close/reopen инвалидация `acctKeys.all` уже перезапросит отчёты — P&L/BS закрытого
месяца иммутабельны де-факто (бекенд отклонит постинги), UI это не дублирует.
