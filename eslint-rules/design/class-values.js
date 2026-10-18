const CLASS_HELPERS = new Set(['cn', 'clsx', 'classNames']);

function unwrap(node) {
  if (
    node &&
    [
      'ChainExpression',
      'TSAsExpression',
      'TSInstantiationExpression',
      'TSNonNullExpression',
      'TSSatisfiesExpression',
      'TSTypeAssertion',
    ].includes(node.type)
  ) {
    return unwrap(node.expression);
  }
  return node;
}

/**
 * Visit every statically visible class fragment accepted by className or the three class helpers
 * used in this repository. Conditional branches and clsx object keys are classes too.
 */
export function visitClassValues(node, visit) {
  node = unwrap(node);
  if (!node) return;

  switch (node.type) {
    case 'Literal':
      if (typeof node.value === 'string') visit(node.value, node);
      return;
    case 'TemplateLiteral':
      for (const quasi of node.quasis) visit(quasi.value.raw, quasi);
      for (const expression of node.expressions) visitClassValues(expression, visit);
      return;
    case 'JSXExpressionContainer':
      visitClassValues(node.expression, visit);
      return;
    case 'ConditionalExpression':
      visitClassValues(node.consequent, visit);
      visitClassValues(node.alternate, visit);
      return;
    case 'LogicalExpression':
    case 'BinaryExpression':
      visitClassValues(node.left, visit);
      visitClassValues(node.right, visit);
      return;
    case 'ArrayExpression':
      for (const element of node.elements) visitClassValues(element, visit);
      return;
    case 'ObjectExpression':
      for (const property of node.properties) {
        if (property.type === 'SpreadElement') {
          visitClassValues(property.argument, visit);
          continue;
        }
        if (property.computed) {
          visitClassValues(property.key, visit);
        } else if (property.key.type === 'Identifier') {
          visit(property.key.name, property.key);
        } else if (property.key.type === 'Literal' && typeof property.key.value === 'string') {
          visit(property.key.value, property.key);
        }
      }
      return;
    case 'CallExpression':
    case 'NewExpression':
      for (const argument of node.arguments) {
        if (argument.type === 'SpreadElement') visitClassValues(argument.argument, visit);
        else visitClassValues(argument, visit);
      }
      return;
    default:
      return;
  }
}

export function classValueVisitors(check) {
  const seen = new Set();
  const inspect = (node) => {
    visitClassValues(node, (value, valueNode) => {
      check(value, valueNode, (identity, report) => {
        const start =
          valueNode.range?.[0] ?? `${valueNode.loc?.start.line}:${valueNode.loc?.start.column}`;
        const key = `${start}:${identity}`;
        if (seen.has(key)) return;
        seen.add(key);
        report();
      });
    });
  };

  return {
    JSXAttribute(node) {
      if (node.name.type === 'JSXIdentifier' && node.name.name === 'className') inspect(node.value);
    },
    CallExpression(node) {
      if (node.callee.type === 'Identifier' && CLASS_HELPERS.has(node.callee.name)) inspect(node);
    },
  };
}

export function classTokens(value) {
  return value.split(/\s+/u).filter(Boolean);
}
