import { useOrderPackingSpec } from 'components/managers/tech-card/components/useAssemblyPacking';
import { useState } from 'react';
import Text from 'ui/components/text';

const th =
  'border border-textInactiveColor bg-textInactiveColor/20 px-2 py-1 text-left text-textBaseSize uppercase';
const td = 'border border-textInactiveColor px-2 py-1 align-top text-textBaseSize';

// Strip the enum prefix for a compact human label (e.g. TECH_CARD_AUX_SUBTYPE_DUST_BAG -> "dust bag").
function auxSubtypeLabel(subtype?: string): string {
  if (!subtype || subtype === 'TECH_CARD_AUX_SUBTYPE_UNKNOWN') return '';
  return subtype.replace('TECH_CARD_AUX_SUBTYPE_', '').replace(/_/g, ' ').toLowerCase();
}

// Packer/QC-readable composition of an order (WS7 scope 3, §2.8): each garment line with its
// on-garment assembly (labels/tags to verify) plus a packaging-materials summary for the shipment.
// Read-only — everything here is authored on the style's assembly bill / packaging recipe.
// Collapsed by default; the fetch is deferred until first opened (GetOrderPackingSpec is its own
// RPC, no reason to fire it on every order-page load).
export function OrderPackingSpec({ orderUuid }: { orderUuid: string }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError, refetch } = useOrderPackingSpec(orderUuid, open);
  const items = data?.items ?? [];
  const packaging = data?.packaging ?? [];

  return (
    <section className='space-y-3 border border-textInactiveColor p-4 print:hidden'>
      <button
        type='button'
        onClick={() => setOpen((o) => !o)}
        className='flex w-full items-center justify-between'
        aria-expanded={open}
      >
        <Text variant='uppercase' size='large'>
          packing spec
        </Text>
        <Text>{open ? '▴' : '▾'}</Text>
      </button>

      {open && (
        <div className='space-y-4'>
          {isLoading ? (
            <Text variant='inactive' size='small' className='animate-pulse'>
              loading packing spec…
            </Text>
          ) : isError ? (
            <div className='flex items-center gap-3'>
              <Text variant='error' size='small'>
                failed to load packing spec
              </Text>
              <button
                type='button'
                className='text-textBaseSize uppercase underline'
                onClick={() => refetch()}
              >
                retry
              </button>
            </div>
          ) : items.length === 0 && packaging.length === 0 ? (
            <Text variant='inactive' size='small'>
              no packing spec for this order
            </Text>
          ) : (
            <>
              <div className='space-y-3'>
                {items.map((it) => {
                  const assembly = it.assembly ?? [];
                  return (
                    <div
                      key={it.orderItemId}
                      className='space-y-2 border border-textInactiveColor p-3'
                    >
                      <div className='flex flex-wrap items-center justify-between gap-2'>
                        <Text variant='uppercase'>{it.styleName || `style #${it.styleId}`}</Text>
                        <Text variant='inactive' size='small'>
                          {it.sku} · {it.sizeName} · qty {it.quantity?.value ?? '0'}
                        </Text>
                      </div>
                      {assembly.length === 0 ? (
                        <Text variant='inactive' size='small'>
                          no assembly items
                        </Text>
                      ) : (
                        <div className='overflow-x-auto'>
                          <table className='w-full min-w-max border-collapse'>
                            <thead>
                              <tr>
                                <th className={th}>component</th>
                                <th className={th}>qty</th>
                                <th className={th}>print</th>
                                <th className={th}>position</th>
                              </tr>
                            </thead>
                            <tbody>
                              {assembly.map((a) => {
                                const subtype = auxSubtypeLabel(a.componentAuxSubtype);
                                return (
                                  <tr key={a.id}>
                                    <td className={td}>
                                      {a.componentName || `#${a.componentTechCardId}`}
                                      {subtype ? ` · ${subtype}` : ''}
                                      {a.active === false ? ' (inactive)' : ''}
                                    </td>
                                    <td className={td}>{a.qty?.value ?? '—'}</td>
                                    <td className={td}>{a.printNote || '—'}</td>
                                    <td className={td}>{a.positionNote || '—'}</td>
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

              <div className='space-y-2 border-t border-textInactiveColor pt-3'>
                <Text variant='uppercase' size='small'>
                  packaging materials
                </Text>
                {packaging.length === 0 ? (
                  <Text variant='inactive' size='small'>
                    no packaging materials
                  </Text>
                ) : (
                  <div className='overflow-x-auto'>
                    <table className='w-full min-w-max border-collapse'>
                      <thead>
                        <tr>
                          <th className={th}>material</th>
                          <th className={th}>unit</th>
                          <th className={th}>qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {packaging.map((p) => (
                          <tr key={p.materialId}>
                            <td className={td}>{p.materialName || `#${p.materialId}`}</td>
                            <td className={td}>{p.materialUnit}</td>
                            <td className={td}>{p.qty?.value ?? '0'}</td>
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
