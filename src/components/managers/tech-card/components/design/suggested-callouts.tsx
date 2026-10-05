import type { CalloutSuggestion } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { parseSpec, specSummary } from 'ui/components/annotation/purpose';
import { annotationKindFromWire } from 'ui/components/annotation/wire';
import { Button } from 'ui/components/button';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import { KindGlyph, onDoorKey } from './callout-rail';
import { missingLabel } from './callout-suggest';

/**
 * ═══ `suggested · N` — ГРУППА ПОД НАСТОЯЩИМИ СТРОКАМИ CALLOUTS (T28) ═══════════════════════════
 *
 * Та же строка, что у указания (глиф · текст · где), только без номера — номер появится в момент
 * ✓, — и с тем, что делает её предложением: источник цветом подписи (`BOM · YKK zip #5`) или
 * `from picture`, тихие метки пробелов данных и две двери ✓ / ✕. Ни заголовка-пояснения, ни
 * второй панели: шапка группы — одно слово со счётом, справа `accept all`.
 */
export function SuggestedCallouts({
  rows,
  open,
  onOpen,
  hot,
  onHover,
  onAccept,
  onDismiss,
  onAcceptAll,
  disabled,
}: {
  rows: CalloutSuggestion[];
  open: boolean;
  onOpen: (open: boolean) => void;
  hot: string | null;
  onHover: (id: string | null) => void;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
  onAcceptAll: () => void;
  disabled?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <div data-callout-suggested='' className='mt-3'>
      <div className='flex items-baseline gap-2 border-b border-dashed border-borderColor pb-0.5'>
        {/* Дверь без формы (`onDoorKey`): свернуть список — вид, не данные. */}
        <span
          role='button'
          tabIndex={0}
          aria-expanded={open}
          data-callout-suggested-toggle=''
          onClick={() => onOpen(!open)}
          onKeyDown={onDoorKey(() => onOpen(!open))}
          className='cursor-pointer'
        >
          <Text size='micro' variant='label' component='span' className='uppercase tracking-label'>
            suggested · {rows.length} {open ? '▴' : '▾'}
          </Text>
        </span>
        {open && !disabled && (
          <Button
            type='button'
            variant='underline'
            size='xs'
            className='ml-auto px-0 text-labelColor hover:text-textColor'
            data-callout-accept-all=''
            onClick={onAcceptAll}
          >
            accept all
          </Button>
        )}
      </div>
      {open && (
        <div data-callout-suggested-rows=''>
          {rows.map((s) => {
            const id = s.id ?? '';
            const spec = s.spec ?? '';
            const text = (s.description ?? '').trim() || specSummary(parseSpec(spec)) || 'callout';
            const missing = (s.missing ?? []).filter(Boolean);
            return (
              <div
                key={id}
                data-callout-suggestion={id}
                data-callout-suggestion-source={s.sourceId ?? ''}
                className={cn(
                  'group flex items-center gap-2 border-b border-dashed border-hairline px-1 -mx-1 py-1 last:border-b-0',
                  hot === id && 'bg-bgSecondary',
                )}
                onPointerEnter={() => onHover(id)}
                onPointerLeave={() => onHover(null)}
              >
                <span className='opacity-70'>
                  <KindGlyph kind={annotationKindFromWire(s.kind)} spec={spec} />
                </span>
                <span className='flex min-w-0 flex-1 flex-col'>
                  <Text size='micro' component='span' className='block truncate text-labelColor'>
                    {text}
                  </Text>
                  <span className='flex min-w-0 flex-wrap items-center gap-1'>
                    <Text
                      size='nano'
                      variant='label'
                      component='span'
                      className='truncate'
                      data-callout-suggestion-label=''
                    >
                      {s.fromData === false ? 'from picture' : (s.sourceLabel ?? '').trim()}
                    </Text>
                    {missing.map((m) => (
                      <Pill key={m} tone='gap' className='px-1 text-nano'>
                        {missingLabel(m)}
                      </Pill>
                    ))}
                  </span>
                </span>
                {!disabled && (
                  <>
                    <button
                      type='button'
                      aria-label='accept'
                      title='accept'
                      data-callout-accept={id}
                      onClick={() => onAccept(id)}
                      className='flex h-5 w-5 shrink-0 items-center justify-center text-micro text-labelColor hover:text-textColor'
                    >
                      <span aria-hidden>✓</span>
                    </button>
                    <button
                      type='button'
                      aria-label='dismiss'
                      title='dismiss'
                      data-callout-dismiss={id}
                      onClick={() => onDismiss(id)}
                      className='flex h-5 w-5 shrink-0 items-center justify-center text-micro text-textInactiveColor hover:text-textColor'
                    >
                      <span aria-hidden>✕</span>
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
