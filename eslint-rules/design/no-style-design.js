const DESIGN_KEY =
  /^(?:color|background.*|margin.*|padding.*|(?:row|column)?gap|font.*|lineHeight|letterSpacing|border.*|boxShadow|textShadow)$/u;

function propertyName(property) {
  if (property.computed) return null;
  if (property.key.type === 'Identifier') return property.key.name;
  if (property.key.type === 'Literal') return String(property.key.value);
  return null;
}

function containsLiteralDesignValue(node) {
  if (!node) return false;
  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'string' || typeof node.value === 'number';
    case 'TemplateLiteral':
      return node.expressions.length === 0;
    case 'UnaryExpression':
      return containsLiteralDesignValue(node.argument);
    case 'ConditionalExpression':
      return (
        containsLiteralDesignValue(node.consequent) || containsLiteralDesignValue(node.alternate)
      );
    case 'LogicalExpression':
      return containsLiteralDesignValue(node.left) || containsLiteralDesignValue(node.right);
    case 'TSAsExpression':
    case 'TSNonNullExpression':
    case 'TSSatisfiesExpression':
    case 'TSTypeAssertion':
      return containsLiteralDesignValue(node.expression);
    default:
      return false;
  }
}

function alternative(key) {
  if (/^(?:color|background)/u.test(key)) {
    return 'Use named color classes such as text-textColor, bg-bgColor, or a semantic status color.';
  }
  if (/^(?:margin|padding|(?:row|column)?gap)/u.test(key)) {
    return 'Use named spacing classes such as p-block, gap-stack, or gap-gutter.';
  }
  if (/^(?:font|lineHeight|letterSpacing)/u.test(key)) {
    return "Use Text from 'ui' or a named typography class.";
  }
  return "Use the matching primitive from 'ui' or a named border/elevation token.";
}

export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'Disallow literal design decisions in JSX style objects.' },
    schema: [],
  },
  create(context) {
    return {
      JSXAttribute(node) {
        if (
          node.name.type !== 'JSXIdentifier' ||
          node.name.name !== 'style' ||
          node.value?.type !== 'JSXExpressionContainer' ||
          node.value.expression.type !== 'ObjectExpression'
        ) {
          return;
        }

        for (const property of node.value.expression.properties) {
          if (property.type !== 'Property') continue;
          const key = propertyName(property);
          if (!key || !DESIGN_KEY.test(key) || !containsLiteralDesignValue(property.value))
            continue;
          context.report({
            node: property,
            message: `Move literal style "${key}" to the design system. ${alternative(key)}`,
          });
        }
      },
    };
  },
};
