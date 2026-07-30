import { useOrderPackingSpec } from 'components/managers/tech-card/components/useAssemblyPacking';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';

const TH =
  'border border-borderColor bg-bgZebra px-2 py-1 text-left text-micro uppercase tracking-label';
const TD = 'border border-borderColor px-2 py-1 align-top text-micro';

// An empty tick box the packer marks off by hand once the line is picked/verified. Printed
// as a real square so a paper copy is usable.
function Tick() {
  return <span aria-hidden className='inline-block h-3 w-3 border border-textColor align-middle' />;
}

// Strip the enum prefix for a compact human label (e.g. TECH_CARD_AUX_SUBTYPE_DUST_BAG -> "dust bag").
function auxSubtypeLabel(subtype?: string): string {
  if (!subtype || subtype === 'TECH_CARD_AUX_SUBTYPE_UNKNOWN') return '';
  return subtype.replace('TECH_CARD_AUX_SUBTYPE_', '').replace(/_/g, ' ').toLowerCase();
}

/**
 * ordPack v3 — a printable pick list, not a popover of tables. Each garment line is a row
 * the packer ticks off, with its on-garment assembly (labels/tags to verify) beneath, plus
 * the packaging-materials the shipment needs. Read-only — authored on the style's assembly
 * bill / packaging recipe. The fetch is still deferred until first opened (GetOrderPackingSpec
 * is its own RPC), but unlike the old spec this section PRINTS, so "open + print" hands a
 * packer a sheet. (The spec carries no thumbnails, so the list is text — noted.)
 */
export function OrderPackingSpec({ orderUuid }: { orderUuid: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError, refetch } = useOrderPackingSpec(orderUuid, open);
  const items = data?.items ?? [];
  const packaging = data?.packaging ?? [];

  return (
    <section className='space-y-3 border border-borderColor bg-bgColor p-3'>
      <div className='flex items-center justify-between gap-2'>
        <button
          type='button'
          onClick={() => setOpen((o) => !o)}
          className='flex items-center gap-2'
          aria-expanded={open}
        >
          <Text variant='uppercase' tracking='group' className='font-bold'>
            pick list
          </Text>
          <Text component='span' variant='label'>
            {open ? '▴' : '▾'}
          </Text>
        </button>
        {open && items.length + packaging.length > 0 && (
          <Button
            variant='secondary'
            size='xs'
            className='uppercase print:hidden'
            onClick={() => window.print()}
          >
            print
          </Button>
        )}
      </div>

      {open && (
        <div className='space-y-4'>
          {isLoading ? (
            <Text variant='label' size='micro' className='animate-pulse'>
              loading pick list…
            </Text>
          ) : isError ? (
            <div className='flex items-center gap-3'>
              <Text variant='error' size='micro'>
                failed to load pick list
              </Text>
              <Button variant='underline' size='xs' onClick={() => refetch()}>
                retry
              </Button>
            </div>
          ) : items.length === 0 && packaging.length === 0 ? (
            <Text variant='label' size='micro'>
              no pick list for this order
            </Text>
          ) : (
            <>
              <div className='space-y-3'>
                {items.map((it) => {
                  const assembly = it.assembly ?? [];
                  return (
                    <div key={it.orderItemId} className='space-y-2 border border-borderColor p-2.5'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <Tick />
                        <Text component='span' className='font-bold uppercase'>
                          {it.styleName || `style #${it.styleId}`}
                        </Text>
                        <Text component='span' size='micro' variant='label'>
                          {it.sku} · {it.sizeName} · qty {it.quantity?.value ?? '0'}
                        </Text>
                      </div>
                      {assembly.length === 0 ? (
                        <Text variant='label' size='micro'>
                          no assembly items
                        </Text>
                      ) : (
                        <div className='overflow-x-auto'>
                          <table className='w-full min-w-max border-collapse'>
                            <thead>
                              <tr>
                                <th className={TH} aria-label='checked' />
                                <th className={TH}>component</th>
                                <th className={TH}>qty</th>
                                <th className={TH}>print</th>
                                <th className={TH}>position</th>
                              </tr>
                            </thead>
                            <tbody>
                              {assembly.map((a) => {
                                const subtype = auxSubtypeLabel(a.componentAuxSubtype);
                                return (
                                  <tr key={a.id}>
                                    <td className={TD}>
                                      <Tick />
                                    </td>
                                    <td className={TD}>
                                      {a.componentName || `#${a.componentTechCardId}`}
                                      {subtype ? ` · ${subtype}` : ''}
                                      {a.active === false ? ' (inactive)' : ''}
                                    </td>
                                    <td className={TD}>{a.qty?.value ?? '—'}</td>
                                    <td className={TD}>{a.printNote || '—'}</td>
                                    <td className={TD}>{a.positionNote || '—'}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className='space-y-2 border-t border-borderColor pt-3'>
                <Text variant='uppercase' size='micro' tracking='label'>
                  packaging materials
                </Text>
                {packaging.length === 0 ? (
                  <Text variant='label' size='micro'>
                    no packaging materials
                  </Text>
                ) : (
                  <div className='overflow-x-auto'>
                    <table className='w-full min-w-max border-collapse'>
                      <thead>
                        <tr>
                          <th className={TH} aria-label='checked' />
                          <th className={TH}>material</th>
                          <th className={TH}>unit</th>
                          <th className={TH}>qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {packaging.map((p) => (
                          <tr key={p.materialId}>
                            <td className={TD}>
                              <Tick />
                            </td>
                            <td className={TD}>{p.materialName || `#${p.materialId}`}</td>
                            <td className={TD}>{p.materialUnit}</td>
                            <td className={TD}>{p.qty?.value ?? '0'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
