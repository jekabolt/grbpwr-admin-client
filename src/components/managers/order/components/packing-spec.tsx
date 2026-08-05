import { StyleAssemblyLine } from 'api/proto-http/admin';
import { auxSubtypeLabel } from 'components/managers/tech-card/components/labels-pkg-shared';
import { useOrderPackingSpec } from 'components/managers/tech-card/components/useAssemblyPacking';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo, useState } from 'react';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';

const TH =
  'border border-borderColor bg-bgZebra px-2 py-1 text-left text-micro uppercase tracking-label';
const TD = 'border border-hairline px-2 py-1 align-top text-micro';

// An empty tick box the packer marks off by hand once the line is picked/verified. Printed
// as a real square so a paper copy is usable.
function Tick() {
  return <span aria-hidden className='inline-block h-3 w-3 border border-textColor align-middle' />;
}

// A colour chip that survives printing: browsers drop background fills on paper unless the element
// asks to keep them, and a pick list whose swatches vanish is a pick list that lost half its answer.
function Swatch({ hex, title }: { hex?: string; title?: string }) {
  return (
    <span
      aria-hidden
      title={title ?? hex ?? undefined}
      className='inline-block size-2.5 shrink-0 border border-textColor align-middle'
      style={hex ? { backgroundColor: hex, printColorAdjust: 'exact' } : undefined}
    />
  );
}

// Why the spec could not name a bucket, in the words of the person holding the sheet. The server's
// basis codes name a CAUSE; each of these names the FIX, because an unresolved line is work for
// somebody and "NO_COLOR_MATCH" does not say whose.
const UNRESOLVED_REASON: Record<string, string> = {
  ASSEMBLY_RESOLUTION_BASIS_RETIRED_COLOR:
    'colour exists but is retired — reactivate it or pick a substitute',
  ASSEMBLY_RESOLUTION_BASIS_NO_COLOR_MATCH: 'no colour of this component matches',
  ASSEMBLY_RESOLUTION_BASIS_ARCHIVED_MATERIAL: 'the bucket is archived',
  ASSEMBLY_RESOLUTION_BASIS_NO_OUTPUT: 'component has no warehouse output',
};

// The colour half of one assembly line: which bucket this component ships from, or why nobody knows.
function Resolution({
  line,
  garmentCode,
  hexByCode,
}: {
  line: StyleAssemblyLine;
  garmentCode: string;
  hexByCode: Map<string, string>;
}) {
  if (line.unresolved) {
    return (
      <span className='flex flex-col items-start gap-0.5'>
        <Pill tone='warn'>unresolved</Pill>
        <Text component='span' variant='label' size='micro'>
          {UNRESOLVED_REASON[line.resolutionBasis ?? ''] ??
            'not resolved — check the component’s colours'}
        </Text>
      </span>
    );
  }
  const code = line.resolvedColorCode?.trim() ?? '';
  const material =
    line.resolvedMaterialName?.trim() ||
    (line.resolvedMaterialId ? `#${line.resolvedMaterialId}` : '');
  // A sole-variant hit is a SUBSTITUTION, not a match: the component simply has one colour, and it
  // happens to be shipped with every colourway. Showing it as though the colours agreed would let a
  // genuine mismatch print as a tick — so when they differ, both are named.
  const substituted =
    line.resolutionBasis === 'ASSEMBLY_RESOLUTION_BASIS_SOLE_VARIANT' &&
    !!code &&
    !!garmentCode &&
    code.toUpperCase() !== garmentCode.toUpperCase();
  if (!code && !material) return <>—</>;
  return (
    <span className='flex flex-col items-start gap-0.5'>
      {code ? (
        <span className='inline-flex items-center gap-1'>
          <Swatch hex={hexByCode.get(code)} title={line.resolvedColorName ?? undefined} />
          <span>
            {substituted ? (
              <>
                garment <span className='uppercase'>{garmentCode}</span> →{' '}
              </>
            ) : null}
            <span className='uppercase'>{code}</span>
            {line.resolvedColorName ? ` · ${line.resolvedColorName}` : ''}
            {substituted ? ' (only colour)' : ''}
          </span>
        </span>
      ) : null}
      {material ? (
        <Text component='span' variant='label' size='micro'>
          {material}
        </Text>
      ) : null}
    </span>
  );
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
  const { dictionary } = useDictionary();
  const items = data?.items ?? [];
  const packaging = data?.packaging ?? [];
  const hexByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of dictionary?.colors ?? []) if (c.code && c.hex) m.set(c.code, c.hex);
    return m;
  }, [dictionary?.colors]);

  return (
    <Section
      title='pick list'
      action={
        <>
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
          <Button
            type='button'
            variant='secondary'
            size='xs'
            className='uppercase print:hidden'
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? '− hide' : '+ show'}
          </Button>
        </>
      }
    >

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
                  // The garment's own colour: what every component below is resolved AGAINST, so it
                  // belongs in the header rather than repeated per line.
                  const garmentCode = it.colorCode?.trim() ?? '';
                  return (
                    <div key={it.orderItemId} className='space-y-2'>
                      <GroupLabel
                        action={
                          <Text component='span' size='micro' variant='label'>
                            {it.sku} · {it.sizeName} · qty {it.quantity?.value ?? '0'}
                          </Text>
                        }
                      >
                        <span className='inline-flex items-center gap-2'>
                          <Tick />
                          {it.styleName || `style #${it.styleId}`}
                          {garmentCode ? (
                            <span className='inline-flex items-center gap-1 normal-case'>
                              <Swatch hex={hexByCode.get(garmentCode)} title={it.colorName ?? ''} />
                              <span className='uppercase'>{garmentCode}</span>
                              {it.colorName ? ` · ${it.colorName}` : ''}
                            </span>
                          ) : null}
                        </span>
                      </GroupLabel>
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
                                <th className={TH}>colour → bucket</th>
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
                                    <td className={TD}>
                                      <Resolution
                                        line={a}
                                        garmentCode={garmentCode}
                                        hexByCode={hexByCode}
                                      />
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

              <div className='space-y-2'>
                <GroupLabel>packaging materials</GroupLabel>
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
    </Section>
  );
}
