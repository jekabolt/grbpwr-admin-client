// Local editor model for the predicate tree + serialization to/from the generated
// proto shape (common_SegmentPredicate / common_SegmentNode).
//
// Why a separate local model instead of editing the proto node directly:
//  - every node needs a stable React key across edits (uuid `id`); the proto has
//    no such field, and reusing array indices as keys makes reorders/removes drop
//    input focus and lose state.
//  - a discriminated union ('group' | 'leaf') lets TS enforce that groups carry
//    children and leaves carry field/operator/values, which the flat proto node
//    (everything optional) does not.
//
// Op mapping — the generated common_SegmentOp is a STRING union, not a numeric
// enum: SEGMENT_OP_UNKNOWN (leaf) | SEGMENT_OP_AND | SEGMENT_OP_OR.

import { common_SegmentNode, common_SegmentPredicate } from 'api/proto-http/admin';
import { v4 as uuidv4 } from 'uuid';
import {
  arityForOperator,
  defaultOperatorForField,
  FIELDS,
  getFieldDef,
  Operator,
  operatorsForField,
} from './catalog';

export type BoolOp = 'AND' | 'OR';

export type GroupNode = {
  kind: 'group';
  id: string;
  op: BoolOp;
  children: PredicateNode[];
};

export type LeafNode = {
  kind: 'leaf';
  id: string;
  field: string;
  operator: string;
  values: string[];
};

export type PredicateNode = GroupNode | LeafNode;

// Max nesting depth the backend accepts (root group = depth 1). Deeper is rejected.
export const MAX_DEPTH = 6;

// ── constructors ──────────────────────────────────────────────────────────────

export function newGroup(op: BoolOp = 'AND'): GroupNode {
  return { kind: 'group', id: uuidv4(), op, children: [] };
}

// A fresh segment starts as an empty root AND group ("everyone" until conditions
// are added).
export function newRootGroup(): GroupNode {
  return newGroup('AND');
}

export function newLeaf(): LeafNode {
  // Seed with the first catalog field + its first allowed operator so the leaf is
  // immediately valid/serializable.
  const field = FIELDS[0].field;
  const operator = defaultOperatorForField(field);
  return { kind: 'leaf', id: uuidv4(), field, operator, values: [] };
}

// ── proto op <-> local op ─────────────────────────────────────────────────────

function boolOpToProto(op: BoolOp): common_SegmentNode['op'] {
  return op === 'OR' ? 'SEGMENT_OP_OR' : 'SEGMENT_OP_AND';
}

// ── serialize: local model -> proto ───────────────────────────────────────────

// Convert a single node to the proto shape. Groups recurse; empty nested groups
// (a group whose children all pruned away) are dropped so we never emit an invalid
// empty AND/OR. Returns undefined when the node prunes to nothing.
function nodeToProto(node: PredicateNode): common_SegmentNode | undefined {
  if (node.kind === 'leaf') {
    return {
      op: 'SEGMENT_OP_UNKNOWN',
      children: undefined,
      field: node.field,
      operator: node.operator,
      values: node.values,
    };
  }
  const children = node.children
    .map(nodeToProto)
    .filter((c): c is common_SegmentNode => c !== undefined);
  if (children.length === 0) return undefined;
  return {
    op: boolOpToProto(node.op),
    children,
    field: undefined,
    operator: undefined,
    values: undefined,
  };
}

// Serialize the editor root into a SegmentPredicate.
//
// EMPTY-PREDICATE CONTRACT: an empty root group (zero effective conditions) means
// "everyone". The backend's Compile treats a nil root as everyone, so we send
// `{ root: undefined }` rather than an invalid empty AND node. Callers may then
// also choose to omit the whole predicate — either way `root` is absent.
export function toPredicate(root: PredicateNode): common_SegmentPredicate {
  return { root: nodeToProto(root) };
}

// True when the tree carries no effective conditions (serializes to "everyone").
export function isEmptyPredicate(root: PredicateNode): boolean {
  return nodeToProto(root) === undefined;
}

// ── leaf completeness ─────────────────────────────────────────────────────────
// Mirror of the backend compiler's per-leaf checks: it rejects a value count that
// doesn't match the operator's arity (ErrArity "wrong number of values for
// operator") and blank values (ErrBadValue '"" is not a decimal'), but the failure
// comes back as ONE opaque error for the whole tree. Walking the leaves here lets
// the editor block the call and point at the condition that is actually incomplete.

export type LeafIssue = { id: string; message: string };

function leafIssue(leaf: LeafNode): string | undefined {
  if (!getFieldDef(leaf.field)) return 'pick a field';
  if (!(operatorsForField(leaf.field) as string[]).includes(leaf.operator)) {
    return 'pick a condition';
  }
  const filled = leaf.values.filter((v) => (v ?? '').trim() !== '');
  switch (arityForOperator(leaf.operator as Operator)) {
    case 0:
      return undefined;
    case 1:
      return filled.length === 1 ? undefined : 'enter a value';
    case 2:
      return filled.length === 2 ? undefined : 'enter both ends of the range';
    default:
      return filled.length > 0 ? undefined : 'add at least one value';
  }
}

// Every incomplete leaf in the tree, in document order (empty = safe to send).
export function validateTree(root: PredicateNode): LeafIssue[] {
  const issues: LeafIssue[] = [];
  const walk = (node: PredicateNode) => {
    if (node.kind === 'group') {
      node.children.forEach(walk);
      return;
    }
    const message = leafIssue(node);
    if (message) issues.push({ id: node.id, message });
  };
  walk(root);
  return issues;
}

// ── deserialize: proto -> local model ─────────────────────────────────────────

function nodeFromProto(n: common_SegmentNode): PredicateNode {
  const isGroup =
    n.op === 'SEGMENT_OP_AND' ||
    n.op === 'SEGMENT_OP_OR' ||
    (n.children !== undefined && n.children.length > 0 && !n.field);
  if (isGroup) {
    return {
      kind: 'group',
      id: uuidv4(),
      op: n.op === 'SEGMENT_OP_OR' ? 'OR' : 'AND',
      children: (n.children ?? []).map(nodeFromProto),
    };
  }
  const field = n.field ?? FIELDS[0].field;
  // Fall back to a valid operator if the stored one is no longer in the catalog.
  const allowed = operatorsForField(field);
  const operator =
    n.operator && (allowed as string[]).includes(n.operator)
      ? n.operator
      : defaultOperatorForField(field);
  return {
    kind: 'leaf',
    id: uuidv4(),
    field,
    operator,
    values: n.values ?? [],
  };
}

// Rebuild the editor tree from a stored predicate. A nil/absent root ("everyone")
// deserializes to a fresh empty root AND group. A stored leaf-at-root is wrapped in
// an AND group so the editor invariant "root is always a group" holds.
export function fromPredicate(pred: common_SegmentPredicate | undefined): GroupNode {
  const root = pred?.root;
  if (!root) return newRootGroup();
  const node = nodeFromProto(root);
  if (node.kind === 'group') return node;
  const g = newRootGroup();
  g.children = [node];
  return g;
}

// ── immutable tree edits (return a new tree; keep unrelated nodes referentially
//    stable so React only re-renders the changed branch) ─────────────────────────

export function updateNode(
  root: GroupNode,
  id: string,
  updater: (node: PredicateNode) => PredicateNode,
): GroupNode {
  return mapTree(root, id, updater) as GroupNode;
}

function mapTree(
  node: PredicateNode,
  id: string,
  updater: (node: PredicateNode) => PredicateNode,
): PredicateNode {
  if (node.id === id) return updater(node);
  if (node.kind === 'group') {
    let changed = false;
    const children = node.children.map((c) => {
      const next = mapTree(c, id, updater);
      if (next !== c) changed = true;
      return next;
    });
    return changed ? { ...node, children } : node;
  }
  return node;
}

export function removeNode(root: GroupNode, id: string): GroupNode {
  const prune = (node: PredicateNode): PredicateNode => {
    if (node.kind !== 'group') return node;
    const children = node.children
      .filter((c) => c.id !== id)
      .map((c) => (c.kind === 'group' ? prune(c) : c));
    return { ...node, children };
  };
  return prune(root) as GroupNode;
}

export function addChild(root: GroupNode, groupId: string, child: PredicateNode): GroupNode {
  return updateNode(root, groupId, (node) => {
    if (node.kind !== 'group') return node;
    return { ...node, children: [...node.children, child] };
  });
}
