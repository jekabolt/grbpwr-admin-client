# Часть 6: порядок имплементации, DoD, проверенные факты, ловушки

## Шаг 0 — прочитать агенту до начала (среда и правила)

1. Читать: 00 → 07 (контракт+среда) → 06 → **08 (UX — обязателен для экранных шагов)** →
   файл своей части. Истина типов — `src/api/proto-http/admin/index.ts` (уже сгенерён).
2. Песочница: node v22 + node_modules есть, yarn НЕТ. Команды:
   тайпчек `./node_modules/.bin/tsc --noEmit` (обязательный DoD каждого шага);
   линт `./node_modules/.bin/eslint --fix` по паттерну из package.json;
   формат `./node_modules/.bin/prettier --write` по изменённым файлам.
3. **git не трогать** (некоммиченный контракт-синк в дереве, ветка feat/plm-cutover,
   FUSE ломает `.git`-unlink) — только файлы; коммиты делает пользователь.
4. Не редактировать `src/api/proto-http/*` и `proto/`.
5. Runtime-смоук агенту недоступен (нет сети/бекенда) — его делает пользователь по
   чек-листам шагов в `yarn dev`.

## Порядок шагов (строго последовательно до Шага 3, дальше экраны параллелятся)

```
Шаг 1 (контракт) ──► Шаг 2 (hooks+утилиты) ──► Шаг 3 (роутинг+скелет+header)
                                                    ├─► Шаг 4 Journal+Accounts
                                                    ├─► Шаг 5 Reports
                                                    └─► Шаг 6 Periods
                                               Шаг 7 — полировка+RBAC-пасс+фиксы
```

Если работают агенты: после Шага 3 — три параллельных (A: Journal+Accounts — самый большой;
B: Reports; C: Periods+помощь B по recon). Общие файлы (`hooks.ts`, `format.ts`,
`section-header.tsx`) созданы Шагом 2–3 и дальше только читаются — конфликтов нет.

### Шаг 1 — контракт (01). ✅ УЖЕ ВЫПОЛНЕН
Сабмодуль proto забампан (f64a6b72), `src/api/proto-http/admin/index.ts` перегенерён и лежит
в рабочем дереве (некоммичено — коммит с фичей). Точный снапшот типов/путей — **07**.
Осталось из 01 только бекенд-сторона синка: обновить `mirror-git-ref.txt` в grbpwr-manager
при бекенд-PR.

### Шаг 2 — данные и утилиты (01.3–01.4)
`accounting/utils/{hooks.ts,format.ts,constants.ts}` (литеральные константы — 07.5).
Правила: значения queryKey — только примитивы/плоские объекты строк-чисел (filter кладётся
в ключ как есть — паттерн members); отчётные хуки `enabled` при пустых датах; debounce —
скопировать локальный паттерн из `members/page.tsx` (общего useDebounce-хука в репо нет).
DoD: `tsc --noEmit`; хуки типизированы без any.

### Шаг 3 — роутинг+навигация+скелет (02)
routes.ts, index.tsx, каталог со стаб-страницами (`section-header` + `Text 'coming soon'`),
общие компоненты (balanced-badge, caveat-badge, amount-cell). DoD: build:check; в dev меню
показывает `accounting` только аккаунту с правом; все 4 роута открываются.

### Шаг 4 — Accounts + Journal (03)
Порядок внутри: accounts-таблица → upsert-модалка → journal-список+фильтры → деталка →
сторно → ручная проводка (последняя — самая сложная). DoD: build:check; в dev против
локального бекенда: создать счёт, увидеть проводки (после включения воркера), создать
ручную проводку с пресетом `Stripe payout`, увидеть баланс-футер, сторнировать.

### Шаг 5 — Reports (04)
Порядок: range-controls → TB → BS → ledger → P&L (самая тяжёлая таблица) → recon.
DoD: build:check; TB balanced-бейдж зелёный на данных смоука; переход TB→ledger работает;
P&L caveats-блок виден.

### Шаг 6 — Periods (05)
DoD: закрытие прошлого месяца с непустым not_ready показывает причины; reopen работает.

### Шаг 6b — Backend-alerts bridge на главном дашборде (находка пролёта)

**Факт (проверено):** клиент вызывает `GetDashboard`, но читает из ответа только
operating_result/opex/GA4-coverage — поле `alerts` (backend `DashboardAlert`:
code/severity/message) **не рендерится нигде**; «алерты» на главной
(`ExecutiveHealthStrip` + `executiveAlerts.ts`) — клиентские, derived из метрик. Значит и
существующие `low_material_stock`/`stale_open_production_run`, и наши новые `acct_*`
невидимы пользователю — цепочка Шага 8 бекенда оборвана на фронте.

Задача: в `src/components/managers/page/` добавить рендер `dashboard?.alerts` —
компактный список под/внутри Health-strip (severity-цвет, message), с deep-link'ами по коду:

```ts
const ALERT_LINKS: Record<string, string> = {
  acct_posting_lag: `${ROUTES.accountingReports}?tab=recon`,
  acct_manual_entry_required: `${ROUTES.accountingReports}?tab=recon`,
  acct_reconciliation_drift: `${ROUTES.accountingReports}?tab=recon`,
  low_material_stock: ROUTES.materials,
  stale_open_production_run: ROUTES.productionRuns,
};  // неизвестный код → текст без ссылки (forward-compatible)
```

DoD: искусственно зависшее событие на бете → алерт виден на главной и ведёт в recon.
(Требует `useDashboardQuery` без изменений — поле уже приходит.)

### Шаг 7 — полировка
RBAC-пасс по всем write-кнопкам read-only-аккаунтом; **UX-пасс по чек-листу 8.7/8.9**
(пустые состояния с действием, снэкбар-тексты, min-h контейнеров, тултипы только где надо);
`yarn fix` (prettier+eslint — обязательный финал по конвенции репо); ручной прогон
чек-листа смоука.

## Rollout

`yarn dev` против локального бекенда (`VITE_SERVER_URL=http://localhost:8081`) → мердж в
beta-ветку клиента → Vercel-превью `admin.beta.grbpwr.com` против backend-beta (там
`ACCOUNTING_ENABLED=true`) → неделя пользования (ритуал месяца из бекенд-плана 08) →
прод admin.grbpwr.com (бекенд-флаг на проде включается независимо; до включения раздел
показывает пустой леджер — это штатно).

## Проверенные факты кода (агенту сверяться, при расхождении — доверять коду)

| Что | Где |
|---|---|
| ROUTES enum / SECTION / NAV_GROUPS / ADMIN_GROUP | `src/constants/routes.ts` :50–99 / :22–46 / :104 / :150 |
| Route-элементы, lazy-паттерн (named export) | `src/index.tsx` :108–110 (Opex-образец), блок :214–257 |
| ProtectedLayout / ProtectedBare | `src/index.tsx` :174–198; auth-гейт `src/components/login/protectedRoute.tsx` (только JWT-exp, ролей нет) |
| Права | `src/components/managers/accounts/utils/permissions.ts` → `usePermissions()` (`canRead:68`, `canWrite:69`); данные — React Query (`accounts/utils/hooks.ts`: GetCurrentAccount + ListAccountSections); гейтинг меню fail-open — `src/ui/components/nav-dropdown-menu.tsx` :23–31 |
| Транспорт/ошибки | `src/api/api.ts` (`Grpc-Metadata-Authorization`, парс google.rpc.Status, `err.details`) |
| Generated-клиент | `src/api/proto-http/admin/index.ts` (`createAdminServiceClient` :7380; POST-паттерн :7498; GET query :7472; path-guard :7515); типы без префикса пакета; Decimal = `googletype_Decimal {value}` (`proto-http/common` :301+) |
| Proto-генерация | `Makefile` (init/submodules/clean/proto), `buf.gen.yaml` (plugin typescript-http → `src/api/proto-http`), `.gitmodules` (submodule proto → github.com/jekabolt/grbpwr-proto, без ветки), генерат КОММИТИТСЯ |
| Зеркало контракта | `grbpwr-products-manager/scripts/check-proto-contracts.sh`: file-set и байт-идентичность backend/proto ↔ mirror, пин `proto/contracts/mirror-git-ref.txt`, allowlist пуст |
| Эталон списка+пагинации | `src/components/managers/membership/members/{page.tsx,components/members-table.tsx}` (debounce 400, PAGE_SIZE=50, prev/next) |
| Эталон RHF+zod-модалки | `src/components/managers/shipping/components/{upsert-shipping.tsx,schema.ts}`; Form=FormProvider `src/ui/form/index.tsx`, поля `src/ui/form/fields/*` (есть `decimal-field`, `currency-select`) |
| Эталон денег/месяца | `src/components/managers/opex/{components/line-form.tsx,components/fields.tsx (MonthInput :111, type='month' :126),utils/hooks.ts (opexKeys, useUpsertOpexLines :26)}` |
| Decimal-утилиты | `src/utils/decimal.ts` (`decimalToInput:6`, `inputToDecimal:27`, `sanitizeDecimal:37`, `normalizeDecimalInput`, `multiplyDecimalInputs`) |
| Server field errors | `src/utils/field-errors.ts` (`applyServerFieldErrors:82`) |
| Снэкбар | `src/lib/stores/store.ts` `useSnackBarStore().showMessage(msg,'success'|'error')` |
| ConfirmationModal | `src/ui/components/confirmation-modal.tsx` (`closeOnConfirm` есть) |
| Дата-форматирование | `src/components/managers/orders-catalog/components/utility.ts` (`formatDateShort` → '20 JUL 2026') |
| Токены Tailwind 4 | `src/global.css` `@theme` (`--color-textInactiveColor`, `--color-error`, `--z-modal`); `cn()` — `src/lib/utility` |
| Query defaults | `src/index.tsx` :127–138 (staleTime 5m, retry 1, no refetchOnWindowFocus) |
| Проверка типов | `yarn build:check` (tsc+build); тест-раннера НЕТ; финал — `yarn fix` |
| USDT в валютном селекте | УЖЕ есть: `EXPENSE_CURRENCIES` (`src/constants/constants.ts:49-52` = SELLING + USDT), `currency-select` строит items из него — USDT-проводка работает из коробки |
| Backend-алерты НЕ рендерятся | `GetDashboardResponse.alerts` не используется нигде (grep пуст); Health-strip — derived-алерты из `executiveAlerts.ts`. Закрывается Шагом 6b |
| Пороги алертов | `src/components/managers/page/components/alert-settings-modal.tsx` — сюда ляжет `acct_posting_lag_hours` после бекенд-follow-up (pb-поле) |
| Query-параметры генерата — camelCase | пример `orderFactor=` (`proto-http/admin/index.ts:7483`) — grpc-gateway принимает JSON-имена, доказано существующими экранами → `accountCode=`, `sourceType=` будут работать |
| `googletype_Decimal` в admin | определён прямо в `proto-http/admin/index.ts:216` — импортировать из `api/proto-http/admin`, не из common |
| zod-идиомы v4 | `import { z } from 'zod'`; `.superRefine((data,ctx)=>ctx.addIssue({code: z.ZodIssueCode.custom, message, path}))` — образец `shipping/components/schema.ts` |
| `applyServerFieldErrors` опции | `{map?, stripPrefixes?, allow?}` (`utils/field-errors.ts:3-11`), возвращает `unmapped[]` |
| Кросс-импорт `formatDateShort` | из `orders-catalog/components/utility` — уже практикуется (customer-support, order) — импортировать смело |
| `Input type='date'` | Input спредит props, `type='text'` дефолт (`ui/components/input.tsx:10`) |
| ToggleGroupField | `{name,label,items:{value: string\|number,label}[]}` — значение строковое → в схеме `side: z.enum([...])`, не boolean |
| DecimalField | `maxDecimals` дефолт **3** — для денег передавать `{2}` |
| CloseAcctPeriodResponse | `{closed: bool, notReady: string[]}` (proto :5969) — как в 05; `ListJournalEntriesResponse.total` есть (:5937) |
| ComboField = нативный datalist | `ui/form/fields/combo-field.tsx`: `{name,label,placeholder,options: string[]}` — free-text + подсказки; для счетов options `код — имя`, код извлекается на сабмите (UX 8.4) |
| CopyToClipboard | `ui/components/copyToClipboard.tsx` `{text, cutText}` — паттерн для `copy table` (TSV) |
| tabular-nums прецедент | `ui/components/media-viewer.tsx:137` и annotated-image — класс уже в ходу |

## Бэклог (фаза 2 UI — не делать сейчас, знать что попросят)

1. **CSV/print-экспорт отчётов** (TB/P&L/BS) — бухгалтер попросит первым; print-роут по
   образцу `techCardPrint` (ProtectedBare) либо CSV на клиенте из уже полученных данных.
2. **`acct_posting_lag_hours` в alert-settings-modal** — после бекенд-follow-up (поле в pb
   `AlertSettings` + dto).
3. Префилл ручной проводки из recon-item (description = order uuid, суммы из дельты).
4. Сохранённые пресеты периодов отчётов; GBP-переключатель отчётов (после бекенд-фазы 2).
5. Рендер `caveat`-текстов списком на P&L-строках (сейчас — общий блок).

## Ловушки

- **Опечатка в SECTION.accounting** = пункт меню виден всем (fail-open гейтинг). Сверить
  строку с бекендом (`rbac.go SectionAccounting = "accounting"`).
- **Radix Select: item c `value=''` кидает исключение** (комментарий в currency-select) —
  «все»-опции фильтров только через sentinel `'all'` → `undefined` в запросе.
- **ToggleGroupField не работает с boolean** — сторона строки в схеме `side: 'debit'|'credit'`,
  конверсия в `isDebit` на submit.
- **DecimalField по умолчанию пускает 3 знака** — деньги ограничивать `maxDecimals={2}`,
  иначе бекенд-DECIMAL(12,2) молча округлит.
- Generated-поля все `| undefined` — не деструктурировать без дефолтов; суммы рендерить
  через `formatBase(d)`, который сам обрабатывает undefined.
- `googletype_Decimal` НЕ `common_Decimal` — импорт из `api/proto-http/admin` (реэкспорт)
  или `api/proto-http/common`; посмотреть, как импортирует opex.
- В модалке ручной проводки клиентский Σdebit==Σcredit — только для base-строк; со
  src-строками валидацию делает бекенд (курс знает только он) — не блокировать submit.
- Не редактировать `src/api/proto-http/*` руками — только `make proto`.
- Формы — только RHF+zod; не копировать yup/formik из старых экранов.
- `console.log('[BE] ...')` в api.ts — намеренный дебаг, не чинить (CLAUDE.md).
- Alias-импорты (`api/api`, `ui/components/button`, `constants/routes`) — не относительные.
- Worktree: репо — checkout ветки `beta`; перед коммитом проверить `git status -sb`
  (CLAUDE.md клиента предупреждает).
