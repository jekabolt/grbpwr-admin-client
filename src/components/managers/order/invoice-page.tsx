import { adminService } from 'api/api';
import { getOrderStatusName } from 'components/managers/orders-catalog/components/utility';
import { ROUTES } from 'constants/routes';
import { useQuery } from '@tanstack/react-query';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { Chip, ChipRow } from 'ui/components/chip';
import { GroupLabel } from 'ui/components/group-label';
import { Placeholder } from 'ui/components/placeholder';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';
import { InvoiceDocument } from './components/invoice-document';

/**
 * invPage v2 — A4 preview + options rail.
 *
 * The old screen was a top toolbar over a full-width card. This is the reference's detail grammar:
 * a centred A4 document (the InvoiceDocument, framed like a page with the modal shadow) beside a
 * right-hand rail of controls — print, and the toggles that change what the sheet says (unit
 * prices, the reverse-charge note, product language). The rail carries `.invoice-toolbar` so it is
 * hidden in print; only `.invoice-doc` reaches the paper. Renders OUTSIDE the app Layout
 * (ProtectedBare in index.tsx), so the document is plain top-level content and printing needs no
 * isolation tricks — same approach as the tech pack print page (see tech-card/print-page).
 */
const PRINT_CSS = `
@media print {
  @page { size: A4 portrait; margin: 12mm; }
  html, body { background: #fff !important; }
  .invoice-toolbar { display: none !important; }
  .invoice-doc { border: 0 !important; box-shadow: none !important; max-width: none !important; margin: 0 !important; }
  .invoice-doc > * { max-width: none !important; margin: 0 !important; padding: 0 !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
`;

export function OrderInvoicePrint() {
  const { uuid } = useParams<{ uuid: string }>();
  const { dictionary } = useDictionary();

  // Rail state — the document re-renders from these on every toggle. Defaults print the full sheet.
  const [showUnitPrices, setShowUnitPrices] = useState(true);
  const [showVatNote, setShowVatNote] = useState(true);
  const [languageId, setLanguageId] = useState<number | undefined>(undefined);

  const {
    data: orderDetails,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['order-invoice', uuid],
    queryFn: async () => (await adminService.GetOrderByUUID({ orderUuid: uuid || '' })).order,
    enabled: !!uuid,
  });

  const orderStatus = getOrderStatusName(dictionary, orderDetails?.order?.orderStatusId);
  const backTo = uuid ? `${ROUTES.orders}/${uuid}` : ROUTES.orders;

  // Language is offered only when the dictionary actually carries alternatives to switch between.
  // 'default' is a sentinel, not '' — a Radix Select.Item cannot hold an empty-string value.
  const DEFAULT_LANG = 'default';
  const languages = (dictionary?.languages ?? []).filter((l) => l.isActive && l.id != null);
  const languageItems = [
    { value: DEFAULT_LANG, label: 'default' },
    ...languages.map((l) => ({ value: String(l.id), label: l.name || l.code || String(l.id) })),
  ];
  // The reverse-charge note only exists for a WDT-posted order — hide its toggle otherwise.
  const hasVatNote = orderDetails?.order?.vatRegime === 'wdt';

  return (
    <div className='mx-auto flex max-w-[1180px] flex-col-reverse gap-6 p-4 pb-10 lg:flex-row lg:items-start'>
      <style>{PRINT_CSS}</style>

      {/* A4 document preview */}
      <div className='min-w-0 flex-1'>
        {isLoading ? (
          <Placeholder label='loading order…' className='py-20' />
        ) : isError || !orderDetails ? (
          <CalloutBox tone='note' className='flex flex-col items-start gap-3'>
            <Text size='micro' variant='label' tracking='label' component='span' className='font-bold uppercase'>
              order not found
            </Text>
            <Button asChild variant='main' size='sm'>
              <Link to={ROUTES.orders}>← back to orders</Link>
            </Button>
          </CalloutBox>
        ) : (
          <div className='invoice-doc mx-auto w-full max-w-[210mm] border border-borderColor bg-white shadow-[var(--shadow-modal)]'>
            <InvoiceDocument
              orderDetails={orderDetails}
              orderStatus={orderStatus}
              dictionary={dictionary}
              showUnitPrices={showUnitPrices}
              showVatNote={showVatNote}
              languageId={languageId}
            />
          </div>
        )}
      </div>

      {/* Options rail — print:hidden AND `.invoice-toolbar` so the print CSS strips it either way */}
      <aside className='invoice-toolbar flex w-full flex-col gap-4 print:hidden lg:sticky lg:top-4 lg:w-[264px] lg:shrink-0'>
        <div className='flex flex-col gap-2 border border-borderColor bg-bgColor p-3'>
          <GroupLabel flush>invoice #{orderDetails?.order?.id ?? '—'}</GroupLabel>
          <Button
            variant='main'
            size='lg'
            className='w-full uppercase'
            disabled={!orderDetails}
            onClick={() => window.print()}
          >
            save as pdf
          </Button>
          <Text size='micro' variant='label' component='span'>
            choose “save as PDF” as the destination
          </Text>
          <Button asChild variant='underline' size='xs'>
            <Link to={backTo}>← back to order</Link>
          </Button>
        </div>

        <div className='flex flex-col gap-2.5 border border-borderColor bg-bgColor p-3'>
          <GroupLabel flush>document options</GroupLabel>
          <Text size='micro' variant='label' component='span'>
            a filled chip prints on the sheet
          </Text>
          <ChipRow>
            <Chip
              selected={showUnitPrices}
              pressed={showUnitPrices}
              onClick={() => setShowUnitPrices((v) => !v)}
            >
              unit prices
            </Chip>
            {hasVatNote && (
              <Chip
                selected={showVatNote}
                pressed={showVatNote}
                onClick={() => setShowVatNote((v) => !v)}
              >
                vat note
              </Chip>
            )}
          </ChipRow>

          {languages.length > 0 && (
            <label className='flex flex-col gap-1'>
              <Text
                size='micro'
                variant='label'
                tracking='label'
                component='span'
                className='uppercase'
              >
                product language
              </Text>
              <SelectComponent
                name='invoice-language'
                placeholder='default'
                fullWidth
                items={languageItems}
                value={languageId != null ? String(languageId) : DEFAULT_LANG}
                onValueChange={(v: string) =>
                  setLanguageId(v === DEFAULT_LANG ? undefined : Number(v))
                }
              />
            </label>
          )}
        </div>
      </aside>
    </div>
  );
}
