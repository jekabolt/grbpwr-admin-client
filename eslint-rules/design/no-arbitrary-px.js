import { classTokens, classValueVisitors } from './class-values.js';

const ARBITRARY_PX = /\[[^\]\s]*-?(?:\d*\.)?\d+px[^\]\s]*\]/u;

export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'Disallow pixel values in arbitrary Tailwind classes.' },
    schema: [],
  },
  create(context) {
    return classValueVisitors((value, node, reportOnce) => {
      for (const token of classTokens(value)) {
        if (!ARBITRARY_PX.test(token)) continue;
        reportOnce(token, () => {
          context.report({
            node,
            message: `Replace "${token}" with a named Tailwind token (for example gap-stack, gap-gutter, p-block, or text-control).`,
          });
        });
      }
    });
  },
};
