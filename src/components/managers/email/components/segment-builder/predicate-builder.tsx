// Recursive predicate-tree editor. Plain controlled state (a GroupNode root) rather
// than react-hook-form: a self-referential AND/OR tree with per-node add/remove maps
// far more naturally to immutable recursion than RHF's flat useFieldArray, and it
// keeps focus/stability across edits via each node's uuid key.
//
// GROUP node: AND/OR toggle + children (indented/carded) + add-condition / add-group
//             / remove. Nesting is capped at MAX_DEPTH (add-group disables past it —
//             the backend rejects depth > 6).
// LEAF node:  field -> operator (filtered to the field) -> value input(s). Changing
//             the field resets operator + values; changing the operator resizes values.

import { cn } from 'lib/utility';
import { Button } from 'ui/components/button';
import Select from 'ui/components/select';
import Text from 'ui/components/text';
import {
  defaultOperatorForField,
  FIELDS,
  fieldsByGroup,
  getFieldDef,
  operatorLabel,
  operatorsForField,
} from './catalog';
import {
  BoolOp,
  GroupNode,
  LeafNode,
  MAX_DEPTH,
  newGroup,
  newLeaf,
  PredicateNode,
} from './predicate-model';
import { resizeValues, ValueInputs } from './value-inputs';

// Field picker items — profile fields first, then behavioral (the base Select has no
// native optgroup support, so grouping is conveyed by order + the group caption).
const GROUPED = fieldsByGroup();
const FIELD_ITEMS = [...GROUPED.profile, ...GROUPED.behavioral].map((f) => ({
  value: f.field,
  label: f.label,
}));

function AndOrToggle({
  value,
  onChange,
  disabled,
}: {
  value: BoolOp;
  onChange: (op: BoolOp) => void;
  disabled?: boolean;
}) {
  return (
    <div className='flex border border-textInactiveColor'>
      {(['AND', 'OR'] as const).map((op) => (
        <button
          key={op}
          type='button'
          disabled={disabled}
          onClick={() => onChange(op)}
          className={cn(
            'px-2.5 py-1 leading-none transition-colors',
            value === op
              ? 'bg-textColor text-bgColor'
              : 'text-textColor hover:bg-textColor hover:text-bgColor',
            disabled && 'pointer-events-none opacity-60',
          )}
        >
          <Text size='small' variant='uppercase' className={value === op ? '!text-bgColor' : ''}>
            {op}
          </Text>
        </button>
      ))}
    </div>
  );
}

function LeafRow({
  node,
  onChange,
  onRemove,
  disabled,
}: {
  node: LeafNode;
  onChange: (n: LeafNode) => void;
  onRemove: () => void;
  disabled?: boolean;
}) {
  const fieldDef = getFieldDef(node.field) ?? FIELDS[0];
  const ops = operatorsForField(node.field);

  const onFieldChange = (field: string) => {
    // New field => reset operator to its first allowed op and clear values.
    onChange({ ...node, field, operator: defaultOperatorForField(field), values: [] });
  };
  const onOperatorChange = (operator: string) => {
    onChange({ ...node, operator, values: resizeValues(node.values, operator) });
  };

  return (
    <div className='flex flex-col gap-2 border border-textInactiveColor bg-bgColor p-2 lg:flex-row lg:items-start'>
      <div className='shrink-0 lg:w-[190px]'>
        <Select
          name={`field-${node.id}`}
          items={FIELD_ITEMS}
          value={node.field}
          onValueChange={onFieldChange}
          placeholder='field'
          readOnly={disabled}
          fullWidth
        />
      </div>
      <div className='shrink-0 lg:w-[150px]'>
        <Select
          name={`op-${node.id}`}
          items={ops.map((op) => ({ value: op, label: operatorLabel(op, fieldDef.kind) }))}
          value={node.operator}
          onValueChange={onOperatorChange}
          placeholder='operator'
          readOnly={disabled}
          fullWidth
        />
      </div>
      <div className='min-w-0 flex-1'>
        <ValueInputs
          fieldDef={fieldDef}
          operator={node.operator}
          values={node.values}
          onChange={(values) => onChange({ ...node, values })}
          disabled={disabled}
          name={`val-${node.id}`}
        />
      </div>
      {!disabled && (
        <button
          type='button'
          onClick={onRemove}
          aria-label='remove condition'
          className='shrink-0 self-start leading-none lg:pt-1'
        >
          <Text size='small' variant='inactive'>
            [x]
          </Text>
        </button>
      )}
    </div>
  );
}

function GroupNodeCard({
  node,
  depth,
  isRoot,
  onChange,
  onRemove,
  disabled,
}: {
  node: GroupNode;
  depth: number;
  isRoot?: boolean;
  onChange: (n: GroupNode) => void;
  onRemove?: () => void;
  disabled?: boolean;
}) {
  const canNestDeeper = depth < MAX_DEPTH;

  const replaceChild = (id: string, next: PredicateNode) =>
    onChange({ ...node, children: node.children.map((c) => (c.id === id ? next : c)) });
  const removeChild = (id: string) =>
    onChange({ ...node, children: node.children.filter((c) => c.id !== id) });
  const addLeaf = () => onChange({ ...node, children: [...node.children, newLeaf()] });
  const addGroup = () => onChange({ ...node, children: [...node.children, newGroup('AND')] });

  return (
    <div
      className={cn(
        'flex flex-col gap-3 border p-3',
        isRoot ? 'border-textColor' : 'border-textInactiveColor',
      )}
    >
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex items-center gap-2'>
          <AndOrToggle value={node.op} onChange={(op) => onChange({ ...node, op })} disabled={disabled} />
          <Text size='small' variant='inactive'>
            {node.op === 'AND' ? 'match ALL of' : 'match ANY of'}
          </Text>
        </div>
        {!isRoot && !disabled && onRemove && (
          <button type='button' onClick={onRemove} aria-label='remove group' className='leading-none'>
            <Text size='small' variant='inactive'>
              remove group
            </Text>
          </button>
        )}
      </div>

      {node.children.length === 0 ? (
        <Text size='small' variant='inactive'>
          no conditions — matches everyone. add a condition to narrow the audience.
        </Text>
      ) : (
        <div className='flex flex-col gap-2 border-l border-textInactiveColor pl-3'>
          {node.children.map((child) =>
            child.kind === 'leaf' ? (
              <LeafRow
                key={child.id}
                node={child}
                onChange={(n) => replaceChild(child.id, n)}
                onRemove={() => removeChild(child.id)}
                disabled={disabled}
              />
            ) : (
              <GroupNodeCard
                key={child.id}
                node={child}
                depth={depth + 1}
                onChange={(n) => replaceChild(child.id, n)}
                onRemove={() => removeChild(child.id)}
                disabled={disabled}
              />
            ),
          )}
        </div>
      )}

      {!disabled && (
        <div className='flex flex-wrap gap-2'>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            className='px-2 py-1 uppercase'
            onClick={addLeaf}
          >
            + condition
          </Button>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            className='px-2 py-1 uppercase'
            onClick={addGroup}
            disabled={!canNestDeeper}
            title={canNestDeeper ? undefined : `max nesting depth (${MAX_DEPTH}) reached`}
          >
            + group
          </Button>
        </div>
      )}
    </div>
  );
}

// Top-level predicate-tree editor. `value` is the root group; `onChange` receives the
// next root on every edit (fully controlled — the parent owns the state).
export function PredicateBuilder({
  value,
  onChange,
  disabled,
}: {
  value: GroupNode;
  onChange: (root: GroupNode) => void;
  disabled?: boolean;
}) {
  return <GroupNodeCard node={value} depth={1} isRoot onChange={onChange} disabled={disabled} />;
}
