import { visitClassValues } from './class-values.js';
import { jsxName, leadingText } from './jsx-door-text.js';

const CLICKABLE = new Set(['button', 'Button', 'select', 'a', 'Link']);

function hasDashedClass(node) {
  const attribute = node.openingElement.attributes.find(
    (item) =>
      item.type === 'JSXAttribute' &&
      item.name.type === 'JSXIdentifier' &&
      item.name.name === 'className',
  );
  if (!attribute?.value) return false;
  let dashed = false;
  visitClassValues(attribute.value, (value) => {
    if (value.split(/\s+/u).includes('border-dashed')) dashed = true;
  });
  return dashed;
}

/**
 * The add door has one form: `AddDoor` from 'ui' (or `addDoorClass` on a native `<select>`). A
 * clickable whose class list says `border-dashed` and whose text starts with `+` is the same door
 * drawn by hand.
 */
export default {
  meta: {
    type: 'suggestion',
    docs: { description: "Draw the dashed + door with AddDoor from 'ui'." },
    schema: [],
  },
  create(context) {
    return {
      JSXElement(node) {
        if (!CLICKABLE.has(jsxName(node))) return;
        if (!hasDashedClass(node)) return;
        if (!leadingText(node, CLICKABLE).startsWith('+')) return;
        context.report({
          node: node.openingElement,
          message: "Use AddDoor from 'ui' (addDoorClass on a <select>) for the dashed + door.",
        });
      },
    };
  },
};
