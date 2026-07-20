# Часть 2: роутинг, навигация, RBAC, скелет каталога

## 2.1 `src/constants/routes.ts`

1. В `enum ROUTES` (строки 50–99, рядом с `opex='/opex'`):

```ts
accounting = '/accounting',                    // Journal — лендинг раздела
accountingAccounts = '/accounting/accounts',
accountingReports = '/accounting/reports',
accountingPeriods = '/accounting/periods',
```

2. В `SECTION` (строки 22–46): `accounting: 'accounting',` — ключ ДОЛЖЕН побуквенно совпадать
   с бекендным `rbac.SectionAccounting = "accounting"` (гейтинг fail-open сверяется с
   `ListAccountSections`, опечатка = пункт виден всем).

3. В `NAV_GROUPS` (строка 104): свои пункты в группу `operations` (или где живёт `opex` —
   посмотреть по месту и положить рядом, финансы к финансам):

```ts
{ label: 'accounting', route: ROUTES.accounting, section: SECTION.accounting },
```

Один пункт меню на раздел (внутренние переходы — внутри экранов, как fulfillment/orders);
НЕ плодить 4 пункта в меню.

## 2.2 `src/index.tsx`

Lazy-импорты по named-export паттерну (как Opex, строки 108–110) + 4 Route внутри
`ProtectedLayout`-блока (строки 214–257):

```tsx
const AcctJournal = lazy(() => import('components/managers/accounting/journal/page').then((m) => ({ default: m.AcctJournalPage })));
const AcctAccounts = lazy(() => import('components/managers/accounting/accounts/page').then((m) => ({ default: m.AcctAccountsPage })));
const AcctReports = lazy(() => import('components/managers/accounting/reports/page').then((m) => ({ default: m.AcctReportsPage })));
const AcctPeriods = lazy(() => import('components/managers/accounting/periods/page').then((m) => ({ default: m.AcctPeriodsPage })));
...
<Route path={ROUTES.accounting} element={<AcctJournal />} />
<Route path={ROUTES.accountingAccounts} element={<AcctAccounts />} />
<Route path={ROUTES.accountingReports} element={<AcctReports />} />
<Route path={ROUTES.accountingPeriods} element={<AcctPeriods />} />
```

## 2.3 RBAC в экранах

- Меню спрячется само (`nav-dropdown-menu.tsx`/`DesktopNavMenu` фильтруют по
  `canRead(item.section)` — уже работает, ничего не писать).
- В экранах: `const { canWrite } = usePermissions();`
  (`components/managers/accounts/utils/permissions.ts`) →
  `const canWriteAcct = canWrite(SECTION.accounting);` — гейтит кнопки
  `new entry` / `reverse` / `close period` / `reopen` / мутации счетов
  (паттерн tier-config: кнопка скрыта или disabled + tooltip).
- Косвенный доступ по прямому URL без прав — допустим (protectedRoute гейтит только auth);
  запросы вернут PermissionDenied → пустой экран с тостом. Это существующее поведение всех
  разделов, ничего специального не делаем.

## 2.4 Скелет каталога

```
src/components/managers/accounting/
  utils/
    hooks.ts          — acctKeys + 16 хуков (01)
    format.ts         — formatBase, formatSide, sourceTypeLabel
    constants.ts      — ACCT_SOURCE_TYPES (11, литералы в 07.5), ACCT_SECTIONS (6),
                        ACCT_STATEMENTS, ACCT_PAGE_SIZE=50, пресеты ручной проводки
  components/
    section-header.tsx    — общий тайтл-бар с внутренними табами-ссылками
                            (journal · accounts · reports · periods; NavLink + isActiveRoute)
    balanced-badge.tsx    — зелёный/красный индикатор Σdebit==Σcredit / CHK==0
    caveat-badge.tsx      — жёлтый маркер has_caveat с tooltip(caveat)
    amount-cell.tsx       — правое выравнивание, tabular-nums, минус красным
  journal/
    page.tsx
    components/{entries-table.tsx, entries-filter.tsx, entry-detail-modal.tsx,
                manual-entry-modal.tsx, schema.ts, reverse-confirm.tsx}
  accounts/
    page.tsx
    components/{accounts-table.tsx, upsert-account-modal.tsx, schema.ts}
  reports/
    page.tsx            — таб-переключатель через useSearchParams (?tab=tb|pl|bs|ledger|recon —
                          паттерн opex: простые кнопки, не Radix Tabs)
    components/{trial-balance.tsx, profit-loss.tsx, balance-sheet.tsx,
                ledger.tsx, reconciliation.tsx, range-controls.tsx}
  periods/
    page.tsx
    components/{periods-table.tsx, close-period-confirm.tsx}
```

`section-header.tsx` рендерится на всех 4 страницах — единая шапка раздела в стиле
существующих (`-mx-2.5 flex ... border-b border-textInactiveColor`, `Text variant='uppercase'
size='large'` c 'accounting'), внутренние вкладки — ссылки на 4 роута с активным подчёркиванием.
