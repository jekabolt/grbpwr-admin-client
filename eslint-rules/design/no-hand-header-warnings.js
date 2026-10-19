// A block's problems are counted ONE way: `<HeaderWarnings items={…} />` from 'ui' — the quiet
// `! N warnings` door in the header, the list behind it. This rule catches the hand-drawn forms:
//   <span className='text-warning'>!</span> {n} waiting      (a coloured `!` glyph)
//   `! ${n} blocking`                                         (a counted `!` string)
//   <Text variant='errorLabel'>{n} blocking holes</Text>     (a red count of problems)
//   cn(HEADER_TEXT, 'text-error …')                           (header type painted red/yellow)

const MESSAGE = "Use HeaderWarnings from 'ui' for a block's problem count, not a hand-drawn `! N`.";
const ALARM = /(^|\s)(?:[a-z-]+:)*text-(?:error|warning)(\s|$)/u;
const PROBLEM_NOUN =
  /^\s*(?:blocking|blockers?|warnings?|errors?|issues?|problems?|holes?|open)\b/u;

function staticClass(opening) {
  const attribute = opening.attributes.find(
    (a) =>
      a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === 'className',
  );
  if (!attribute?.value) return '';
  const strings = [];
  const visit = (node) => {
    if (!node) return;
    if (node.type === 'Literal' && typeof node.value === 'string') strings.push(node.value);
    else if (node.type === 'TemplateLiteral')
      node.quasis.forEach((q) => strings.push(q.value.cooked));
    else if (node.type === 'JSXExpressionContainer') visit(node.expression);
    else if (node.type === 'CallExpression') node.arguments.forEach(visit);
    else if (node.type === 'ConditionalExpression')
      [node.consequent, node.alternate].forEach(visit);
    else if (node.type === 'LogicalExpression') visit(node.right);
  };
  visit(attribute.value);
  return strings.join(' ');
}

function staticAttribute(opening, name) {
  const attribute = opening.attributes.find(
    (a) => a.type === 'JSXAttribute' && a.name.type === 'JSXIdentifier' && a.name.name === name,
  );
  return attribute?.value?.type === 'Literal' ? attribute.value.value : null;
}

function meaningful(children) {
  return children.filter((child) => !(child.type === 'JSXText' && !child.value.trim()));
}

function isAlarmed(opening) {
  return ALARM.test(staticClass(opening)) || staticAttribute(opening, 'variant') === 'errorLabel';
}

export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'Require HeaderWarnings for a counted problem door.' },
    schema: [],
  },
  create(context) {
    return {
      JSXElement(node) {
        const children = meaningful(node.children);
        if (!isAlarmed(node.openingElement)) return;
        // a coloured `!` glyph on its own (a framed `!` button is a per-row caveat, not a count)
        const tag =
          node.openingElement.name.type === 'JSXIdentifier' ? node.openingElement.name.name : '';
        if (
          tag === 'span' &&
          children.length === 1 &&
          children[0].type === 'JSXText' &&
          children[0].value.trim() === '!'
        ) {
          context.report({ node, message: MESSAGE });
          return;
        }
        // a red/yellow `{n} blocking …`
        const [first, second] = children;
        if (
          first?.type === 'JSXExpressionContainer' &&
          second?.type === 'JSXText' &&
          PROBLEM_NOUN.test(second.value)
        ) {
          context.report({ node, message: MESSAGE });
        }
      },
      TemplateLiteral(node) {
        // `! ${n} blocking`
        if (node.expressions.length === 0) return;
        if (node.quasis[0].value.cooked.trim() !== '!') return;
        if (!PROBLEM_NOUN.test(node.quasis[1]?.value.cooked ?? '')) return;
        context.report({ node, message: MESSAGE });
      },
      CallExpression(node) {
        // cn(HEADER_TEXT, 'text-error …')
        const [head, ...rest] = node.arguments;
        if (head?.type !== 'Identifier' || head.name !== 'HEADER_TEXT') return;
        if (
          rest.some(
            (a) => a.type === 'Literal' && typeof a.value === 'string' && ALARM.test(a.value),
          )
        ) {
          context.report({ node, message: MESSAGE });
        }
      },
    };
  },
};
