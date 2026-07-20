# Часть 3: экраны Chart of Accounts и Journal

## 3.1 Chart of Accounts (`/accounting/accounts`)

Простой экран: таблица + модалка. Образец таблицы — `members-table.tsx` (самодельная
`<table>`, COLUMNS-массив, `overflow-x-auto`).

- Данные: `useAcctAccounts(includeArchived)` + чекбокс `show archived`.
- Колонки: `code · name · section · statement · system · archived · [actions]`.
  Группировка визуальная: сортировка по code (приходит с бекенда), section бейджем.
- Actions (гейт `canWriteAcct`): `rename` (модалка с одним полем name), `archive/unarchive`
  (ConfirmationModal). Для `is_system=true` — actions скрыты, tooltip «system account —
  managed by posting rules» (бекенд всё равно вернёт FailedPrecondition).
- `+ new account` — модалка RHF+zod (`schema.ts`):

```ts
export const accountSchema = z.object({
  code: z.string().regex(/^\d{4}$/, '4-digit code'),
  name: z.string().min(1),
  section: z.enum(['asset','liability','equity','revenue','cogs','opex']),
  statement: z.enum(['BS','PL']),
});
```

  Поля: InputField(code), InputField(name), SelectField(section — из constants),
  SelectField(statement). Submit → `useCreateAccount` → снэкбар `'Account created'`.
  Дубль кода вернёт ошибку бекенда → тост.

## 3.2 Journal (`/accounting`) — главный экран раздела

### Список

- Фильтры (`entries-filter.tsx`, локальный state + debounce 400 мс по образцу members):
  `from`/`to` (Input type='date', дефолт — текущий месяц; кнопка-пресет `all time` сбрасывает
  диапазон — иначе старые проводки «пропадают» для нового пользователя), `account`
  (SelectField по данным
  `useAcctAccounts` — label `${code} — ${name}`), `source type` (SelectField из
  SOURCE_TYPES-констант), пагинация PAGE_SIZE=50 prev/next `{from}–{to} of {total}`.
  **Radix-ловушка**: item со `value=''` кидает исключение (задокументировано в
  currency-select) — для «все» использовать sentinel `value='all'` и мапить в `undefined`
  при сборке запроса.
- Таблица (`entries-table.tsx`): `date · id · description · source · total · flags`.
  `source` — `sourceTypeLabel(source_type)` + `source_key` муted-текстом; для `order_sale`/
  `order_refund` — source_key это uuid заказа → `<Link to={/orders/${uuid}}>` (существующий
  ROUTES.orderDetails). `flags`: caveat-badge (has_caveat), `REV`-бейдж если reversed_by
  (перечёркнутый стиль) или reversal_of (метка `reversal`).
- Клик по строке → `entry-detail-modal.tsx`.

### Деталка (`entry-detail-modal.tsx`)

- `useJournalEntry(id)`; шапка: date, description, source_type+source_key(ссылкой если заказ),
  created_by, caveat полностью.
- Таблица строк: `account (code — name) · debit · credit · note` + итоговая строка
  Σdebit / Σcredit + balanced-badge.
- Кнопка `reverse` (canWriteAcct; скрыта если reversed_by уже стоит или source_type='reversal')
  → `reverse-confirm.tsx` (ConfirmationModal, `closeOnConfirm={false}`, поле reason
  обязательное) → `useReverseJournalEntry` → `'Entry reversed'` / тост ошибки
  (`already reversed`, `cannot reverse a reversal` — бекенд-текст).

### Ручная проводка (`manual-entry-modal.tsx` + `schema.ts`) — самая сложная форма

Референс паттерна: `upsert-shipping.tsx` (RHF+zod+Form) + `line-form.tsx` (деньги).

```ts
const lineSchema = z.object({
  accountCode: z.string().min(1, 'account required'),
  side: z.enum(['debit','credit']),             // НЕ boolean: ToggleGroupField работает со
                                                // string-value items ({value:'debit'|'credit'});
                                                // в pb конвертится на submit: isDebit = side==='debit'
  amountMode: z.enum(['base','src']),           // EUR напрямую или валюта+курс на бекенде
  amount: z.string().optional(),                // decimal-строка (sanitizeDecimal)
  amountSrc: z.string().optional(),
  currencySrc: z.string().optional(),           // из currency-select (ui/form/fields)
  note: z.string().max(255).optional(),
}).superRefine(/* base → amount>0 обязателен; src → amountSrc>0 и currencySrc */);

export const manualEntrySchema = z.object({
  occurredAt: z.string().min(1)                 // YYYY-MM-DD, дефолт сегодня
    .refine((v) => v <= addDays(new Date(), 1).toISOString().slice(0, 10),
      'date cannot be in the future'),          // зеркалит бекенд-правило «≤ today+1» — fail-fast
  description: z.string().min(1).max(512),
  lines: z.array(lineSchema).min(2, 'at least 2 lines'),
}).superRefine((v, ctx) => { /* клиентская проверка Σdebit==Σcredit ТОЛЬКО для строк
  в base-режиме и когда src-строк нет: при src-строках баланс знает только бекенд
  (конвертация курсом) — тогда проверку пропускаем, полагаясь на серверную */ });
```

- `useFieldArray` для lines; каждая строка: **ComboField**(account — options
  `` `${code} — ${name}` `` из useAcctAccounts не-archived; datalist даёт поиск по коду и
  имени; сабмит извлекает 4-значный код, zod проверяет «код существует» — UX 8.4),
  ToggleGroupField(side: items debit/credit), DecimalField(amount | amountSrc,
  **`maxDecimals={2}`** — дефолт компонента 3, деньги требуют 2) + CurrencySelect при
  src-режиме, InputField(note). `+ add line` / `duplicate` / `[x]` удалить (мин 2).
- UX-обязательно (8.4): кнопка `balance` на последней строке (подставляет разницу),
  autofocus на description, Enter в последнем поле = add line, Esc через dirty-guard
  (`formState.isDirty` → ConfirmationModal `Discard unsaved entry?`), disabled submit при
  явном дисбалансе base-строк, подпись `balance validated on server (FX)` при src-строках.
- Живой футер: Σdebit / Σcredit / difference (подсветка error пока ≠, только base-режим).
- Типовые шаблоны кнопками-пресетами над формой (заполняют 2 строки): `Stripe payout`
  (1010/1030), `Supplier payment` (2010/1010), `OPEX payment` (2030/1010), `VAT remittance`
  (2070/1010), `Invoice paid` (1010/1040) — из бекенд-плана 04 §MN; просто префилл, всё
  редактируемо.
- Submit: собрать `CreateJournalEntryRequest` (`inputToDecimal` на суммы; в base-режиме слать
  только `amount`, в src — `amountSrc`+`currencySrc`), `useCreateJournalEntry`, при ошибке —
  `applyServerFieldErrors` + общий тост (бекенд-тексты: unbalanced / unknown account /
  closed period / add CCY costing fx rate first), успех → `'Entry created'`, закрыть,
  инвалидация утащит список.

### Пустое состояние

Леджер до включения бекенд-флага пуст: показать плейсхолдер `no entries yet` + короткую
строку «postings appear automatically once accounting is enabled on the backend».
