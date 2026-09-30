// РЕДАКТОР СОСТАВА НА СОСТАВНИКЕ (I-13, D-03). Открывается щелчком по строке состава, стоит на её
// месте. По части ленты — строки «волокно · %»; переводы на 10 языков — из словаря волокон, поэтому
// набирать языки не нужно никогда. Каждая правка сразу уходит в форму (→ автосейв), но только
// ГОДНЫЕ строки: недописанная (волокно не выбрано, 0 %) живёт здесь и форму не портит — иначе
// автосейв встал бы для всей карточки. Сумма части ≠ 100 — предупреждение, не запрет.
import { cn } from 'lib/utility';
import { useMemo, useState } from 'react';
import CheckboxCommon from 'ui/components/checkbox';
import { Combobox, type ComboboxGroup } from 'ui/components/combobox';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import type { OverrideFiber } from '../../care-labels/composition-override';
import type { FiberDict } from '../../care-labels/composition-resolver';
import { LABEL_PART_NAME, LABEL_PARTS } from '../../care-labels/label-parts';
import { SWAP } from './editable';

type Part = OverrideFiber['part'];
const PARTS = LABEL_PARTS.filter((p): p is Part => p !== 'NOTE');

type Row = OverrideFiber & { key: number };

let seq = 0;
const keyed = (rows: readonly OverrideFiber[]): Row[] => rows.map((r) => ({ ...r, key: ++seq }));

const linkClass =
  'cursor-pointer text-micro uppercase tracking-label text-textColor underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-textColor';

export function FibreEditor({
  initial,
  fibers,
  otherCount,
  onChange,
  onDone,
}: {
  /** Переопределение колорвея, иначе выведенный состав (стартовая точка первой правки). */
  initial: readonly OverrideFiber[];
  fibers: FiberDict;
  /** Сколько ещё колорвеев у стиля — для галочки «also the other N colourways». */
  otherCount: number;
  onChange: (rows: OverrideFiber[], applyToAll: boolean) => void;
  onDone: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => keyed(initial));
  const [all, setAll] = useState(false);

  const push = (next: Row[], applyAll = all) => {
    setRows(next);
    onChange(
      next.map(({ part, fiberCode, pct }) => ({ part, fiberCode, pct })),
      applyAll,
    );
  };

  const options = useMemo(
    () =>
      [...fibers.values()]
        .filter((f) => !f.archived)
        .map((f) => ({ value: f.code, label: `${f.code} · ${f.translations.en || f.name}` })),
    [fibers],
  );
  const filter = (q: string): ComboboxGroup[] => {
    const s = q.trim().toLowerCase();
    const hit = s ? options.filter((o) => o.label.toLowerCase().includes(s)) : options;
    return hit.length ? [{ key: 'fibres', label: 'fibre dictionary', options: hit }] : [];
  };

  const shown = PARTS.filter((p) => rows.some((r) => r.part === p));
  const unused = PARTS.filter((p) => !shown.includes(p));
  const patch = (key: number, p: Partial<OverrideFiber>) =>
    push(rows.map((r) => (r.key === key ? { ...r, ...p } : r)));

  return (
    <div className={cn(SWAP, 'flex flex-col gap-6')} data-fibre-editor=''>
      {shown.length === 0 ? (
        <Text size='micro' variant='label'>
          no parts yet — add the shell below
        </Text>
      ) : null}
      {shown.map((part) => {
        const mine = rows.filter((r) => r.part === part);
        const sum = mine.reduce((a, r) => a + (r.pct || 0), 0);
        return (
          <div key={part} className='flex flex-col gap-2' data-fibre-part={part}>
            <div className='flex items-baseline justify-between gap-3'>
              <Text size='micro' className='uppercase tracking-label'>
                {LABEL_PART_NAME[part]}
              </Text>
              <Text size='micro' variant={sum === 100 ? 'label' : 'errorLabel'} data-part-sum={sum}>
                {sum === 100 ? '100%' : `${sum}% — should be 100%`}
              </Text>
            </div>
            {mine.map((r) => (
              <div
                key={r.key}
                className='grid grid-cols-[minmax(0,1fr)_64px_auto_auto] items-center gap-2'
              >
                <Combobox
                  name={`fibre-${r.key}`}
                  placeholder='fibre'
                  searchPlaceholder='code or name'
                  valueLabel={
                    r.fiberCode
                      ? options.find((o) => o.value === r.fiberCode)?.label ?? r.fiberCode
                      : ''
                  }
                  invalid={!!r.fiberCode && !fibers.has(r.fiberCode)}
                  filter={filter}
                  onSelect={(code) => patch(r.key, { fiberCode: code })}
                />
                <Input
                  type='number'
                  min={1}
                  max={100}
                  aria-label={`${LABEL_PART_NAME[part]} percent`}
                  value={r.pct ? String(r.pct) : ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const n = parseInt(e.target.value, 10);
                    patch(r.key, { pct: Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0 });
                  }}
                  className='text-right tabular-nums'
                />
                <Text size='micro' variant='label'>
                  %
                </Text>
                <button
                  type='button'
                  aria-label={`remove ${r.fiberCode || 'fibre'} from ${LABEL_PART_NAME[part]}`}
                  onClick={() => push(rows.filter((x) => x.key !== r.key))}
                  className='cursor-pointer px-1 text-labelColor hover:text-textColor focus-visible:outline focus-visible:outline-1 focus-visible:outline-textColor'
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type='button'
              className={cn(linkClass, 'self-start text-labelColor')}
              onClick={() =>
                setRows([...rows, { part, fiberCode: '', pct: Math.max(0, 100 - sum), key: ++seq }])
              }
            >
              + fibre
            </button>
          </div>
        );
      })}

      {unused.length > 0 && (
        <div className='max-w-[240px]'>
          <Combobox
            name='fibre-part-add'
            placeholder='+ part'
            searchPlaceholder='part of the garment'
            filter={() => [
              {
                key: 'parts',
                label: 'parts of the label',
                options: unused.map((p) => ({ value: p, label: LABEL_PART_NAME[p] })),
              },
            ]}
            onSelect={(p) =>
              setRows([...rows, { part: p as Part, fiberCode: '', pct: 100, key: ++seq }])
            }
          />
        </div>
      )}

      <div className='flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-hairline pt-4'>
        {otherCount > 0 ? (
          <label className='flex cursor-pointer items-center gap-2'>
            <CheckboxCommon
              name='composition-all-colourways'
              checked={all}
              onChange={(on: boolean) => {
                setAll(on);
                if (on) push(rows, true);
              }}
            />
            <Text size='micro' className='uppercase tracking-label'>
              also the other {otherCount} {otherCount === 1 ? 'colourway' : 'colourways'}
            </Text>
          </label>
        ) : (
          <span />
        )}
        <button type='button' className={linkClass} onClick={onDone} data-fibre-done=''>
          done
        </button>
      </div>
    </div>
  );
}
