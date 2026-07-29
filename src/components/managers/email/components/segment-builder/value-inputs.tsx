// Value inputs for a leaf condition — count + type driven by the field catalog.
//
//  arity 0        (is_set / is_not_set)   -> nothing
//  arity 1        (eq/neq/lt/lte/gt/gte,  -> one scalar input, typed to the field
//                  in_last_days/older_..)    (N-days ops force a non-negative int)
//  arity 2        (between)               -> two ordered scalars (lo, hi)
//  arity 'multi'  (in / not_in)           -> a list: enum -> toggle chips,
//                                            otherwise a tokenizer
// Everything serializes to string[] — the backend parses the strings.

import { cn } from 'lib/utility';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import Input from 'ui/components/input';
import Select from 'ui/components/select';
import Text from 'ui/components/text';
import {
  arityForOperator,
  effectiveValueKind,
  FieldDef,
  Operator,
  ValueKind,
} from './catalog';

const BOOL_ITEMS = [
  { value: 'true', label: 'true' },
  { value: 'false', label: 'false' },
];

function nativeType(kind: ValueKind): 'text' | 'number' | 'date' {
  if (kind === 'date') return 'date';
  if (kind === 'int' || kind === 'decimal') return 'number';
  return 'text';
}

// One scalar value control typed to `kind` (+ enum options / numeric bounds).
function ScalarInput({
  name,
  kind,
  fieldDef,
  isDays,
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  name: string;
  kind: ValueKind;
  fieldDef: FieldDef;
  isDays: boolean;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  if (kind === 'bool') {
    return (
      <Select
        name={name}
        items={BOOL_ITEMS}
        value={value || undefined}
        onValueChange={onChange}
        placeholder='true / false'
        readOnly={disabled}
        fullWidth
      />
    );
  }
  if (kind === 'enum') {
    return (
      <Select
        name={name}
        items={(fieldDef.options ?? []).map((o) => ({ value: o.value, label: o.label }))}
        value={value || undefined}
        onValueChange={onChange}
        placeholder='select'
        readOnly={disabled}
        fullWidth
      />
    );
  }
  // int / decimal / date / string
  const min = isDays ? 0 : fieldDef.min;
  const max = isDays ? undefined : fieldDef.max;
  const step = kind === 'decimal' ? '0.01' : kind === 'int' ? '1' : undefined;
  return (
    <Input
      name={name}
      type={nativeType(kind)}
      value={value}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      disabled={disabled}
      min={min}
      max={max}
      step={step}
      aria-label={ariaLabel}
      placeholder={isDays ? 'days' : undefined}
      className='px-0'
    />
  );
}

// Tokenizer for in / not_in on non-enum fields: chips + an add-input (Enter or
// comma commits; blur commits too).
function TokenInput({
  name,
  kind,
  fieldDef,
  values,
  onChange,
  disabled,
}: {
  name: string;
  kind: ValueKind;
  fieldDef: FieldDef;
  values: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const t = draft.trim();
    if (t && !values.includes(t)) onChange([...values, t]);
    setDraft('');
  };

  return (
    <div className='flex flex-col gap-1.5'>
      {values.length > 0 && (
        <div className='flex flex-wrap gap-1.5'>
          {values.map((v, i) => (
            <span
              key={`${v}-${i}`}
              className='flex items-center gap-1 border border-textInactiveColor px-1.5 py-0.5'
            >
              <Text size='small'>{v}</Text>
              {!disabled && (
                <button
                  type='button'
                  onClick={() => onChange(values.filter((_, j) => j !== i))}
                  aria-label={`remove ${v}`}
                  className='leading-none'
                >
                  <Text size='small' variant='inactive'>
                    [x]
                  </Text>
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {!disabled && (
        <div className='flex items-center gap-2'>
          <Input
            name={name}
            type={nativeType(kind)}
            value={draft}
            min={fieldDef.min}
            max={fieldDef.max}
            step={kind === 'decimal' ? '0.01' : kind === 'int' ? '1' : undefined}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                commit();
              }
            }}
            onBlur={commit}
            aria-label='add value'
            placeholder='add value + enter'
            className='px-0'
          />
          <Button
            type='button'
            variant='secondary'
            size='sm'
            className='whitespace-nowrap px-2 py-1'
            onClick={commit}
            disabled={!draft.trim()}
          >
            add
          </Button>
        </div>
      )}
    </div>
  );
}

// Multi-select for in / not_in on enum fields: click options to include/exclude.
function EnumChips({
  fieldDef,
  values,
  onChange,
  disabled,
}: {
  fieldDef: FieldDef;
  values: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className='flex flex-wrap gap-1.5'>
      {(fieldDef.options ?? []).map((opt) => {
        const active = values.includes(opt.value);
        return (
          <button
            key={opt.value}
            type='button'
            disabled={disabled}
            onClick={() =>
              onChange(active ? values.filter((v) => v !== opt.value) : [...values, opt.value])
            }
            className={cn(
              'border px-2 py-1 leading-none transition-colors',
              active
                ? 'border-textColor bg-textColor text-bgColor'
                : 'border-textInactiveColor hover:bg-textColor hover:text-bgColor',
              disabled && 'pointer-events-none opacity-60',
            )}
          >
            <Text size='small' variant='uppercase' className={active ? '!text-bgColor' : ''}>
              {opt.label}
            </Text>
          </button>
        );
      })}
    </div>
  );
}

export function ValueInputs({
  fieldDef,
  operator,
  values,
  onChange,
  disabled,
  name,
}: {
  fieldDef: FieldDef;
  operator: string;
  values: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
  name: string;
}) {
  const arity = arityForOperator(operator);
  const kind = effectiveValueKind(fieldDef.field, operator);
  const isDays = kind !== fieldDef.kind; // true only for the N-days operators

  if (arity === 0) {
    return (
      <Text size='small' variant='inactive'>
        no value needed
      </Text>
    );
  }

  if (arity === 'multi') {
    if (fieldDef.kind === 'enum') {
      return (
        <EnumChips fieldDef={fieldDef} values={values} onChange={onChange} disabled={disabled} />
      );
    }
    return (
      <TokenInput
        name={name}
        kind={kind}
        fieldDef={fieldDef}
        values={values}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  if (arity === 2) {
    // between: two ordered slots (lo, hi), kept even when one side is blank.
    return (
      <div className='flex items-center gap-2'>
        <ScalarInput
          name={`${name}-lo`}
          kind={kind}
          fieldDef={fieldDef}
          isDays={isDays}
          value={values[0] ?? ''}
          onChange={(v) => onChange([v, values[1] ?? ''])}
          disabled={disabled}
          ariaLabel='from'
        />
        <Text size='small' variant='inactive'>
          and
        </Text>
        <ScalarInput
          name={`${name}-hi`}
          kind={kind}
          fieldDef={fieldDef}
          isDays={isDays}
          value={values[1] ?? ''}
          onChange={(v) => onChange([values[0] ?? '', v])}
          disabled={disabled}
          ariaLabel='to'
        />
      </div>
    );
  }

  // arity 1
  return (
    <ScalarInput
      name={name}
      kind={kind}
      fieldDef={fieldDef}
      isDays={isDays}
      value={values[0] ?? ''}
      onChange={(v) => onChange(v === '' ? [] : [v])}
      disabled={disabled}
      ariaLabel='value'
    />
  );
}

// Resize a leaf's value list to match a newly-chosen operator's arity, preserving
// as much of the prior input as possible.
export function resizeValues(values: string[], operator: Operator | string): string[] {
  const arity = arityForOperator(operator);
  if (arity === 0) return [];
  if (arity === 1) return values.slice(0, 1);
  if (arity === 2) return [values[0] ?? '', values[1] ?? ''];
  return values; // 'multi' keeps the whole list
}
