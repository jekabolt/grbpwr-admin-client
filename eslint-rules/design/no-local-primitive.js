const SUFFIXES = ['Section', 'Panel', 'Card', 'Block', 'Chip', 'Pill', 'Badge', 'Button'];

function suffixOf(name) {
  if (!/^[A-Z]/u.test(name)) return undefined;
  return SUFFIXES.find((suffix) => name.endsWith(suffix));
}

function isExported(node, context) {
  const parent = node.parent ?? context.sourceCode.getAncestors(node).at(-1);
  return parent?.type === 'ExportNamedDeclaration' || parent?.type === 'ExportDefaultDeclaration';
}

function containsJsx(root) {
  const seen = new WeakSet();
  const walk = (node) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return false;
    seen.add(node);
    if (node.type === 'JSXElement' || node.type === 'JSXFragment') return true;
    for (const [key, value] of Object.entries(node)) {
      if (['parent', 'loc', 'range', 'tokens', 'comments'].includes(key)) continue;
      if (Array.isArray(value)) {
        if (value.some(walk)) return true;
      } else if (walk(value)) {
        return true;
      }
    }
    return false;
  };
  return walk(root);
}

function recommendation(suffix) {
  if (['Section', 'Panel', 'Card', 'Block'].includes(suffix)) {
    return "Use Section or SectionStack from 'ui'.";
  }
  if (suffix === 'Chip') return "Use Chip from 'ui'.";
  if (suffix === 'Button') return "Use Button from 'ui'.";
  return "Use Pill from 'ui'.";
}

function report(context, node, name) {
  const suffix = suffixOf(name);
  if (!suffix) return;
  context.report({
    node,
    message: `Do not declare local primitive "${name}". ${recommendation(suffix)}`,
  });
}

export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'Prevent screen-local replacements for shared design primitives.' },
    schema: [],
  },
  create(context) {
    return {
      FunctionDeclaration(node) {
        if (!node.id || !suffixOf(node.id.name)) return;
        if (isExported(node, context) || containsJsx(node.body))
          report(context, node.id, node.id.name);
      },
      VariableDeclarator(node) {
        if (node.id.type !== 'Identifier' || !suffixOf(node.id.name) || !node.init) return;
        const declaration = node.parent;
        if (
          containsJsx(node.init) ||
          (declaration?.type === 'VariableDeclaration' && isExported(declaration, context))
        ) {
          report(context, node.id, node.id.name);
        }
      },
    };
  },
};
