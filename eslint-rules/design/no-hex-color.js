const HEX_COLOR = /#[\da-f]{8}|#[\da-f]{6}|#[\da-f]{4}|#[\da-f]{3}/giu;

function isTsx(context) {
  return context.filename.replaceAll('\\', '/').endsWith('.tsx');
}

function isNumericReference(value, match) {
  if (!/^#\d{3}$/u.test(match[0]) || value.trim() === match[0]) return false;
  const proseWithoutReference = `${value.slice(0, match.index)}${value.slice(
    match.index + match[0].length,
  )}`;
  const hasCssContext =
    /(?:bg-|text-|border-|fill-|stroke-|shadow-|color|background|gradient)/iu.test(
      proseWithoutReference,
    ) || value[match.index - 1] === '[';
  return /[a-z]/iu.test(proseWithoutReference) && !hasCssContext;
}

function reportHexes(context, node, value) {
  for (const match of value.matchAll(HEX_COLOR)) {
    const before = match.index === 0 ? '' : value[match.index - 1];
    const after = value[match.index + match[0].length] ?? '';
    if (
      /[\da-z_-]/iu.test(before) ||
      /[\da-z_-]/iu.test(after) ||
      isNumericReference(value, match)
    ) {
      continue;
    }
    context.report({
      node,
      message: `Replace ${match[0]} with a named color token such as bg-bgColor, text-textColor, border-borderColor, or a semantic status color.`,
    });
  }
}

export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'Disallow hexadecimal colors outside the design-token layer.' },
    schema: [],
  },
  create(context) {
    if (!isTsx(context)) return {};
    return {
      Literal(node) {
        if (typeof node.value === 'string') reportHexes(context, node, node.value);
      },
      TemplateElement(node) {
        reportHexes(context, node, node.value.raw);
      },
    };
  },
};
