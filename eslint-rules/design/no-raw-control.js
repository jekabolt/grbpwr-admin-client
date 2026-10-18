const CONTROL_MESSAGES = {
  button: 'Use Button from src/ui/components/button instead of raw <button>.',
  input: 'Use Input from src/ui/components/input instead of raw <input>.',
  checkbox: 'Use Checkbox from src/ui/components/checkbox instead of raw checkbox input.',
  switch: 'Use ToggleSwitch from src/ui/components/toggle-switch instead of raw checkbox switch.',
  select: 'Use Select, Selector, or Combobox from src/ui/components instead of raw <select>.',
  textarea: 'Use Textarea from src/ui/components/text-area instead of raw <textarea>.',
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

export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'Require shared UI primitives for native form controls.' },
    schema: [],
  },
  create(context) {
    return {
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
