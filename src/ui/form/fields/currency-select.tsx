import { EXPENSE_CURRENCIES } from 'constants/constants';
import SelectField from './select-field';

type Props = {
  name: string;
  label?: string;
  className?: string;
  placeholder?: string;
};

// No empty-string item: Radix Select throws on an item with value=''. An unset currency is
// the form field's '' value, which Radix renders as the placeholder (its documented "clear"
// state) — the constraint is only on item values, not the root value.
const CURRENCY_ITEMS = EXPENSE_CURRENCIES.map((c) => ({ label: c.label, value: c.value }));

// A closed dropdown over the supported ISO-4217 currencies (replaces every free-text
// currency input across BOM / costing). Blank = unset (shown via the placeholder).
export default function CurrencySelect({
  name,
  label = 'currency',
  className,
  placeholder = '—',
}: Props) {
  return (
    <SelectField
      name={name}
      label={label}
      items={CURRENCY_ITEMS}
      className={className}
      placeholder={placeholder}
    />
  );
}
