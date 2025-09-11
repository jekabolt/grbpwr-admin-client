import { isValid, parseISO } from 'date-fns';
import { useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import InputField from 'ui/form/fields/input-field';

function parseWellKnownTimestamp(timestamp: string): Date | null {
  if (!timestamp || timestamp === '0001-01-01T00:00:00Z') return null;
  const parsedDate = parseISO(timestamp);
  return isValid(parsedDate) ? parsedDate : null;
}

function formatWellKnownTimestamp(date: Date | null): string {
  if (!date) return '0001-01-01T00:00:00Z';
  return date.toISOString();
}

export function SalePreorderFields() {
  const { watch, setValue } = useFormContext();
  const [showSales, setShowSales] = useState(false);
  const [showPreorder, setShowPreorder] = useState(false);

  const salePath = 'product.productBodyInsert.salePercentage.value';
  const preorderPath = 'product.productBodyInsert.preorder';

  const saleValue: string = watch(salePath) || '0';
  const preorderValue: string = watch(preorderPath) || '0001-01-01T00:00:00Z';

  const hasPreorder = !!parseWellKnownTimestamp(preorderValue);
  const numericSale = Number.isFinite(parseFloat(saleValue as any))
    ? Math.max(0, Math.min(99, parseFloat(saleValue)))
    : 0;

  const todayYmd = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    setShowSales(!hasPreorder);
    setShowPreorder(numericSale <= 0);
  }, [hasPreorder, numericSale]);

  const handleSaleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value ?? '';
    const digitsOnly = raw.replace(/[^0-9]/g, '');
    const next = digitsOnly === '' ? '0' : String(Math.max(0, Math.min(99, parseInt(digitsOnly))));

    setValue(salePath, next, { shouldDirty: true, shouldTouch: true, shouldValidate: true });

    if (parseInt(next) > 0) {
      setValue(preorderPath, '0001-01-01T00:00:00Z', {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
    }

    setShowPreorder(parseInt(next) <= 0);
    setShowSales(true);
  };

  const handlePreorderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const dateStr = e.target.value;

    if (!dateStr) {
      setValue(preorderPath, '0001-01-01T00:00:00Z', {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: true,
      });
      setShowSales(true);
      return;
    }

    // Enforce min date = today
    const clamped = dateStr < todayYmd ? todayYmd : dateStr;

    const date = new Date(`${clamped}T00:00:00Z`);
    const iso = formatWellKnownTimestamp(date);

    setValue(preorderPath, iso, { shouldDirty: true, shouldTouch: true, shouldValidate: true });
    setValue(salePath, '0', { shouldDirty: true, shouldTouch: true, shouldValidate: true });

    setShowSales(false);
    setShowPreorder(true);
  };

  const uiDate = (() => {
    const parsed = parseWellKnownTimestamp(preorderValue);
    if (!parsed) return '';
    return parsed.toISOString().slice(0, 10);
  })();

  return (
    <div className='space-y-3'>
      {showSales && (
        <InputField
          name={salePath}
          label='sale percentage'
          keyboardRestriction={/[0-9]/}
          value={String(numericSale)}
          onChange={handleSaleChange}
          disabled={hasPreorder}
        />
      )}
      {showPreorder && (
        <InputField
          type='date'
          name={preorderPath}
          label='preorder'
          value={uiDate}
          min={todayYmd}
          onChange={handlePreorderChange}
          disabled={numericSale > 0}
        />
      )}
    </div>
  );
}
