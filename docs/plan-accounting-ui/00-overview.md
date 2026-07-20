# Accounting UI — план имплементации. Часть 0: обзор

Фронтенд для бухгалтерского модуля бекенда (`grbpwr-manager`, ветка `feature/accounting-core`,
план в `grbpwr-products-manager/docs/plan-accounting/`). Бекенд уже отдаёт 16 RPC под
`/api/admin/accounting/*`; этот план — только про admin-client.

## Что строим (4 экрана + навигация)

| Экран | Роут | Содержимое |
|---|---|---|
| Journal | `/accounting` (лендинг раздела) | список проводок с фильтрами, деталка entry с линиями, модалка ручной проводки, сторно |
| Chart of Accounts | `/accounting/accounts` | таблица счетов, создание/переименование/архив |
| Reports | `/accounting/reports` | табы: Trial Balance · P&L · Balance Sheet · Ledger (drill-down по счёту) · Reconciliation |
| Periods | `/accounting/periods` | список периодов, close (с чек-листом not_ready) / reopen |

Reconciliation живёт табом в Reports (данные того же read-семейства), periods — отдельным
экраном (операционный ритуал закрытия месяца, см. бекенд-план 08).

Плюс один сквозной пункт вне раздела — **Шаг 6b, backend-alerts bridge** (06): рендер
`GetDashboard.alerts` на главной странице аналитики с deep-link'ами. Находка пролёта: клиент
сейчас вообще не показывает бекенд-алерты (поле не читается), так что `acct_*`-коды Шага 8
бекенда без этого не видны никому.

## Ключевые решения

- **RBAC-секция одна — `accounting`** (уже существует на бекенде: rbac.go, `rd/wr`).
  Меню гейтится `canRead('accounting')`, write-действия (ручная проводка, сторно, close/reopen,
  мутации счетов) — `canWrite('accounting')`. Помнить: клиентский гейт — только UX
  (protectedRoute проверяет лишь auth), реальная защита на бекенде.
- **Контракт через mirror-репо `grbpwr-proto`** — сабмодуль клиента. Новые RPC уже в
  `grbpwr-manager/proto/admin/admin/admin.proto`; их надо байт-в-байт синхронизировать в
  зеркало и перегенерить TS-клиент (`01-contract-and-api.md`). Это ПЕРВЫЙ шаг — без него
  нет типов.
- **Стек нового кода**: React Query (фабрика ключей на домен) + react-hook-form + zod +
  `@hookform/resolvers/zod` (yup/formik — легаси, не использовать), таблицы — самодельные
  `<table>` по образцу members-table (готового DataTable в ui-ките нет), деньги —
  `googletype_Decimal {value}` через `utils/decimal`, снэкбар — `useSnackBarStore`.
- **Деньги показываем как есть** (EUR, `value`-строка с 2 знаками) + новый маленький хелпер
  `formatBase()` в модуле (готового Decimal-форматтера в репо нет — факт).
- **Язык/тон UI** — английский, lowercase/uppercase через `Text`-варианты, тексты снэкбаров
  sentence-case (`'Entry created'`, `'Failed to close period'`) — как соседние экраны.
- **Никаких новых зависимостей** — всё собирается из `src/ui` + Radix, уже установленных.

## Принципы (зеркалят философию бекенда)

- Леджер append-only: UI не имеет «редактировать проводку» — только сторно с подтверждением.
- Caveats видимы: has_caveat-бейдж на entry, caveats-блок на P&L, balanced-индикатор на
  TB/BS — красным при нарушении.
- Suspense/lazy per-route, staleTime по умолчанию (5 мин) хватает; после мутаций —
  `invalidateQueries(acctKeys.all)`.

## Состав частей

| Файл | Содержимое |
|---|---|
| `01-contract-and-api.md` | Синк proto-зеркала, `make proto`, ожидаемые generated-типы, слой hooks (`acctKeys`, use*-хуки), деньги/даты/ошибки |
| `02-routing-nav-rbac.md` | ROUTES/NAV_GROUPS/index.tsx, скелет каталога `managers/accounting/` |
| `03-screens-accounts-journal.md` | Chart of Accounts + Journal + модалка ручной проводки + сторно |
| `04-screens-reports.md` | TB / P&L / BS / Ledger / Reconciliation |
| `05-screen-periods.md` | Periods + close/reopen + чек-лист not_ready |
| `06-implementation-order.md` | Шаг 0 для агентов, порядок шагов, DoD, проверенные факты кода (файлы:строки), ловушки, бэклог |
| `07-contract-reference.md` | Снапшот сгенерённого контракта (типы дословно, RPC→HTTP), литеральные константы, среда агента. **Шаг 1 уже выполнен** — типы в репо. |
| `08-ux-guidelines.md` | UX для бухгалтера/аналитика: 6 принципов (no dead-end numbers, период-контекст, сигналы доверия…), числовая типографика, форма проводки (ComboField-поиск, balance-кнопка, hotkeys), copy-to-TSV, pre-close светофор, анти-паттерны. Обязательна к прочтению агентами экранов. |

## Зависимость от бекенда

UI можно разрабатывать против беты (`VITE_SERVER_URL=https://backend-beta.grbpwr.com`) после
того, как бекенд-ветка смержена в beta и `ACCOUNTING_ENABLED=true`. До этого — против
локального бекенда (`make run` в grbpwr-manager). Никаких моков не городим.
