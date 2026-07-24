import { ROUTES } from 'constants/routes';
import { parseDecimalNumber } from 'utils/decimal';

// Business-case wizard catalog ("+ new entry"). Every scenario is a plain-words business event
// with the accounting SPECIFIED here — hardcoded Dr/Cr per the posting-rules doc, never chosen by
// the UI at runtime. The wizard renders `fields`, calls `build(answers)` and posts the result;
// `route` cases post nothing and navigate to the screen that owns the flow instead (materials /
// opex post their own entries — booking those here by hand would double-count).
//
// Conventions the wizard relies on:
// - every entry scenario has a `date` field with id 'date' (defaultToday) — it becomes occurredAt
//   (and acquiredOn for the equipment fixed asset) — and a trailing free-text 'memo' appended to
//   the description;
// - amounts are base-EUR strings (non-EUR belongs in manual (advanced) with FX) validated > 0;
// - a supplier answer is stored as the numeric id under the field id, with the display name under
//   `<id>Name` (the wizard sets both when the Selector changes);
// - description = `[<scenario.id>] <title>` + appended what/memo, so entries stay searchable and
//   traceable back to the case that produced them.

export type WizardField =
  | {
      kind: 'amount';
      id: string;
      label: string;
      hint?: string;
      required?: boolean;
      defaultValue?: string;
    }
  | {
      kind: 'text';
      id: string;
      label: string;
      hint?: string;
      required?: boolean;
      placeholder?: string;
    }
  | { kind: 'date'; id: string; label: string; defaultToday?: boolean }
  | {
      kind: 'select';
      id: string;
      label: string;
      options: { value: string; label: string }[];
      defaultValue?: string;
      hint?: string;
    }
  | { kind: 'toggle'; id: string; label: string; defaultValue?: boolean; hint?: string }
  | { kind: 'supplier'; id: string; label: string; required?: boolean }
  | { kind: 'number'; id: string; label: string; hint?: string; defaultValue?: string };

export type WizardLine = {
  accountCode: string;
  accountName: string;
  side: 'debit' | 'credit';
  amount: string;
  note?: string;
};

export type WizardResult = {
  // Final entry description, prefixed `[case-id] `.
  description: string;
  // MUST balance (Σdebit == Σcredit) — the wizard re-checks defensively and refuses to post.
  lines: WizardLine[];
  supplierId?: number;
  // Shown on review as warning callouts.
  caveats: string[];
  // "after posting, also do:" — shown on review AND as a follow-up toast.
  checklist: string[];
  // Created BEFORE the entry (reports → fixed assets register).
  fixedAsset?: { name: string; cost: string; acquiredOn: string; usefulLifeMonths: number };
};

export type WizardScenario = {
  id: string;
  group: string;
  title: string;
  emoji?: string;
  // RU+EN search words.
  keywords: string[];
  // One plain sentence: what this case means.
  what: string;
  fields?: WizardField[];
  build?: (a: Record<string, any>) => WizardResult | { error: string };
  // Router case: no entry — navigate with an explanation.
  route?: { to: string; hint: string };
};

// Code → name map matching the chart-of-accounts seed (01-db-schema.md). Display only — the
// backend resolves accounts by code; a drifted name here mislabels the review table, nothing more.
export const ACCOUNT_NAMES: Record<string, string> = {
  '1010': 'Cash – Bank',
  '1030': 'Payment Processor (Stripe)',
  '1040': 'Accounts Receivable',
  '1130': 'Finished Goods',
  '1210': 'Prepaid Expenses',
  '1220': 'Equipment',
  '2010': 'Accounts Payable',
  '2015': "Director's Loan",
  '2030': 'Accrued Expenses',
  '2045': 'Payroll Taxes Payable',
  '2050': 'Income Tax Payable',
  '2060': 'Loans (other)',
  '2070': 'VAT Payable',
  '2080': 'VAT Input (Recoverable)',
  '3010': "Owner's Equity",
  '3030': 'Draws / Distributions',
  '5040': 'Inventory Write-offs',
  '6010': 'Transportation & Office Logistics',
  '6060': 'Bank Fees',
  '6110': 'Advertising & Marketing',
  '6125': 'Production Content',
  '6210': 'Samples & Prototyping',
  '6320': 'Software & Subscriptions',
  '6350': 'Professional Services',
  '6390': 'Other Operating Expenses',
};

const AMOUNT_HINT = 'EUR — non-EUR? use manual (advanced) with FX';
const COST_HINT = "the item's COST price (product card → cost_price), not the retail price";
const SELF_SUPPLY_VAT_HINT =
  'PL: giving goods away can owe output VAT on cost (nieodpłatne przekazanie) when input VAT was ' +
  'deducted — confirm the amount with the accountant; 0/empty = none';

const G_MONEY = 'money in / out (bank)';
const G_BUY = 'buying things';
const G_GIVE = 'product & samples given away';
const G_FIX = 'fixes & other';

// ---- Small builders ----

function amt(a: Record<string, any>, id: string): number {
  const n = parseDecimalNumber(String(a[id] ?? ''));
  return Number.isFinite(n) ? n : 0;
}

function str(a: Record<string, any>, id: string): string {
  return String(a[id] ?? '').trim();
}

function ln(
  accountCode: string,
  side: 'debit' | 'credit',
  amount: number,
  note?: string,
): WizardLine {
  return {
    accountCode,
    accountName: ACCOUNT_NAMES[accountCode] ?? accountCode,
    side,
    amount: amount.toFixed(2),
    note,
  };
}

function describe(id: string, title: string, ...extras: (string | undefined)[]): string {
  const tail = extras
    .map((e) => (e ?? '').trim())
    .filter(Boolean)
    .join(' — ');
  return tail ? `[${id}] ${title} — ${tail}` : `[${id}] ${title}`;
}

const dateField = (label = 'date'): WizardField => ({
  kind: 'date',
  id: 'date',
  label,
  defaultToday: true,
});
const memoField = (): WizardField => ({
  kind: 'text',
  id: 'memo',
  label: 'memo (optional)',
  placeholder: 'appended to the entry description',
});
const amountField = (label = 'amount (EUR)'): WizardField => ({
  kind: 'amount',
  id: 'amount',
  label,
  required: true,
  hint: AMOUNT_HINT,
});
const supplierField = (label = 'supplier', required = true): WizardField => ({
  kind: 'supplier',
  id: 'supplier',
  label,
  required,
});

// A plain Dr X / Cr Y money move for a single amount — most of the "money in / out" group.
function transfer(opts: {
  id: string;
  group: string;
  title: string;
  emoji?: string;
  keywords: string[];
  what: string;
  debit: string;
  credit: string;
  caveats?: string[];
  checklist?: string[];
}): WizardScenario {
  const { id, title, debit, credit, caveats = [], checklist = [] } = opts;
  return {
    id,
    group: opts.group,
    title,
    emoji: opts.emoji,
    keywords: opts.keywords,
    what: opts.what,
    fields: [amountField(), dateField(), memoField()],
    build: (a) => {
      const amount = amt(a, 'amount');
      if (!(amount > 0)) return { error: 'amount must be greater than 0' };
      return {
        description: describe(id, title, str(a, 'memo')),
        lines: [ln(debit, 'debit', amount), ln(credit, 'credit', amount)],
        caveats,
        checklist,
      };
    },
  };
}

const EXPENSE_CATEGORY_OPTIONS = [
  { value: '6110', label: 'marketing (6110)' },
  { value: '6010', label: 'logistics (6010)' },
  { value: '6060', label: 'bank fees (6060)' },
  { value: '6320', label: 'software (6320)' },
  { value: '6350', label: 'professional services (6350)' },
  { value: '6125', label: 'production content (6125)' },
  { value: '6390', label: 'other (6390)' },
];

// ---- The catalog ----

export const WIZARD_SCENARIOS: WizardScenario[] = [
  // ---- money in / out (bank) ----
  transfer({
    id: 'stripe-payout',
    group: G_MONEY,
    title: 'stripe paid out to the bank',
    emoji: '💸',
    keywords: ['stripe', 'payout', 'страйп', 'выплата', 'банк', 'bank', 'перевод'],
    what: 'stripe collected card money and transferred the balance to the bank account',
    debit: '1010',
    credit: '1030',
    caveats: [
      'prefer posting this from the bank inbox when you import the CSV — then the statement line ' +
        'links to the entry',
    ],
    checklist: [
      'when the line appears in the bank import, IGNORE it there (already booked) or post from ' +
        'there instead next time',
    ],
  }),
  transfer({
    id: 'owner-money-in',
    group: G_MONEY,
    title: 'I put my own money into the company',
    keywords: ['капитал', 'взнос', 'вложил', 'свои деньги', 'внес', 'owner', 'capital', 'equity'],
    what: 'a capital contribution — your money becomes company equity, not a loan',
    debit: '1010',
    credit: '3010',
  }),
  transfer({
    id: 'owner-money-out',
    group: G_MONEY,
    title: 'I took money out (draw / dividend)',
    keywords: ['дивиденд', 'вывел', 'забрал', 'себе', 'draw', 'dividend', 'distribution'],
    what: 'an owner draw / dividend — reduces equity, not an expense',
    debit: '3030',
    credit: '1010',
    caveats: ['a UK Ltd distribution should be minuted as a dividend — keep the paperwork'],
  }),
  transfer({
    id: 'directors-loan-in',
    group: G_MONEY,
    title: 'I lent the company my money (it will pay me back)',
    keywords: ['займ', 'заем', 'одолжил', 'в долг', 'директор', 'loan', 'director', 'lent'],
    what: 'your money goes in as a loan the company owes back to you',
    debit: '1010',
    credit: '2015',
  }),
  transfer({
    id: 'directors-loan-repay',
    group: G_MONEY,
    title: 'the company paid me back',
    keywords: ['вернула', 'возврат займа', 'отдала долг', 'repay', 'loan back', 'директор'],
    what: "the company returns part of the director's loan to you",
    debit: '2015',
    credit: '1010',
  }),
  transfer({
    id: 'other-loan-in',
    group: G_MONEY,
    title: 'someone else lent the company money',
    keywords: ['кредит', 'займ от', 'одолжили', 'инвестор', 'borrowed', 'loan in'],
    what: 'borrowed money arrives — cash up, a loan liability up',
    debit: '1010',
    credit: '2060',
  }),
  transfer({
    id: 'other-loan-repay',
    group: G_MONEY,
    title: 'the company repaid an outside loan',
    keywords: ['погасили кредит', 'вернули займ', 'выплата кредита', 'repay loan'],
    what: 'loan principal goes back — cash down, the liability down',
    debit: '2060',
    credit: '1010',
  }),
  transfer({
    id: 'vat-paid',
    group: G_MONEY,
    title: 'paid VAT to the tax office',
    keywords: ['ндс', 'налоговая', 'заплатил ндс', 'vat', 'urząd', 'jpk', 'tax office'],
    what: 'settles the VAT owed to the tax office from the bank',
    debit: '2070',
    credit: '1010',
  }),
  transfer({
    id: 'corptax-paid',
    group: G_MONEY,
    title: 'paid corporation tax',
    keywords: ['налог на прибыль', 'корпоративный налог', 'cit', 'corporation tax', 'income tax'],
    what: 'settles corporation / income tax from the bank',
    debit: '2050',
    credit: '1010',
  }),
  transfer({
    id: 'payroll-tax-paid',
    group: G_MONEY,
    title: 'paid PIT / ZUS (payroll taxes)',
    keywords: ['zus', 'pit', 'зус', 'взносы', 'зарплатные налоги', 'payroll', 'соцвзносы'],
    what: 'settles accrued payroll taxes (PIT / ZUS) from the bank',
    debit: '2045',
    credit: '1010',
  }),
  transfer({
    id: 'pay-accrued-bill',
    group: G_MONEY,
    title: "paid a bill that's already in OPEX (rent, software, salary…)",
    keywords: [
      'счет',
      'аренда',
      'зарплата',
      'опекс',
      'оплатил счет',
      'софт',
      'rent',
      'salary',
      'opex',
      'accrued',
      'bill',
    ],
    what: 'pays a cost that OPEX already accrued — clears the accrued-expenses liability',
    debit: '2030',
    credit: '1010',
    caveats: [
      "if this cost was NEVER entered in OPEX, don't use this case — the expense would go " +
        'missing; if you pay it straight to a 6xxx account instead, it double-counts. OPEX ' +
        'first, then this.',
    ],
  }),
  {
    id: 'pay-supplier',
    group: G_MONEY,
    title: 'paid a supplier (materials / production invoice)',
    keywords: [
      'поставщик',
      'оплата поставщику',
      'фактура',
      'производство',
      'supplier',
      'invoice',
      'payable',
    ],
    what: 'pays a supplier invoice that sits in accounts payable, tagged to the supplier',
    fields: [supplierField(), amountField(), dateField(), memoField()],
    build: (a) => {
      const amount = amt(a, 'amount');
      if (!(amount > 0)) return { error: 'amount must be greater than 0' };
      if (!a.supplier)
        return { error: 'pick the supplier — 2010 postings are tracked per supplier' };
      return {
        description: describe(
          'pay-supplier',
          'paid a supplier (materials / production invoice)',
          str(a, 'supplierName'),
          str(a, 'memo'),
        ),
        lines: [ln('2010', 'debit', amount), ln('1010', 'credit', amount)],
        supplierId: Number(a.supplier),
        caveats: [],
        checklist: [],
      };
    },
  },
  transfer({
    id: 'invoice-customer-paid',
    group: G_MONEY,
    title: 'a customer paid our invoice by bank transfer',
    keywords: [
      'клиент оплатил',
      'перевод от клиента',
      'дебиторка',
      'customer',
      'invoice paid',
      'receivable',
      'bank transfer',
    ],
    what: 'clears the customer receivable — the invoiced order is now paid',
    debit: '1010',
    credit: '1040',
    checklist: ["mark the order paid in orders if it isn't yet"],
  }),

  // ---- buying things ----
  {
    id: 'equipment',
    group: G_BUY,
    title: 'bought equipment (sewing machine, computer, iron…)',
    emoji: '🧵',
    keywords: [
      'оборудование',
      'швейная машина',
      'компьютер',
      'утюг',
      'станок',
      'техника',
      'основное средство',
      'sewing machine',
      'computer',
      'iron',
      'equipment',
      'asset',
    ],
    what: 'registers a fixed asset and books the purchase; the cost spreads monthly via depreciation',
    fields: [
      {
        kind: 'text',
        id: 'name',
        label: 'name',
        required: true,
        placeholder: 'e.g. juki DDL-8700',
      },
      { kind: 'amount', id: 'net', label: 'net cost (EUR)', required: true, hint: AMOUNT_HINT },
      {
        kind: 'amount',
        id: 'vat',
        label: 'input VAT (EUR, optional)',
        hint: 'only with a proper invoice to the company (NIP); 0 if none',
      },
      {
        kind: 'number',
        id: 'life',
        label: 'useful life (months)',
        defaultValue: '60',
        hint: '60 = 5 years straight-line',
      },
      {
        kind: 'select',
        id: 'paidWith',
        label: 'paid with',
        options: [
          { value: 'bank', label: 'bank now' },
          { value: 'account', label: 'on account (supplier invoice, pay later)' },
          { value: 'own', label: 'my own money' },
        ],
        defaultValue: 'bank',
      },
      supplierField('supplier (required when paying on account)', false),
      dateField('date (purchase & asset acquired-on)'),
      memoField(),
    ],
    build: (a) => {
      const net = amt(a, 'net');
      if (!(net > 0)) return { error: 'net cost must be greater than 0' };
      const vat = amt(a, 'vat');
      const life = Math.round(amt(a, 'life'));
      if (!(life > 0)) return { error: 'useful life must be a positive number of months' };
      const credit = a.paidWith === 'account' ? '2010' : a.paidWith === 'own' ? '2015' : '1010';
      if (credit === '2010' && !a.supplier) {
        return { error: 'paying on account creates a supplier invoice — pick the supplier' };
      }
      const lines = [ln('1220', 'debit', net)];
      if (vat > 0) lines.push(ln('2080', 'debit', vat, 'input VAT'));
      lines.push(ln(credit, 'credit', net + vat));
      return {
        description: describe(
          'equipment',
          'bought equipment (sewing machine, computer, iron…)',
          str(a, 'name'),
          str(a, 'memo'),
        ),
        lines,
        supplierId: credit === '2010' ? Number(a.supplier) : undefined,
        caveats: vat > 0 ? ['deducting VAT needs a company-addressed invoice'] : [],
        checklist: [
          'depreciation posts monthly from the fixed-asset register — reports → fixed assets → ' +
            'post depreciation',
          "keep the invoice — it's the JPK register document",
        ],
        fixedAsset: {
          name: str(a, 'name'),
          cost: net.toFixed(2),
          acquiredOn: str(a, 'date'),
          usefulLifeMonths: life,
        },
      };
    },
  },
  {
    id: 'materials-route',
    group: G_BUY,
    title: 'bought materials / fabric / trims',
    keywords: [
      'материалы',
      'ткань',
      'фурнитура',
      'нитки',
      'молния',
      'materials',
      'fabric',
      'trims',
      'zipper',
    ],
    what: 'materials go through the warehouse, which posts the entry itself',
    route: {
      to: ROUTES.materials,
      hint:
        'materials are received into the warehouse (materials → catalog → receive): unit cost ' +
        'NET, VAT and supplier there — the journal entry posts automatically. Booking them here ' +
        'by hand would double-count.',
    },
  },
  {
    id: 'monthly-cost-route',
    group: G_BUY,
    title:
      'recurring or invoiced running cost (rent, software, marketing, PAID influencer, ' +
      'accountant, salaries)',
    keywords: [
      'аренда',
      'подписка',
      'софт',
      'зарплата',
      'бухгалтер',
      'инфлюенсер за деньги',
      'маркетинг',
      'опекс',
      'rent',
      'subscription',
      'software',
      'salary',
      'accountant',
      'influencer',
      'marketing',
      'opex',
    ],
    what: 'running costs live in OPEX, which posts the monthly accrual itself',
    route: {
      to: ROUTES.opex,
      hint:
        'enter it as an OPEX line with its VAT and invoice fields — the monthly accrual entry ' +
        'posts automatically and the VAT is reclaimed.',
    },
  },
  {
    id: 'small-expense',
    group: G_BUY,
    title: 'one-off small cost from the bank (no invoice, not recurring)',
    keywords: [
      'мелкий расход',
      'разовый',
      'без счета',
      'комиссия',
      'one-off',
      'small expense',
      'no invoice',
    ],
    what: 'books a one-off cost straight from the bank to an expense account',
    fields: [
      {
        kind: 'select',
        id: 'category',
        label: 'category',
        options: EXPENSE_CATEGORY_OPTIONS,
        defaultValue: '6110',
      },
      amountField(),
      dateField(),
      memoField(),
    ],
    build: (a) => {
      const amount = amt(a, 'amount');
      if (!(amount > 0)) return { error: 'amount must be greater than 0' };
      const category = str(a, 'category') || '6390';
      return {
        description: describe(
          'small-expense',
          'one-off small cost from the bank (no invoice, not recurring)',
          str(a, 'memo'),
        ),
        lines: [ln(category, 'debit', amount), ln('1010', 'credit', amount)],
        caveats: ['if there IS a VAT invoice, put it in OPEX instead — otherwise the VAT is lost.'],
        checklist: [],
      };
    },
  },
  {
    id: 'owner-paid-expense',
    group: G_BUY,
    title: 'I paid a company cost with my personal card',
    keywords: [
      'личная карта',
      'своей картой',
      'заплатил сам',
      'из своих',
      'компенсация',
      'personal card',
      'reimburse',
      'out of pocket',
    ],
    what: "a company expense paid personally — the company owes you via the director's loan",
    fields: [
      {
        kind: 'select',
        id: 'category',
        label: 'category',
        options: EXPENSE_CATEGORY_OPTIONS,
        defaultValue: '6110',
      },
      { kind: 'amount', id: 'net', label: 'net amount (EUR)', required: true, hint: AMOUNT_HINT },
      {
        kind: 'amount',
        id: 'vat',
        label: 'VAT amount (EUR, optional)',
        hint: 'only with a company invoice',
      },
      dateField(),
      memoField(),
    ],
    build: (a) => {
      const net = amt(a, 'net');
      if (!(net > 0)) return { error: 'net amount must be greater than 0' };
      const vat = amt(a, 'vat');
      const category = str(a, 'category') || '6390';
      const lines = [ln(category, 'debit', net)];
      if (vat > 0) lines.push(ln('2080', 'debit', vat, 'input VAT'));
      lines.push(ln('2015', 'credit', net + vat));
      return {
        description: describe(
          'owner-paid-expense',
          'I paid a company cost with my personal card',
          str(a, 'memo'),
        ),
        lines,
        caveats: [],
        checklist: [
          "the company now owes you — repay via 'the company paid me back' when convenient",
        ],
      };
    },
  },
  {
    id: 'supplier-advance',
    group: G_BUY,
    title: 'paid a supplier in advance (deposit)',
    keywords: [
      'аванс',
      'предоплата',
      'депозит',
      'задаток',
      'advance',
      'deposit',
      'prepayment',
      'upfront',
    ],
    what: 'money paid before the invoice — parks in prepaid expenses until it arrives',
    fields: [
      supplierField(),
      amountField(),
      {
        kind: 'select',
        id: 'paidWith',
        label: 'paid with',
        options: [
          { value: 'bank', label: 'bank now' },
          { value: 'own', label: 'my own money' },
        ],
        defaultValue: 'bank',
      },
      dateField(),
      memoField(),
    ],
    build: (a) => {
      const amount = amt(a, 'amount');
      if (!(amount > 0)) return { error: 'amount must be greater than 0' };
      if (!a.supplier) return { error: 'pick the supplier — the advance is tracked by its note' };
      const credit = a.paidWith === 'own' ? '2015' : '1010';
      const name = str(a, 'supplierName');
      return {
        description: describe(
          'supplier-advance',
          'paid a supplier in advance (deposit)',
          name,
          str(a, 'memo'),
        ),
        lines: [
          ln('1210', 'debit', amount, name ? `advance — ${name}` : 'advance'),
          ln(credit, 'credit', amount),
        ],
        caveats: [],
        checklist: [
          "when the invoice/receipt arrives, book the receipt normally, then use 'settle a " +
            "supplier advance'",
        ],
      };
    },
  },
  {
    id: 'supplier-advance-settle',
    group: G_BUY,
    title: 'the invoice for an advance arrived (settle the deposit)',
    keywords: [
      'зачет аванса',
      'закрыть аванс',
      'фактура пришла',
      'settle advance',
      'invoice arrived',
      'deposit',
    ],
    what: 'moves the parked prepayment against the supplier invoice in payables',
    fields: [supplierField(), amountField(), dateField(), memoField()],
    build: (a) => {
      const amount = amt(a, 'amount');
      if (!(amount > 0)) return { error: 'amount must be greater than 0' };
      if (!a.supplier)
        return { error: 'pick the supplier — 2010 postings are tracked per supplier' };
      return {
        description: describe(
          'supplier-advance-settle',
          'the invoice for an advance arrived (settle the deposit)',
          str(a, 'supplierName'),
          str(a, 'memo'),
        ),
        lines: [ln('2010', 'debit', amount), ln('1210', 'credit', amount)],
        supplierId: Number(a.supplier),
        caveats: [],
        checklist: [],
      };
    },
  },

  // ---- product & samples given away ----
  {
    id: 'gift-influencer',
    group: G_GIVE,
    title: 'gave a product to an influencer for free (marketing)',
    emoji: '🎁',
    keywords: [
      'инфлюенсер',
      'блогер',
      'подарок',
      'бесплатно',
      'посев',
      'отправил бесплатно',
      'influencer',
      'blogger',
      'gift',
      'free',
      'pr',
      'seeding',
    ],
    what: 'stock leaves for marketing — its cost becomes a marketing (or samples) expense',
    fields: [
      { kind: 'text', id: 'what', label: 'what', required: true, placeholder: 'hoodie XL black' },
      { kind: 'amount', id: 'cost', label: 'cost (EUR)', required: true, hint: COST_HINT },
      {
        kind: 'toggle',
        id: 'isSample',
        label: "it's a sample, not sellable stock",
        defaultValue: false,
      },
      {
        kind: 'amount',
        id: 'selfSupplyVat',
        label: 'self-supply VAT (EUR, optional)',
        defaultValue: '',
        hint: SELF_SUPPLY_VAT_HINT,
      },
      dateField(),
      memoField(),
    ],
    build: (a) => {
      const cost = amt(a, 'cost');
      if (!(cost > 0)) return { error: 'cost must be greater than 0' };
      const vat = amt(a, 'selfSupplyVat');
      const expense = a.isSample ? '6210' : '6110';
      const lines = [ln(expense, 'debit', cost), ln('1130', 'credit', cost)];
      if (vat > 0) {
        lines.push(ln(expense, 'debit', vat, 'self-supply VAT'));
        lines.push(ln('2070', 'credit', vat, 'self-supply VAT'));
      }
      return {
        description: describe(
          'gift-influencer',
          'gave a product to an influencer for free (marketing)',
          str(a, 'what'),
          str(a, 'memo'),
        ),
        lines,
        caveats: [],
        checklist: [
          'remove the unit from sellable stock in the product catalog',
          'save proof of the marketing purpose (agreement / the post itself)',
        ],
      };
    },
  },
  {
    id: 'gift-personal',
    group: G_GIVE,
    title: 'took a product for myself / gifted a friend (not marketing)',
    keywords: [
      'себе',
      'для себя',
      'другу',
      'подарил',
      'забрал товар',
      'personal',
      'friend',
      'took',
      'myself',
    ],
    what: 'stock taken privately — an owner distribution at cost, not an expense',
    fields: [
      { kind: 'text', id: 'what', label: 'what', required: true, placeholder: 'hoodie XL black' },
      { kind: 'amount', id: 'cost', label: 'cost (EUR)', required: true, hint: COST_HINT },
      {
        kind: 'amount',
        id: 'selfSupplyVat',
        label: 'self-supply VAT (EUR, optional)',
        defaultValue: '',
        hint: SELF_SUPPLY_VAT_HINT,
      },
      dateField(),
      memoField(),
    ],
    build: (a) => {
      const cost = amt(a, 'cost');
      if (!(cost > 0)) return { error: 'cost must be greater than 0' };
      const vat = amt(a, 'selfSupplyVat');
      const lines = [ln('3030', 'debit', cost + vat), ln('1130', 'credit', cost)];
      if (vat > 0) lines.push(ln('2070', 'credit', vat, 'self-supply VAT'));
      return {
        description: describe(
          'gift-personal',
          'took a product for myself / gifted a friend (not marketing)',
          str(a, 'what'),
          str(a, 'memo'),
        ),
        lines,
        caveats: ['this is an owner distribution, not an expense — it does not reduce profit'],
        checklist: ['remove the unit from sellable stock in the product catalog'],
      };
    },
  },
  {
    id: 'product-writeoff',
    group: G_GIVE,
    title: 'finished product damaged / lost',
    keywords: [
      'брак',
      'испорчен',
      'потерян',
      'списание',
      'дефект',
      'damaged',
      'lost',
      'write-off',
      'writeoff',
    ],
    what: 'damaged / lost finished stock leaves inventory as a write-off cost',
    fields: [
      { kind: 'text', id: 'what', label: 'what', required: true, placeholder: 'hoodie XL black' },
      { kind: 'amount', id: 'cost', label: 'cost (EUR)', required: true, hint: COST_HINT },
      dateField(),
      memoField(),
    ],
    build: (a) => {
      const cost = amt(a, 'cost');
      if (!(cost > 0)) return { error: 'cost must be greater than 0' };
      return {
        description: describe(
          'product-writeoff',
          'finished product damaged / lost',
          str(a, 'what'),
          str(a, 'memo'),
        ),
        lines: [ln('5040', 'debit', cost), ln('1130', 'credit', cost)],
        caveats: [
          'raw MATERIALS are written off in the warehouse (materials → write-off), not here',
        ],
        checklist: ['remove the unit from stock; keep a photo/note of the damage'],
      };
    },
  },
  {
    id: 'product-to-content',
    group: G_GIVE,
    title: 'product permanently used for content / showroom (never coming back)',
    keywords: [
      'контент',
      'съемка',
      'шоурум',
      'витрина',
      'content',
      'shoot',
      'showroom',
      'lookbook',
    ],
    what: 'finished stock permanently consumed for content / showroom becomes an expense',
    fields: [
      { kind: 'text', id: 'what', label: 'what', required: true, placeholder: 'hoodie XL black' },
      { kind: 'amount', id: 'cost', label: 'cost (EUR)', required: true, hint: COST_HINT },
      dateField(),
      memoField(),
    ],
    build: (a) => {
      const cost = amt(a, 'cost');
      if (!(cost > 0)) return { error: 'cost must be greater than 0' };
      return {
        description: describe(
          'product-to-content',
          'product permanently used for content / showroom (never coming back)',
          str(a, 'what'),
          str(a, 'memo'),
        ),
        lines: [ln('6125', 'debit', cost), ln('1130', 'credit', cost)],
        caveats: [
          "if it comes back to sellable stock later, don't book anything — moving location is " +
            'not an expense',
        ],
        checklist: [],
      };
    },
  },

  // ---- fixes & other ----
  {
    id: 'fix-mistake',
    group: G_FIX,
    title: 'I booked something wrong and want to fix it',
    keywords: [
      'ошибка',
      'исправить',
      'неправильно',
      'сторно',
      'отменить',
      'удалить',
      'mistake',
      'fix',
      'wrong',
      'reverse',
      'undo',
    ],
    what: 'wrong entries are reversed with a mirror entry, then rebooked correctly',
    route: {
      to: ROUTES.accounting,
      hint:
        'find the entry → reverse (posts the mirror) → book it again correctly with the wizard. ' +
        'Nothing is ever deleted — the fix is always a new entry.',
    },
  },
  {
    id: 'other-income',
    group: G_FIX,
    title: 'other money arrived (deposit refund, compensation…)',
    keywords: [
      'возврат',
      'компенсация',
      'прочий доход',
      'пришли деньги',
      'вернули депозит',
      'refund',
      'compensation',
      'other income',
    ],
    what: 'money arrived that is not a customer sale — classify what it repays',
    fields: [
      {
        kind: 'text',
        id: 'whatFor',
        label: 'what for',
        placeholder: 'e.g. studio deposit returned',
      },
      amountField(),
      {
        kind: 'select',
        id: 'kind',
        label: 'what is it',
        options: [
          { value: '1210', label: 'a refund of something we prepaid' },
          { value: '2015', label: 'money I put in as a loan (the company owes me back)' },
          { value: '6390', label: 'other / not sure' },
        ],
        defaultValue: '1210',
      },
      dateField(),
      memoField(),
    ],
    build: (a) => {
      const amount = amt(a, 'amount');
      if (!(amount > 0)) return { error: 'amount must be greater than 0' };
      const kind = str(a, 'kind') || '6390';
      const note = kind === '6390' ? 'other income — reclassify with accountant' : undefined;
      return {
        description: describe(
          'other-income',
          'other money arrived (deposit refund, compensation…)',
          str(a, 'whatFor'),
          str(a, 'memo'),
        ),
        lines: [ln('1010', 'debit', amount), ln(kind, 'credit', amount, note)],
        caveats:
          kind === '6390'
            ? ['6390 as a contra-expense is a parking spot — ask the accountant where it belongs']
            : [],
        checklist: [],
      };
    },
  },
];
