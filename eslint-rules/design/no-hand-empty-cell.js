// An absent value is drawn ONE way: `<EmptyCell />` from 'ui' (a grey `—`). This rule catches the
// hand-drawn forms in a RENDERED position — a JSX child or the `value` of Row / RowTotal / Stat:
//   {x ?? '—'}   {x || '-'}   {ok ? v : 'n/a'}   <span className='text-labelColor'>—</span>
// String contexts (template literals, `title=`, accessor functions, text built for a tooltip)
// are not rendered cells and stay plain strings. A literal fallback gets an autofix that swaps it
// for `<EmptyCell />` and adds the import.

const MARKERS = new Set(['—', '–', '-', 'n/a', 'N/A']);
// Elements whose children must be plain text: a React element inside them is invalid or lost.
const TEXT_ONLY = new Set(['option', 'text', 'tspan', 'textPath', 'title', 'textarea']);
const VALUE_HOSTS = new Set(['Row', 'RowTotal', 'Stat']);
const MESSAGE = "Use <EmptyCell /> from 'ui' for an absent value, not a hand-drawn dash.";

function stringValue(node) {
  if (!node) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }
  return null;
}

function isMarker(node) {
  const value = stringValue(node);
  return value !== null && MARKERS.has(value);
}

function elementName(opening) {
  const name = opening?.name;
  if (!name) return null;
  if (name.type === 'JSXIdentifier') return name.name;
  if (name.type === 'JSXMemberExpression') return name.property.name;
  return null;
}

// Walk from a marker literal up through fallbacks (`??`, `||`, ternary branches, `as`) to the
// place the value lands. Returns the JSX host when that place is rendered, else null.
function renderedHost(literal) {
  let node = literal;
  for (;;) {
    const parent = node.parent;
    if (!parent) return null;
    if (parent.type === 'LogicalExpression') {
      if (parent.right !== node || (parent.operator !== '??' && parent.operator !== '||')) {
        return null;
      }
    } else if (parent.type === 'ConditionalExpression') {
      if (parent.test === node) return null;
      // `{neg ? '-' : ''}` is a sign, `{i ? '—' : null}` a separator: a fallback has a value
      // on the other side, not an empty string.
      const other = parent.consequent === node ? parent.alternate : parent.consequent;
      if (stringValue(other) === '') return null;
    } else if (parent.type === 'TSAsExpression' || parent.type === 'TSNonNullExpression') {
      // transparent
    } else if (parent.type === 'JSXExpressionContainer') {
      const host = parent.parent;
      if (host?.type === 'JSXElement') {
        const name = elementName(host.openingElement);
        return TEXT_ONLY.has(name) ? null : host;
      }
      if (host?.type === 'JSXFragment') return host;
      if (host?.type === 'JSXAttribute') {
        const attribute = host.name.type === 'JSXIdentifier' ? host.name.name : null;
        const name = elementName(host.parent);
        return attribute === 'value' && VALUE_HOSTS.has(name) ? host : null;
      }
      return null;
    } else {
      return null;
    }
    node = parent;
  }
}

function uiImport(program) {
  return program.body.find(
    (statement) =>
      statement.type === 'ImportDeclaration' &&
      statement.source.value === 'ui' &&
      statement.importKind !== 'type',
  );
}

function hasEmptyCell(declaration) {
  return declaration?.specifiers.some(
    (specifier) =>
      specifier.type === 'ImportSpecifier' &&
      specifier.imported.type === 'Identifier' &&
      specifier.imported.name === 'EmptyCell',
  );
}

function importFix(fixer, program) {
  const declaration = uiImport(program);
  if (hasEmptyCell(declaration)) return null;
  if (declaration) {
    const named = declaration.specifiers.filter((s) => s.type === 'ImportSpecifier');
    if (named.length > 0) return fixer.insertTextAfter(named[named.length - 1], ', EmptyCell');
    const only = declaration.specifiers[declaration.specifiers.length - 1];
    if (only) return fixer.insertTextAfter(only, ', { EmptyCell }');
  }
  const imports = program.body.filter((statement) => statement.type === 'ImportDeclaration');
  const last = imports[imports.length - 1];
  return last
    ? fixer.insertTextAfter(last, "\nimport { EmptyCell } from 'ui';")
    : fixer.insertTextBefore(program.body[0], "import { EmptyCell } from 'ui';\n");
}

function meaningfulChildren(element) {
  return element.children.filter((child) => !(child.type === 'JSXText' && !child.value.trim()));
}

export default {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    docs: { description: 'Require EmptyCell for an absent value in a rendered position.' },
    schema: [],
  },
  create(context) {
    const program = context.sourceCode.ast;
    return {
      Literal(node) {
        if (!isMarker(node) || !renderedHost(node)) return;
        context.report({
          node,
          message: MESSAGE,
          fix(fixer) {
            const replacement =
              node.parent.type === 'JSXExpressionContainer' &&
              node.parent.parent.type !== 'JSXAttribute'
                ? fixer.replaceText(node.parent, '<EmptyCell />')
                : fixer.replaceText(node, '<EmptyCell />');
            const add = importFix(fixer, program);
            return add ? [replacement, add] : replacement;
          },
        });
      },
      TemplateLiteral(node) {
        if (!isMarker(node) || !renderedHost(node)) return;
        context.report({ node, message: MESSAGE });
      },
      JSXText(node) {
        if (!MARKERS.has(node.value.trim())) return;
        const host = node.parent;
        if (host?.type === 'JSXElement' && TEXT_ONLY.has(elementName(host.openingElement))) return;
        const children =
          host?.type === 'JSXElement' || host?.type === 'JSXFragment'
            ? meaningfulChildren(host)
            : [];
        // Only a dash that IS the content: `a — b` inside running text is punctuation.
        if (children.length !== 1 || children[0] !== node) return;
        context.report({ node, message: MESSAGE });
      },
    };
  },
};
