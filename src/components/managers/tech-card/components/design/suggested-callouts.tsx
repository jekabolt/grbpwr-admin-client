import type { CalloutSuggestion } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { annotationKindFromWire } from 'ui/components/annotation/wire';
import { Button } from 'ui/components/button';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import { KindGlyph, onDoorKey } from './callout-rail';
import { missingLabel, suggestionLabel } from './callout-suggest';

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
  flats,
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
  /** Флэты листа по порядку ряда: строки идут группами по флэту (R39 — у каждого вида свои). */
  flats: { mediaId: number; name: string }[];
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
          {groupsOf(rows, flats).map((g) => (
            <div key={g.mediaId} data-callout-suggested-flat={g.mediaId}>
              <Text
                size='nano'
                variant='label'
                component='p'
                className='pt-2 uppercase tracking-label'
              >
                {g.name} · {g.rows.length}
              </Text>
              {g.rows.map((s) => {
                const id = s.id ?? '';
                const missing = (s.missing ?? []).filter(Boolean);
                const source = s.fromData === false ? 'from picture' : (s.sourceLabel ?? '').trim();
                return (
                  <div
                    key={id}
                    data-callout-suggestion={id}
                    data-callout-suggestion-source={s.sourceId ?? ''}
                    title={(s.description ?? '').trim() || undefined}
                    className={cn(
                      'group flex min-w-0 items-center gap-2 border-b border-dashed border-hairline px-1 -mx-1 py-0.5 last:border-b-0',
                      hot === id && 'bg-bgSecondary',
                    )}
                    onPointerEnter={() => onHover(id)}
                    onPointerLeave={() => onHover(null)}
                  >
                    <span className='shrink-0 opacity-70'>
                      <KindGlyph kind={annotationKindFromWire(s.kind)} spec={s.spec ?? ''} />
                    </span>
                    <Text size='micro' component='span' className='shrink truncate text-textColor'>
                      {suggestionLabel(s)}
                    </Text>
                    <Text
                      size='nano'
                      variant='label'
                      component='span'
                      className='min-w-0 flex-1 truncate'
                      data-callout-suggestion-label=''
                    >
                      {source}
                    </Text>
                    {missing.map((m) => (
                      <Pill key={m} tone='gap' className='shrink-0 px-1 text-nano'>
                        {missingLabel(m)}
                      </Pill>
                    ))}
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
          ))}
        </div>
      )}
    </div>
  );
}

/** Группы по флэту в порядке ряда; флэт, которого в ряду нет, — в конце, без имени не теряется. */
function groupsOf(rows: CalloutSuggestion[], flats: { mediaId: number; name: string }[]) {
  const order = [...flats.map((f) => f.mediaId)];
  for (const r of rows) if (!order.includes(r.mediaId ?? 0)) order.push(r.mediaId ?? 0);
  return order
    .map((mediaId) => ({
      mediaId,
      name: flats.find((f) => f.mediaId === mediaId)?.name || 'flat',
      rows: rows.filter((r) => (r.mediaId ?? 0) === mediaId),
    }))
    .filter((g) => g.rows.length > 0);
}
