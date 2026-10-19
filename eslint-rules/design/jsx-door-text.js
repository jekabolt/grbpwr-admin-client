/**
 * Shared helpers for the door rules (back link, add door): the element's name and the first piece
 * of text a reader meets inside it.
 */

export function jsxName(node) {
  const name = node.openingElement?.name ?? node.name;
  if (!name) return null;
  if (name.type === 'JSXIdentifier') return name.name;
  if (name.type === 'JSXMemberExpression') return name.property.name;
  return null;
}

function meaningful(child) {
  if (child.type === 'JSXText') return child.value.trim() !== '';
  if (child.type === 'JSXExpressionContainer')
    return child.expression.type !== 'JSXEmptyExpression';
  return true;
}

/**
 * The first text a reader meets: descend through the FIRST meaningful child while it is an
 * element or a fragment; stop at anything dynamic. `'+ colour'`, `<span>+ colour</span>` and
 * `<Text>← back</Text>` all resolve; `{empty ? … : …}`, `<Pictogram /> + …` and an `aria-hidden`
 * glyph do not, so a picture tile that leads with a drawing is not read as a door.
 */
export function leadingText(node, stopAt = new Set()) {
  const first = (node.children ?? []).find(meaningful);
  if (!first) return '';
  if (first.type === 'JSXText') return first.value.trim();
  if (first.type === 'JSXExpressionContainer') {
    const expression = first.expression;
    if (expression.type === 'Literal' && typeof expression.value === 'string') {
      return expression.value.trim();
    }
    if (expression.type === 'TemplateLiteral') return expression.quasis[0].value.cooked.trim();
    return '';
  }
  if (first.type === 'JSXFragment') return leadingText(first, stopAt);
  if (first.type === 'JSXElement') {
    // A decorative glyph (`aria-hidden`) is a picture of a plus, not the door's words.
    const hidden = first.openingElement.attributes.some(
      (item) =>
        item.type === 'JSXAttribute' &&
        item.name.type === 'JSXIdentifier' &&
        item.name.name === 'aria-hidden',
    );
    // A nested clickable (`<Button asChild><Link>`) is its own door and reports itself.
    if (hidden || stopAt.has(jsxName(first))) return '';
    return leadingText(first, stopAt);
  }
  return '';
}

export function staticAttr(node, name) {
  const attribute = node.openingElement.attributes.find(
    (item) =>
      item.type === 'JSXAttribute' && item.name.type === 'JSXIdentifier' && item.name.name === name,
  );
  if (!attribute?.value) return null;
  if (attribute.value.type === 'Literal') return String(attribute.value.value);
  if (
    attribute.value.type === 'JSXExpressionContainer' &&
    attribute.value.expression.type === 'Literal'
  ) {
    return String(attribute.value.expression.value);
  }
  return null;
}
