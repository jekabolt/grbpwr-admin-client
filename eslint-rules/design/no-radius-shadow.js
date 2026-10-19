import { classTokens, classValueVisitors } from './class-values.js';

function prohibited(token) {
  const utility = token.split(':').at(-1)?.replace(/^!/u, '');
  if (!utility || utility === 'rounded-none' || utility === 'shadow-none') return false;
  return (
    utility === 'rounded' ||
    utility.startsWith('rounded-') ||
    utility === 'shadow' ||
    utility.startsWith('shadow-')
  );
}

export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'Keep application surfaces square and shadowless.' },
    schema: [],
  },
  create(context) {
    return classValueVisitors((value, node, reportOnce) => {
      for (const token of classTokens(value)) {
        if (!prohibited(token)) continue;
        reportOnce(token, () => {
          context.report({
            node,
            message: `Remove "${token}"; use rounded-none/shadow-none or the existing modal/popover primitive.`,
          });
        });
      }
    });
  },
};
