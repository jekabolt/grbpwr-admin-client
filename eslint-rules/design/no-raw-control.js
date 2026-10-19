const CONTROL_MESSAGES = {
  button: "Use Button from 'ui' instead of raw <button>.",
  close: "Use Close from 'ui' instead of a raw close glyph.",
  input: "Use Input from 'ui' instead of raw <input>.",
  checkbox: "Use CheckboxCommon from 'ui' instead of raw checkbox input.",
  switch: "Use ToggleSwitch from 'ui' instead of raw checkbox switch.",
  select: "Use Select, Selector, or Combobox from 'ui' instead of raw <select>.",
  textarea: "Use Textarea from 'ui' instead of raw <textarea>.",
};

function elementName(node) {
  return node.name.type === 'JSXIdentifier' ? node.name.name : null;
}

function staticAttribute(node, name) {
  const attribute = node.attributes.find(
    (item) =>
      item.type === 'JSXAttribute' && item.name.type === 'JSXIdentifier' && item.name.name === name,
  );
  if (!attribute?.value) return null;
  if (attribute.value.type === 'Literal') return attribute.value.value;
  if (
    attribute.value.type === 'JSXExpressionContainer' &&
    attribute.value.expression.type === 'Literal'
  ) {
    return attribute.value.expression.value;
  }
  return null;
}

function isCloseGlyph(node) {
  return /^[×✕✖]$/u.test(node.value.trim());
}

function insideButton(node) {
  let current = node.parent;
  while (current) {
    if (current.type === 'JSXElement') {
      const name = elementName(current.openingElement);
      if (name === 'button' || name === 'Button') return true;
    }
    current = current.parent;
  }
  return false;
}

export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'Require shared UI primitives for native form controls.' },
    schema: [],
  },
  create(context) {
    return {
      JSXText(node) {
        if (isCloseGlyph(node) && insideButton(node)) {
          context.report({ node, message: CONTROL_MESSAGES.close });
        }
      },
      JSXOpeningElement(node) {
        const name = elementName(node);
        if (!['button', 'input', 'select', 'textarea'].includes(name)) return;

        if (name === 'input') {
          const type = staticAttribute(node, 'type');
          // Browsers own the file-picker element. The available PatternUploadButton is deliberately
          // domain-specific (PDF/DXF patterns), while generic media/file pickers have no UI primitive.
          if (type === 'file') return;
          const role = staticAttribute(node, 'role');
          const message =
            type === 'checkbox'
              ? role === 'switch'
                ? CONTROL_MESSAGES.switch
                : CONTROL_MESSAGES.checkbox
              : CONTROL_MESSAGES.input;
          context.report({ node, message });
          return;
        }

        context.report({ node, message: CONTROL_MESSAGES[name] });
      },
    };
  },
};
